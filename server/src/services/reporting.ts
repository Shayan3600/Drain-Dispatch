import { randomUUID, createHash, createHmac, randomBytes } from "node:crypto";
import { z } from "zod";
import type { Connection, Database, Row } from "../db/database.js";
import { enqueueStatusFollowups } from "../photon/notifications.js";

export const issueType = z.enum([
  "blocked_drain",
  "standing_water",
  "damaged_drain",
  "other",
]);
export const coordinates = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
});
export const reportSchema = coordinates.extend({
  description: z.string().trim().min(5).max(2000),
  issueType,
  locationConfirmed: z.literal(true),
  photoId: z.uuid().optional(),
  idempotencyKey: z.string().min(8).max(150),
});
export const observationSchema = z.object({
  description: z.string().trim().min(5).max(2000),
  photoId: z.uuid().optional(),
  sameLocationConfirmed: z.literal(true),
  idempotencyKey: z.string().min(8).max(150),
});
export class AppError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}
export function incident(r: Row) {
  return {
    id: r.id,
    latitude: r.latitude,
    longitude: r.longitude,
    description: r.description,
    issueType: r.issue_type,
    status: r.status === "pending" ? "pending_review" : r.status,
    isDemo: r.is_demo,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    observationCount: Number(r.observation_count || 0),
    ...(r.has_photo !== undefined ? { hasPhoto: Boolean(r.has_photo) } : {}),
    ...(r.latest_observation_at ? { latestObservationAt: r.latest_observation_at } : {}),
  };
}
export function distanceMeters(
  a: { latitude: number; longitude: number },
  b: { latitude: number; longitude: number },
) {
  const rad = (v: number) => (v * Math.PI) / 180;
  const dlat = rad(b.latitude - a.latitude),
    dlon = rad(b.longitude - a.longitude);
  const n =
    Math.sin(dlat / 2) ** 2 +
    Math.cos(rad(a.latitude)) *
      Math.cos(rad(b.latitude)) *
      Math.sin(dlon / 2) ** 2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(n), Math.sqrt(1 - n));
}
const hash = (value: string) =>
  createHash("sha256").update(value).digest("hex");
