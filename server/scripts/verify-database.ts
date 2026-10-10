import { randomUUID } from "node:crypto";
import pg from "pg";
import { resolveDatabaseConfig } from "../src/config.js";
import { openDatabase, type Database } from "../src/db/database.js";
import { Reporting } from "../src/services/reporting.js";

// This probe prints only status flags. It never prints credentials, URLs, or provider errors.
const result: Record<string, boolean | string> = {};
let db: Database | undefined;
let incidentId: string | undefined;
const reportKey = "cloud-verification-" + randomUUID();
const observationKey = "cloud-verification-" + randomUUID();
let phase = "configuration";
const applicationTables = ["incidents", "photos", "observations", "incident_events", "report_drafts", "request_receipts", "message_receipts", "moderation_history", "messaging_preferences", "message_context", "incident_subscriptions", "notification_outbox"];
const preservationQueries: string[] = [];
const preservedFingerprints: string[] = [];
try {
  const configuration = resolveDatabaseConfig(process.env);
  if (!configuration) throw new Error("NO_CLOUD_CONFIGURATION");
  phase = "authentication";
  const client = new pg.Client({ ...configuration, connectionTimeoutMillis: 10000 });
  try {
    await client.connect();
    const tls = await client.query("SELECT ssl FROM pg_stat_ssl WHERE pid=pg_backend_pid()");
    result.authenticated = true;
    result.tlsEnabled = tls.rows[0]?.ssl === true;
    // Fingerprint only the pre-upgrade columns, entirely inside PostgreSQL; no row values are printed.
    for (const table of applicationTables) {
      const columns = await client.query("SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name=$1 ORDER BY ordinal_position", [table]);
      if (!columns.rows.length) continue;
      const fields = columns.rows.map(row => '"' + String(row.column_name).replaceAll('"', '""') + '"').join(",");
      const sql = `SELECT count(*)::text row_count,md5(coalesce(string_agg(md5(row_to_json(t)::text),'' ORDER BY md5(row_to_json(t)::text)),'')) fingerprint FROM (SELECT ${fields} FROM "${table}") t`;
      preservationQueries.push(sql);
      preservedFingerprints.push(JSON.stringify((await client.query(sql)).rows));
    }
  } finally { await client.end(); }
  phase = "migration";
  db = await openDatabase();
  result.cloudDatabase = db.mode === "postgresql";
  result.timescaleExtension = db.timescale;
  result.existingDataPreserved = true;
  for (let index = 0; index < preservationQueries.length; index++)
    if (JSON.stringify((await db.query(preservationQueries[index])).rows) !== preservedFingerprints[index]) result.existingDataPreserved = false;
  const copiedSources = await db.query("SELECT count(*)::int count FROM information_schema.columns WHERE table_schema='public' AND table_name='observations' AND column_name='source_event_id'");
  if (copiedSources.rows[0]?.count) {
    const mismatch = await db.query("SELECT 1 FROM observations WHERE source_event_id IS NOT NULL AND source_message_id IS DISTINCT FROM source_event_id LIMIT 1");
    result.legacySourceIdsPreserved = mismatch.rows.length === 0;
  }
  if (db.timescale) {
    const hypertable = await db.query("SELECT 1 FROM timescaledb_information.hypertables WHERE hypertable_schema='public' AND hypertable_name='incident_events'");
    result.eventHypertable = hypertable.rows.length === 1;
    const bucket = await db.query("SELECT time_bucket('1 day', now()) AS bucket");
    result.timeBucket = !!bucket.rows[0]?.bucket;
  }
  phase = "reporting";
  const service = new Reporting(db);
  phase = "baseline-analytics";
  const before = await service.stats();
  const input = {
    latitude: 35.9141, longitude: -79.0544,
    description: "DEMO: Temporary automated cloud persistence verification. This is not a real drain report.",
    issueType: "other" as const, locationConfirmed: true as const, idempotencyKey: reportKey,
  };
  phase = "create-demo-report";
  const report = await service.create(input, "demo", undefined, true);
  incidentId = report.id;
  const retried = await service.create(input, "demo", undefined, true);
  result.idempotentReport = retried.id === report.id;
  await service.observe(report.id, { description: "DEMO: Temporary repeated-observation verification.", sameLocationConfirmed: true, idempotencyKey: observationKey }, "demo");
  await service.status(report.id, "under_review", "DEMO: Temporary moderation verification, not field review.");
  const after = await service.stats();
  result.demoExcludedFromActivity = JSON.stringify(before) === JSON.stringify(after);
  phase = "reconnect";
  await db.close();
  db = undefined;
  db = await openDatabase();
  const persisted = await new Reporting(db).detail(report.id);
  const events = await new Reporting(db).history(report.id);
  result.persistedAfterReconnect = persisted.id === report.id && persisted.isDemo === true && persisted.status === "under_review";
  result.observationsPersisted = persisted.observationCount === 2;
  result.eventsPersisted = events.length === 3;
  result.completed = Object.values(result).every(value => value === true);
} catch (error) {
  result.completed = false;
  result.failedPhase = phase;
  const code = (error as { code?: unknown })?.code;
  // Only a narrow set of generic network/auth/database categories can leave this process.
  if (typeof code === "string" && (/^[0-9A-Z]{5}$/.test(code) || /^(ENOTFOUND|ETIMEDOUT|ECONNREFUSED|ECONNRESET|CERT_HAS_EXPIRED|UNABLE_TO_VERIFY_LEAF_SIGNATURE|DEPTH_ZERO_SELF_SIGNED_CERT|DATABASE_CONFIGURATION|DATABASE_INITIALIZATION_FAILED)$/.test(code))) result.errorCode = code;
  process.exitCode = 1;
} finally {
  try {
    if (incidentId && !db) db = await openDatabase();
    if (db && incidentId) {
      await db.transaction(async connection => {
        // Delete only the UUID and idempotency keys generated by this invocation.
        await connection.query("DELETE FROM incident_events WHERE incident_id=$1", [incidentId]);
        await connection.query("DELETE FROM observations WHERE incident_id=$1", [incidentId]);
        await connection.query("DELETE FROM moderation_history WHERE incident_id=$1", [incidentId]);
        await connection.query("DELETE FROM incidents WHERE id=$1 AND is_demo=true", [incidentId]);
        await connection.query("DELETE FROM request_receipts WHERE request_key IN ($1,$2)", ["report:" + reportKey, "observe:" + observationKey]);
      });
      result.temporaryRecordsRemoved = true;
    }
  } catch { result.temporaryRecordsRemoved = false; process.exitCode = 1; }
  try { await db?.close(); } catch { process.exitCode = 1; }
  console.log(JSON.stringify(result));
}
