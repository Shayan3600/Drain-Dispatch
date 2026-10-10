import { randomUUID } from "node:crypto";
import type { Connection, Database } from "../db/database.js";

export interface Followup {
  id: string;
  chatId: string;
  responseText: string;
  leaseToken: string;
}

/** Private routing is never returned by public incident APIs. Subscription alone never grants consent. */
export async function subscribe(
  c: Connection,
  incidentId: string,
  sourceMessageId: string,
): Promise<void> {
  await c.query(
    `INSERT INTO incident_subscriptions(incident_id,sender_hash,chat_id)
    SELECT $1,sender_hash,chat_id FROM message_context WHERE source_message_id=$2
    ON CONFLICT DO NOTHING`,
    [incidentId, sourceMessageId],
  );
}

export async function revokePendingFollowups(
  c: Connection,
  senderHash: string,
): Promise<void> {
  await c.query(
    `UPDATE notification_outbox SET cancelled_at=now(),lease_token=NULL,lease_expires_at=NULL
    WHERE sender_hash=$1 AND delivered_at IS NULL AND cancelled_at IS NULL`,
    [senderHash],
  );
}

/** Enqueue within the same transaction as an authorized status change. */
export async function enqueueStatusFollowups(
  c: Connection,
  incidentId: string,
  status: string,
): Promise<number> {
  const label = (
    {
      pending_review: "pending community review",
      under_review: "under review by a DrainDispatch moderator",
      closed: "closed with follow-up evidence",
    } as Record<string, string>
  )[status];
  if (!label) throw new Error("Unsupported follow-up status");
  const responseText = `DrainDispatch update for incident ${incidentId}: ${label}. This is a community review status, not confirmation of municipal action or a repair. Review the incident on the dashboard for supporting evidence. Send STOP to withdraw follow-up consent.`;
  const subscribers = await c.query(
    `SELECT s.sender_hash,s.chat_id FROM incident_subscriptions s
    JOIN messaging_preferences p ON p.sender_hash=s.sender_hash
    WHERE s.incident_id=$1 AND p.follow_up_consent=true FOR SHARE OF p`,
    [incidentId],
  );
  for (const row of subscribers.rows) {
    await c.query(
      `INSERT INTO notification_outbox(id,incident_id,sender_hash,chat_id,response_text)
      VALUES($1,$2,$3,$4,$5)`,
      [randomUUID(), incidentId, row.sender_hash, row.chat_id, responseText],
    );
  }
  return subscribers.rows.length;
}

/** Row locks and short leases ensure two workers cannot claim the same outstanding delivery. */
export async function claimFollowups(db: Database): Promise<Followup[]> {
  return db.transaction(async (c) => {
    const rows =
      await c.query(`SELECT n.id,n.chat_id,n.response_text FROM notification_outbox n
      JOIN messaging_preferences p ON p.sender_hash=n.sender_hash
      WHERE n.delivered_at IS NULL AND n.cancelled_at IS NULL AND p.follow_up_consent=true
      AND (n.lease_expires_at IS NULL OR n.lease_expires_at<now())
      ORDER BY n.created_at LIMIT 10 FOR UPDATE OF n SKIP LOCKED`);
    const followups: Followup[] = [];
    for (const row of rows.rows) {
      const leaseToken = randomUUID();
      await c.query(
        `UPDATE notification_outbox SET lease_token=$2,lease_expires_at=now()+interval '2 minutes',attempts=attempts+1 WHERE id=$1`,
        [row.id, leaseToken],
      );
      followups.push({
        id: row.id,
        chatId: row.chat_id,
        responseText: row.response_text,
        leaseToken,
      });
    }
    return followups;
  });
}

/** Recheck consent just before the external send; STOP invalidates previously issued leases. */
export async function authorizeFollowup(
  db: Database,
  id: string,
  leaseToken: string,
): Promise<boolean> {
  const result = await db.query(
    `SELECT n.id FROM notification_outbox n JOIN messaging_preferences p ON p.sender_hash=n.sender_hash
    WHERE n.id=$1 AND n.lease_token=$2 AND n.lease_expires_at>now()
    AND n.delivered_at IS NULL AND n.cancelled_at IS NULL AND p.follow_up_consent=true`,
    [id, leaseToken],
  );
  return result.rows.length === 1;
}

export async function acknowledgeFollowup(
  db: Database,
  id: string,
  leaseToken: string,
): Promise<boolean> {
  const result = await db.query(
    `UPDATE notification_outbox SET delivered_at=now(),lease_token=NULL,lease_expires_at=NULL
    WHERE id=$1 AND lease_token=$2 AND delivered_at IS NULL AND cancelled_at IS NULL RETURNING id`,
    [id, leaseToken],
  );
  return result.rows.length === 1;
}