export class Reporting {
  constructor(public db: Database) {}
  async list(
    filters: { issueType?: string; status?: string; demo?: boolean; sort?: "created" | "updated" } = {},
  ) {
    const rows = await this.db.query(
      `SELECT i.*,count(o.id)::int observation_count,
       COALESCE(bool_or(o.photo_id IS NOT NULL OR NULLIF(to_jsonb(o)->>'photo_url','') IS NOT NULL),false) has_photo,
       max(o.created_at) latest_observation_at
       FROM incidents i LEFT JOIN observations o ON o.incident_id=i.id
       WHERE ($1::text IS NULL OR i.issue_type=$1) AND ($2::text IS NULL OR i.status=$2 OR ($2='pending_review' AND i.status='pending')) AND ($3::boolean IS NULL OR i.is_demo=$3)
       GROUP BY i.id ORDER BY ${filters.sort === "updated" ? "i.updated_at" : "i.created_at"} DESC,i.id LIMIT 500`,
      [filters.issueType ?? null, filters.status ?? null, filters.demo ?? null],
    );
    return rows.rows.map(incident);
  }
  async detail(id: string) {
    const r = await this.db.query(
      `SELECT i.*,count(o.id)::int observation_count FROM incidents i LEFT JOIN observations o ON o.incident_id=i.id WHERE i.id=$1 GROUP BY i.id`,
      [id],
    );
    if (!r.rows[0]) throw new AppError(404, "NOT_FOUND", "Incident not found.");
    const obs = await this.db.query(
      "SELECT o.*,COALESCE(p.url,to_jsonb(o)->>'photo_url') url,p.assessment FROM observations o LEFT JOIN photos p ON p.id=o.photo_id WHERE o.incident_id=$1 ORDER BY o.created_at DESC",
      [id],
    );
    return {
      ...incident(r.rows[0]),
      observations: obs.rows.map((o) => ({
        id: o.id,
        description: o.description,
        source: o.source,
        createdAt: o.created_at,
        photoUrl: o.url,
        assessment: o.assessment,
      })),
    };
  }
  async nearby(location: {
    latitude: number;
    longitude: number;
    issueType: string;
    demo?: boolean;
  }) {
    const rows = await this.db.query(
      `SELECT i.*,count(o.id)::int observation_count FROM incidents i LEFT JOIN observations o ON o.incident_id=i.id WHERE i.latitude BETWEEN $1-0.0004 AND $1+0.0004 AND i.longitude BETWEEN $2-0.0006 AND $2+0.0006 AND i.issue_type=$3 AND i.status!='closed' AND i.updated_at>now()-interval '30 days' AND i.is_demo=$4 GROUP BY i.id`,
      [location.latitude, location.longitude, location.issueType, location.demo ?? false],
    );
    return rows.rows
      .map((r) => ({
        ...incident(r),
        distanceMeters: distanceMeters(location, {
          latitude: r.latitude,
          longitude: r.longitude,
        }),
      }))
      .filter((r) => r.distanceMeters <= 30)
      .sort((a, b) => a.distanceMeters - b.distanceMeters);
  }
  async event(
    c: Connection,
    id: string,
    eventType: string,
    source: string,
    metadata: object = {},
  ) {
    await c.query(
      "INSERT INTO incident_events(id,incident_id,event_type,source,metadata) VALUES($1,$2,$3,$4,$5)",
      [randomUUID(), id, eventType, source, JSON.stringify(metadata)],
    );
  }
  private async idempotent<T>(
    key: string,
    payload: object,
    fn: (c: Connection) => Promise<T>,
  ) {
    const payloadHash = hash(JSON.stringify(payload));
    return this.db.transaction(async (c) => {
      await c.query(
        "INSERT INTO request_receipts(request_key,payload_hash,result) VALUES($1,$2,$3) ON CONFLICT DO NOTHING",
        [key, payloadHash, "null"],
      );
      const r = (
        await c.query(
          "SELECT * FROM request_receipts WHERE request_key=$1 FOR UPDATE",
          [key],
        )
      ).rows[0];
      if (r.payload_hash !== payloadHash)
        throw new AppError(
          409,
          "RETRY_CONFLICT",
          "This request key was already used for different information.",
        );
      if (r.result !== null) return r.result as T;
      const result = await fn(c);
      await c.query(
        "UPDATE request_receipts SET result=$2 WHERE request_key=$1",
        [key, JSON.stringify(result)],
      );
      return result;
    });
  }
  async create(
    input: z.infer<typeof reportSchema>,
    source = "web",
    sourceMessageId?: string,
    isDemo = false,
  ) {
    return this.idempotent(
      "report:" + input.idempotencyKey,
      { ...input, source },
      async (c) => {
        await this.checkPhoto(c, input.photoId);
        const id = randomUUID();
        const r = await c.query(
          "INSERT INTO incidents(id,latitude,longitude,description,issue_type,is_demo) VALUES($1,$2,$3,$4,$5,$6) RETURNING *",
          [
            id,
            input.latitude,
            input.longitude,
            input.description,
            input.issueType,
            isDemo,
          ],
        );
        await c.query(
          "INSERT INTO observations(id,incident_id,description,source,photo_id,source_message_id) VALUES($1,$2,$3,$4,$5,$6)",
          [
            randomUUID(),
            id,
            input.description,
            source,
            input.photoId ?? null,
            sourceMessageId ?? null,
          ],
        );
        await this.event(c, id, "incident_created", source);
        return { ...incident(r.rows[0]), observationCount: 1 };
      },
    );
  }
  private async checkPhoto(c: Connection, id?: string) {
    if (
      id &&
      !(await c.query("SELECT id FROM photos WHERE id=$1", [id])).rows.length
    )
      throw new AppError(400, "UNKNOWN_PHOTO", "Upload your photo first.");
  }
  async observe(
    id: string,
    input: z.infer<typeof observationSchema>,
    source = "web",
    sourceMessageId?: string,
  ) {
    return this.idempotent(
      "observe:" + input.idempotencyKey,
      { ...input, id, source },
      async (c) => {
        await this.checkPhoto(c, input.photoId);
        const exists = await c.query(
          "SELECT id FROM incidents WHERE id=$1 FOR UPDATE",
          [id],
        );
        if (!exists.rows.length)
          throw new AppError(404, "NOT_FOUND", "Incident not found.");
        const observationId = randomUUID();
        await c.query(
          "INSERT INTO observations(id,incident_id,description,source,photo_id,source_message_id) VALUES($1,$2,$3,$4,$5,$6)",
          [
            observationId,
            id,
            input.description,
            source,
            input.photoId ?? null,
            sourceMessageId ?? null,
          ],
        );
        await c.query("UPDATE incidents SET updated_at=now() WHERE id=$1", [
          id,
        ]);
        await this.event(c, id, "observation_added", source);
        return { id: observationId, incidentId: id };
      },
    );
  }
  async history(id: string) {
    await this.detail(id);
    return (
      await this.db.query(
        "SELECT * FROM incident_events WHERE incident_id=$1 ORDER BY occurred_at DESC",
        [id],
      )
    ).rows.map((r) => ({
      id: r.id,
      eventType: r.event_type,
      source: r.source,
      createdAt: r.occurred_at,
      metadata: r.metadata,
    }));
  }
  async status(id: string, status: string, evidence: string) {
    return this.db.transaction(async (c) => {
      const r = await c.query(
        "SELECT * FROM incidents WHERE id=$1 FOR UPDATE",
        [id],
      );
      if (!r.rows[0])
        throw new AppError(404, "NOT_FOUND", "Incident not found.");
      if (r.rows[0].status === status) return { id, status };
      await c.query(
        "INSERT INTO moderation_history(id,incident_id,previous_status,new_status,actor,evidence) VALUES($1,$2,$3,$4,$5,$6)",
        [
          randomUUID(),
          id,
          r.rows[0].status,
          status,
          "authorized_moderator",
          evidence,
        ],
      );
      await c.query(
        "UPDATE incidents SET status=$2,updated_at=now() WHERE id=$1",
        [id, status],
      );
      await this.event(c, id, "status_changed", "moderator", {
        previousStatus: r.rows[0].status,
        status,
        evidence,
      });
      await enqueueStatusFollowups(c, id, status);
      return { id, status };
    });
  }
  async draft(input: {
    description: string;
    issueType: string;
    photoId?: string;
    sourceMessageId: string;
    token?: string;
    isDemo?: boolean;
  }) {
    const token =
      input.token ??
      (process.env.WORKER_TOKEN
        ? createHmac("sha256", process.env.WORKER_TOKEN)
            .update("api-draft:" + input.sourceMessageId)
            .digest("base64url")
        : randomBytes(32).toString("base64url"));
    const id = randomUUID();
    await this.db.transaction(async (c) => {
      await this.checkPhoto(c, input.photoId);
      await c.query(
        `INSERT INTO report_drafts(id,token_hash,source,description,issue_type,photo_id,source_message_id,expires_at,is_demo) VALUES($1,$2,'imessage',$3,$4,$5,$6,now()+interval '1 hour',$7) ON CONFLICT(source_message_id) DO NOTHING`,
        [
          id,
          hash(token),
          input.description,
          input.issueType,
          input.photoId ?? null,
          input.sourceMessageId,
          input.isDemo ?? false,
        ],
      );
    });
    return { token, expiresInSeconds: 3600 };
  }
  async getDraft(token: string, c: Connection = this.db) {
    const r = (
      await c.query(
        "SELECT d.*,p.url,p.assessment,COALESCE(i.is_demo,d.is_demo) effective_demo FROM report_drafts d LEFT JOIN photos p ON p.id=d.photo_id LEFT JOIN incidents i ON i.id=d.confirmed_incident_id WHERE d.token_hash=$1",
        [hash(token)],
      )
    ).rows[0];
    if (!r || new Date(r.expires_at).getTime() < Date.now())
      throw new AppError(
        410,
        "DRAFT_EXPIRED",
        "This confirmation link has expired. Send RESUME in your private Clearflow iMessage conversation to reopen your latest report without another upload.",
      );
    return {
      id: r.id,
      description: r.description,
      issueType: r.issue_type,
      photoId: r.photo_id ?? undefined,
      photoUrl: r.url ?? undefined,
      assessment: r.assessment ?? undefined,
      expiresAt: r.expires_at,
      confirmedIncidentId: r.confirmed_incident_id,
      isDemo: Boolean(r.effective_demo),
    };
  }
  async confirmDraft(
    token: string,
    input: z.infer<typeof reportSchema> & { existingIncidentId?: string },
  ) {
    // One transaction and a row lock prevents simultaneous confirmation creating two incidents.
    return this.db.transaction(async (c) => {
      const raw = (
        await c.query(
          "SELECT * FROM report_drafts WHERE token_hash=$1 FOR UPDATE",
          [hash(token)],
        )
      ).rows[0];
      const d = await this.getDraft(token, c);
      if (d.confirmedIncidentId) {
        const r = (
          await c.query("SELECT * FROM incidents WHERE id=$1", [
            d.confirmedIncidentId,
          ])
        ).rows[0];
        return incident(r);
      }
      const photoId = input.photoId ?? d.photoId ?? undefined;
      await this.checkPhoto(c, photoId);
      let id = input.existingIncidentId;
      if (id) {
        const r = (
          await c.query("SELECT * FROM incidents WHERE id=$1 FOR UPDATE", [id])
        ).rows[0];
        if (
          !r ||
          distanceMeters(input, {
            latitude: r.latitude,
            longitude: r.longitude,
          }) > 30 ||
          r.issue_type !== input.issueType ||
          Boolean(r.is_demo) !== d.isDemo ||
          r.status === "closed"
        )
          throw new AppError(
            400,
            "INVALID_MATCH",
            "Choose a matching active incident at the confirmed location with the same real or demo classification.",
          );
      } else {
        id = randomUUID();
        await c.query(
          "INSERT INTO incidents(id,latitude,longitude,description,issue_type,is_demo) VALUES($1,$2,$3,$4,$5,$6)",
          [
            id,
            input.latitude,
            input.longitude,
            input.description,
            input.issueType,
            d.isDemo,
          ],
        );
      }
      await c.query(
        "INSERT INTO observations(id,incident_id,description,source,photo_id,source_message_id) VALUES($1,$2,$3,$4,$5,$6)",
        [
          randomUUID(),
          id,
          input.description,
          "imessage",
          photoId ?? null,
          raw.source_message_id,
        ],
      );
      await c.query("UPDATE incidents SET updated_at=now() WHERE id=$1", [id]);
      await this.event(
        c,
        id,
        input.existingIncidentId ? "observation_added" : "incident_created",
        "imessage",
      );
      await c.query(
        "UPDATE report_drafts SET confirmed_incident_id=$2 WHERE token_hash=$1",
        [hash(token), id],
      );
      await c.query(
        "INSERT INTO incident_subscriptions(incident_id,sender_hash,chat_id) SELECT $1,sender_hash,chat_id FROM message_context WHERE source_message_id=$2 ON CONFLICT DO NOTHING",
        [id, raw.source_message_id],
      );
      const r = (
        await c.query(
          "SELECT i.*,count(o.id)::int observation_count FROM incidents i LEFT JOIN observations o ON o.incident_id=i.id WHERE i.id=$1 GROUP BY i.id",
          [id],
        )
      ).rows[0];
      return incident(r);
    });
  }
  async stats() {
    const summary = (
      await this.db.query(
        `SELECT count(*)::int total, count(*) FILTER(WHERE status!='closed')::int active,count(*) FILTER(WHERE status='closed')::int closed FROM incidents WHERE NOT is_demo`,
      )
    ).rows[0];
    const count = (
      await this.db.query(
        "SELECT count(*)::int count FROM observations o JOIN incidents i ON i.id=o.incident_id WHERE NOT i.is_demo",
      )
    ).rows[0];
    const categories = await this.db.query(
      "SELECT issue_type,count(*)::int count FROM incidents WHERE NOT is_demo GROUP BY issue_type",
    );
    const bucket = this.db.timescale
      ? "time_bucket('1 day',e.occurred_at)"
      : "date_trunc('day',e.occurred_at)";
    const trends = await this.db.query(
      `SELECT ${bucket} date,count(*)::int count FROM incident_events e JOIN incidents i ON i.id=e.incident_id WHERE NOT i.is_demo AND e.event_type='incident_created' AND e.occurred_at>now()-interval '30 days' GROUP BY 1 ORDER BY 1`,
    );
    const repeated = await this.db.query(
      "SELECT round(latitude::numeric,4) latitude,round(longitude::numeric,4) longitude,count(*)::int count FROM incidents WHERE NOT is_demo GROUP BY 1,2 HAVING count(*)>1 ORDER BY count(*) DESC LIMIT 10",
    );
    const activityBucket = this.db.timescale
      ? "time_bucket('1 day',a.occurred_at,timezone => 'UTC')"
      : "date_trunc('day',a.occurred_at AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'";
    const period = (await this.db.query("SELECT date_trunc('day',now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC' end_date,now() current_time")).rows[0];
    const endDate = new Date(period.end_date);
    const startDate = new Date(endDate.getTime() - 29 * 86400000);
    // Thirty UTC calendar days including today's partial day. Observations come from
    // their own rows, so an initial submission is counted even without a separate event.
    const activity = await this.db.query(`
      WITH activity AS (
        SELECT e.occurred_at,e.event_type FROM incident_events e
        JOIN incidents i ON i.id=e.incident_id
        WHERE NOT i.is_demo AND e.event_type IN ('incident_created','status_changed')
        UNION ALL
        SELECT o.created_at,'observation_submitted' FROM observations o
        JOIN incidents i ON i.id=o.incident_id WHERE NOT i.is_demo
      )
      SELECT ${activityBucket} date,
        count(*) FILTER(WHERE a.event_type='incident_created')::int incidents,
        count(*) FILTER(WHERE a.event_type='observation_submitted')::int observations,
        count(*) FILTER(WHERE a.event_type='status_changed')::int "statusChanges"
      FROM activity a
      WHERE a.occurred_at >= $1::timestamptz AND a.occurred_at <= $2::timestamptz
      GROUP BY 1 ORDER BY 1
    `,[startDate.toISOString(),period.current_time]);
    return {
      totalIncidents: summary.total,
      activeIncidents: summary.active,
      closedIncidents: summary.closed,
      observationCount: count.count,
      byCategory: categories.rows.map((r) => ({
        issueType: r.issue_type,
        count: r.count,
      })),
      overTime: trends.rows,
      activityOverTime: activity.rows,
      activityPeriod: { bucket: "day", timeZone: "UTC", days: 30, includesCurrentDay: true, startDate: startDate.toISOString(), endDate: endDate.toISOString() },
      repeatedLocations: repeated.rows,
      databaseMode: this.db.mode,
      timeSeriesEnabled: this.db.timescale,
      participationMeasure: "Observation submissions; not unique people",
    };
  }
}
