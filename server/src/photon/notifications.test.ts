import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { createHmac, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import type { Database } from "../db/database.js";
import { Reporting } from "../services/reporting.js";
import { processIncoming } from "./handler.js";
import {
  subscribe,
  enqueueStatusFollowups,
  claimFollowups,
  authorizeFollowup,
  acknowledgeFollowup,
} from "./notifications.js";
import { dispatchFollowups, normalizeProviderMessage } from "./worker.js";
import type { Message } from "spectrum-ts";

let engine: PGlite;
let db: Database;
let reporting: Reporting;
const secret = "notification-test-worker-secret-long";
const senderId = "+15553334444";
const chatId = "private-provider-space-id";
const options = { secret, appUrl: "https://drain.example" };
const senderHash = createHmac("sha256", secret)
  .update(`sender:${senderId}`)
  .digest("hex");
const sourceMessageId = (id: string) =>
  `photon-${createHmac("sha256", secret).update(`message:${id}`).digest("hex")}`;
let incidentId: string;

before(async () => {
  engine = new PGlite();
  await engine.exec(
    await readFile(new URL("../../sql/001_init.sql", import.meta.url), "utf8"),
  );
  db = {
    mode: "test",
    timescale: false,
    query: async (sql, params) => (await engine.query(sql, params)) as any,
    transaction: (fn) =>
      engine.transaction((tx) =>
        fn({
          query: async (sql, params) => (await tx.query(sql, params)) as any,
        }),
      ),
    close: () => engine.close(),
  };
  reporting = new Reporting(db);
  const incident = await reporting.create({
    latitude: 35.9,
    longitude: -79.05,
    description: "Photographed debris near drain grate",
    issueType: "blocked_drain",
    locationConfirmed: true,
    idempotencyKey: randomUUID(),
  });
  incidentId = incident.id;
});
after(async () => {
  await engine?.close();
});

test("reporting never grants consent; subscriptions are private and cannot enqueue until CONSENT", async () => {
  const message = {
    id: "followup-report",
    senderId,
    chatId,
    text: "REPORT Leaves are visible by the grate",
  };
  await processIncoming(message, reporting, options);
  await subscribe(db, incidentId, sourceMessageId(message.id));
  await subscribe(db, incidentId, sourceMessageId(message.id));
  assert.equal(
    (await db.query("SELECT * FROM incident_subscriptions")).rows.length,
    1,
  );
  assert.equal(
    await db.transaction((c) =>
      enqueueStatusFollowups(c, incidentId, "under_review"),
    ),
    0,
  );
  assert.deepEqual(await claimFollowups(db), []);
  const publicIncident = await reporting.detail(incidentId);
  assert.equal(JSON.stringify(publicIncident).includes(chatId), false);
  assert.equal(JSON.stringify(publicIncident).includes(senderId), false);
  await processIncoming(
    { id: "followup-consent", senderId, chatId, text: "CONSENT" },
    reporting,
    options,
  );
  assert.equal(
    await db.transaction((c) =>
      enqueueStatusFollowups(c, incidentId, "under_review"),
    ),
    1,
  );
});

test("outbox leases prevent simultaneous claim and reject the wrong acknowledgement token", async () => {
  const [first, second] = await Promise.all([
    claimFollowups(db),
    claimFollowups(db),
  ]);
  assert.equal(first.length + second.length, 1);
  const item = first[0] ?? second[0];
  assert.ok(item);
  assert.equal(item.chatId, chatId);
  assert.match(item.responseText, /not confirmation of municipal action/);
  assert.equal(await authorizeFollowup(db, item.id, item.leaseToken), true);
  assert.equal(await authorizeFollowup(db, item.id, randomUUID()), false);
  assert.equal(await acknowledgeFollowup(db, item.id, randomUUID()), false);
  assert.equal(await acknowledgeFollowup(db, item.id, item.leaseToken), true);
  assert.deepEqual(await claimFollowups(db), []);
});

test("expired leases retry a failed send and successful acknowledgement removes it from dispatch", async () => {
  await db.transaction((c) => enqueueStatusFollowups(c, incidentId, "closed"));
  const [original] = await claimFollowups(db);
  assert.ok(original);
  await db.query(
    "UPDATE notification_outbox SET lease_expires_at=now()-interval '1 second' WHERE id=$1",
    [original.id],
  );
  const [retried] = await claimFollowups(db);
  assert.ok(retried);
  assert.equal(retried.id, original.id);
  assert.notEqual(retried.leaseToken, original.leaseToken);
  assert.equal(
    await authorizeFollowup(db, original.id, original.leaseToken),
    false,
  );
  assert.equal(
    await acknowledgeFollowup(db, retried.id, retried.leaseToken),
    true,
  );
});

test("STOP cancels already leased updates and later CONSENT does not revive those pending messages", async () => {
  await db.transaction((c) =>
    enqueueStatusFollowups(c, incidentId, "under_review"),
  );
  const [claimed] = await claimFollowups(db);
  assert.ok(claimed);
  await processIncoming(
    { id: "followup-stop", senderId, chatId, text: "STOP" },
    reporting,
    options,
  );
  await processIncoming(
    { id: "followup-consent", senderId, chatId, text: "CONSENT" },
    new Reporting(db),
    options,
  );
  assert.equal(
    (
      await db.query(
        "SELECT follow_up_consent FROM messaging_preferences WHERE sender_hash=$1",
        [senderHash],
      )
    ).rows[0]?.follow_up_consent,
    false,
  );
  assert.equal(
    await authorizeFollowup(db, claimed.id, claimed.leaseToken),
    false,
  );
  assert.equal(
    await acknowledgeFollowup(db, claimed.id, claimed.leaseToken),
    false,
  );
  assert.equal(
    await db.transaction((c) =>
      enqueueStatusFollowups(c, incidentId, "closed"),
    ),
    0,
  );
  await processIncoming(
    { id: "followup-reconsent", senderId, chatId, text: "CONSENT" },
    reporting,
    options,
  );
  assert.deepEqual(await claimFollowups(db), []);
  assert.equal(
    (
      await db.query(
        "SELECT follow_up_consent FROM messaging_preferences WHERE sender_hash=$1",
        [senderHash],
      )
    ).rows[0]?.follow_up_consent,
    true,
  );
});

test("worker rechecks consent immediately before send and acknowledges only successful deliveries", async () => {
  const allowed = {
    id: randomUUID(),
    chatId,
    responseText: "A community review update.",
    leaseToken: randomUUID(),
  };
  const denied = { ...allowed, id: randomUUID(), leaseToken: randomUUID() };
  const failed = { ...allowed, id: randomUUID(), leaseToken: randomUUID() };
  const calls: string[] = [];
  const delivered: string[] = [];
  const request = (async (url: RequestInfo | URL, init?: RequestInit) => {
    const route = new URL(String(url)).pathname;
    calls.push(route);
    assert.equal(
      (init?.headers as Record<string, string>).Authorization,
      `Bearer ${secret}`,
    );
    if (route.endsWith("/followups"))
      return Response.json({ followups: [allowed, denied, failed] });
    if (route.endsWith("/authorize"))
      return Response.json({ authorized: !route.includes(denied.id) });
    if (route.endsWith("/ack")) return Response.json({ acknowledged: true });
    throw new Error("Unexpected route");
  }) as typeof fetch;
  const count = await dispatchFollowups(
    { apiUrl: "https://api.example", token: secret },
    async (item) => {
      if (item.id === failed.id) throw new Error("Mocked provider unavailable");
      delivered.push(item.id);
    },
    request,
  );
  assert.equal(count, 1);
  assert.deepEqual(delivered, [allowed.id]);
  assert.equal(calls.filter((c) => c.endsWith("/ack")).length, 1);
  assert.equal(calls.includes(`/api/worker/followups/${allowed.id}/ack`), true);
});

test("worker routing context is retained for direct messages and excluded from groups", async () => {
  const message = {
    id: "routing",
    direction: "inbound",
    sender: { id: senderId },
    content: { type: "text", text: "HELP" },
    space: { id: chatId, type: "dm" },
  } as unknown as Message;
  assert.equal((await normalizeProviderMessage(message))?.chatId, chatId);
  const group = {
    ...message,
    space: { id: "group-chat", type: "group" },
  } as unknown as Message;
  await assert.rejects(normalizeProviderMessage(group), /private conversation/);
});

test("confirmed Photon draft subscribes its private sender and actual status changes enqueue once", async () => {
  const reply = await processIncoming(
    {
      id: "end-to-end-followup",
      senderId,
      chatId,
      text: "REPORT Debris partially covers this grate",
    },
    reporting,
    options,
  );
  const token = reply.responseText.match(/\/confirm\/([a-f0-9]+)/)?.[1];
  assert.ok(token);
  const report = await reporting.confirmDraft(token, {
    latitude: 35.91,
    longitude: -79.055,
    description: "Debris partially covers this grate",
    issueType: "blocked_drain",
    locationConfirmed: true,
    idempotencyKey: randomUUID(),
  });
  assert.equal(
    (
      await db.query(
        "SELECT sender_hash,chat_id FROM incident_subscriptions WHERE incident_id=$1",
        [report.id],
      )
    ).rows[0]?.sender_hash,
    senderHash,
  );
  await reporting.status(
    report.id,
    "under_review",
    "Moderator is reviewing the submitted photograph.",
  );
  await reporting.status(
    report.id,
    "under_review",
    "Same status repeated by an API retry.",
  );
  assert.equal(
    (
      await db.query(
        "SELECT id FROM notification_outbox WHERE incident_id=$1",
        [report.id],
      )
    ).rows.length,
    1,
  );
  const pending = await claimFollowups(db);
  assert.equal(pending.length, 1);
  assert.equal(
    await authorizeFollowup(db, pending[0]!.id, pending[0]!.leaseToken),
    true,
  );
});
