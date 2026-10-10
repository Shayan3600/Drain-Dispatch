import { createHmac, randomBytes, randomUUID } from "node:crypto";
import { openDatabase, type Database } from "../src/db/database.js";
import { Reporting } from "../src/services/reporting.js";
import { processIncoming, type IncomingMessage } from "../src/photon/handler.js";

// Generated senders and historical offsets are synthetic. This never calls a messaging provider.
const secret = randomBytes(32).toString("hex");
const senderA = "synthetic-sender-" + randomUUID();
const senderB = "synthetic-sender-" + randomUUID();
const options = { secret, appUrl: "https://verification.example" };
const key = (value: string) => createHmac("sha256", secret).update(value).digest("hex");
const messageIds: string[] = [], requestKeys: string[] = [], incidentIds: string[] = [];
const output: Record<string, boolean | string> = { fixtureKind: "two generated synthetic sender identities; no real people or provider sends" };
let database: Database | undefined;
let phase = "database";
try {
  database = await openDatabase();
  if (database.mode !== "postgresql" || !database.timescale) throw new Error("CLOUD_TIMESCALE_REQUIRED");
  const reporting = new Reporting(database);
  const before = await reporting.stats();
  const send = async (senderId: string, text: string) => {
    const id = "synthetic-message-" + randomUUID();
    messageIds.push(id);
    const input: IncomingMessage = { id, senderId, text, chatId: senderId + "-private-chat" };
    const reply = await processIncoming(input, reporting, options);
    return { input, reply, sourceId: "photon-" + key("message:" + id) };
  };
  phase = "synthetic-initial-report";
  const first = await send(senderA, "REPORT DEMO: Synthetic sender A documents visible leaves at a fixture drain.");
  const initialKey = "synthetic-report-" + randomUUID();
  requestKeys.push("report:" + initialKey);
  // Explicit fixture creation starts as demo, so it can never inflate real dashboard totals.
  const firstIncident = await reporting.create({ latitude: 0, longitude: 0,
    description: "DEMO: Synthetic sender A fixture; no real drain observation or person.",
    issueType: "blocked_drain", locationConfirmed: true, idempotencyKey: initialKey }, "imessage", first.sourceId, true);
  incidentIds.push(firstIncident.id);
  phase = "nearby-and-explicit-confirmation";
  const candidates = await reporting.nearby({ latitude: 0.0001, longitude: 0.0001, issueType: "blocked_drain" });
  output.sameThirtyMeterCandidate = candidates.some(candidate => candidate.id === firstIncident.id && candidate.distanceMeters > 0 && candidate.distanceMeters <= 30);
  const nearby = await send(senderB, "NEARBY 0.0001 0.0001 blocked_drain");
  output.nearbyRequiresPhysicalConfirmation = nearby.reply.responseText.includes("confirm the same physical drain");
  const unconfirmed = await send(senderB, `OBSERVE ${firstIncident.id} DEMO: Same drain fixture`);
  output.unconfirmedObservationNotPublished = unconfirmed.reply.responseText.includes("No observation has been posted yet") && (await reporting.detail(firstIncident.id)).observationCount === 1;
  const second = await send(senderB, `OBSERVE ${firstIncident.id} CONFIRM DEMO: Synthetic sender B explicitly confirms this fixture drain.`);
  requestKeys.push("observe:" + second.sourceId);
  const replay = await processIncoming(second.input, new Reporting(database), options);
  const detail = await reporting.detail(firstIncident.id);
  output.twoObservationsOneIncident = detail.observationCount === 2 && detail.observations.every(observation => observation.source === "imessage");
  output.retriedObservationNotDuplicated = replay.responseText === second.reply.responseText && detail.observationCount === 2;
  const attribution = await database.query("SELECT count(*)::int submissions,count(DISTINCT c.sender_hash)::int synthetic_senders FROM observations o JOIN message_context c ON c.source_message_id=o.source_message_id WHERE o.incident_id=$1", [firstIncident.id]);
  output.twoSyntheticSenderAttributions = attribution.rows[0]?.submissions === 2 && attribution.rows[0]?.synthetic_senders === 2;
  const publicPayload = JSON.stringify(detail);
  output.publicDetailKeepsIdentitiesPrivate = ![senderA,senderB,key("sender:" + senderA),key("sender:" + senderB),first.sourceId,second.sourceId].some(privateValue => publicPayload.includes(privateValue));
  const participation = await reporting.stats();
  output.participationCountsSubmissionsNotPeople = participation.participationMeasure === "Observation submissions; not unique people";
  phase = "independent-duplicate-fixture";
  const independent = await send(senderB, "REPORT DEMO: Independent nearby fixture deliberately does not select an existing incident.");
  const duplicateKey = "synthetic-report-" + randomUUID();
  requestKeys.push("report:" + duplicateKey);
  const duplicate = await reporting.create({ latitude: 0.0001, longitude: 0.0001,
    description: "DEMO: Independent synthetic nearby report; explicit matching was not selected.",
    issueType: "blocked_drain", locationConfirmed: true, idempotencyKey: duplicateKey }, "imessage", independent.sourceId, true);
  incidentIds.push(duplicate.id);
  output.proximityNeverAutomaticallyMerges = duplicate.id !== firstIncident.id && (await reporting.detail(firstIncident.id)).observationCount === 2;
  phase = "event-time-series";
  await reporting.status(firstIncident.id,"under_review","DEMO: Synthetic review evidence, not a real inspection.");
  // Move only this invocation's observation event to a labeled simulated prior day.
  await database.query("UPDATE incident_events SET occurred_at=now()-interval '1 day' WHERE incident_id=$1 AND event_type='observation_added'", [firstIncident.id]);
  const history = await reporting.history(firstIncident.id);
  output.completeHistory = history.length === 3 && ["incident_created","observation_added","status_changed"].every(event => history.some(item => item.eventType === event));
  const buckets = await database.query("SELECT time_bucket('1 day',occurred_at) bucket,count(*)::int events FROM incident_events WHERE incident_id=$1 GROUP BY 1 ORDER BY 1", [firstIncident.id]);
  output.twoSyntheticDayBuckets = buckets.rows.length === 2 && buckets.rows.reduce((total,row) => total + row.events,0) === 3;
  const excluded = await database.query("SELECT count(*)::int count FROM incidents WHERE id=ANY($1::uuid[]) AND NOT is_demo", [incidentIds]);
  output.allFixturesExcludedFromRealTotals = excluded.rows[0]?.count === 0;
  const after = await reporting.stats();
  output.realAnalyticsUnchanged = JSON.stringify(before) === JSON.stringify(after);
  output.completed = Object.entries(output).filter(([name]) => name !== "fixtureKind").every(([,value]) => value === true);
  if (!output.completed) process.exitCode = 1;
} catch { output.completed = false; output.failedPhase = phase; process.exitCode = 1; }
finally {
  try {
    if (database) await database.transaction(async connection => {
      const sources = messageIds.map(id => "photon-" + key("message:" + id));
      const receiptIds = messageIds.map(id => key("message:" + id));
      // A failed reply can still leave a committed observation receipt; include every generated message key.
      const possibleObservationReceipts = sources.map(source => "observe:" + source);
      await connection.query("DELETE FROM notification_outbox WHERE incident_id=ANY($1::uuid[])", [incidentIds]);
      await connection.query("DELETE FROM incident_subscriptions WHERE incident_id=ANY($1::uuid[])", [incidentIds]);
      await connection.query("DELETE FROM report_drafts WHERE source_message_id=ANY($1::text[])", [sources]);
      await connection.query("DELETE FROM incident_events WHERE incident_id=ANY($1::uuid[])", [incidentIds]);
      await connection.query("DELETE FROM observations WHERE incident_id=ANY($1::uuid[])", [incidentIds]);
      await connection.query("DELETE FROM moderation_history WHERE incident_id=ANY($1::uuid[])", [incidentIds]);
      await connection.query("DELETE FROM incidents WHERE id=ANY($1::uuid[]) AND is_demo=true", [incidentIds]);
      await connection.query("DELETE FROM request_receipts WHERE request_key=ANY($1::text[])", [[...requestKeys,...possibleObservationReceipts]]);
      await connection.query("DELETE FROM message_context WHERE source_message_id=ANY($1::text[])", [sources]);
      await connection.query("DELETE FROM message_receipts WHERE message_id=ANY($1::text[])", [receiptIds]);
      output.syntheticFixtureRecordsRemoved = true;
    });
  } catch { output.syntheticFixtureRecordsRemoved = false; output.completed = false; process.exitCode = 1; }
  try { await database?.close(); } catch { output.completed = false; process.exitCode = 1; }
  console.log(JSON.stringify(output));
}
