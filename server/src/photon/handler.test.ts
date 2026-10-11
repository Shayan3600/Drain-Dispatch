import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createHmac, randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import type { Message } from "spectrum-ts";
import type { Database } from "../db/database.js";
import { Reporting } from "../services/reporting.js";
import { processIncoming, type HandlerOptions } from "./handler.js";
import { forwardToApi, normalizeProviderMessage, incomingErrorResponse } from "./worker.js";

const secret = "test-worker-secret-at-least-24-characters";
const options = { secret, appUrl: "https://drain.example" };
const senderId = "+15550001111";

test("iPhone HEIC and undeclared oversized provider streams fail with actionable guidance and cancellation", async () => {
  const event = (content: object) => ({ id: "attachment-limits", direction: "inbound", sender: { id: senderId }, space: { type: "dm", id: "synthetic-direct-chat" }, content }) as unknown as Message;
  await assert.rejects(normalizeProviderMessage(event({ type: "attachment", mimeType: "image/heic" })), /JPEG\/PNG screenshot.*Most Compatible/);
  let cancelled = false;
  const stream = new ReadableStream({ start(controller) { controller.enqueue(Buffer.alloc(8 * 1024 * 1024 + 1)); }, cancel() { cancelled = true; } });
  await assert.rejects(normalizeProviderMessage(event({ type: "attachment", mimeType: "image/jpeg", stream: async () => stream })), /8 MB/);
  assert.equal(cancelled, true);
});

test("provider errors cannot expose secret-bearing SDK details in a reply", async () => {
  const privateDetail = "credential-or-private-provider-detail";
  const event = {
    id: "private-error-test", direction: "inbound", sender: { id: senderId }, space: { type: "dm", id: "synthetic-direct-chat" },
    content: { type: "attachment", mimeType: "image/jpeg", stream: async () => { throw new Error(privateDetail); } },
  } as unknown as Message;
  try { await normalizeProviderMessage(event); assert.fail("Expected provider failure"); }
  catch (error) {
    const reply = incomingErrorResponse(error);
    assert.equal(reply.includes(privateDetail), false);
    assert.match(reply, /attachment could not be read/);
  }
  assert.match(incomingErrorResponse(new Error("Photographs must be 8 MB or smaller. private detail")), /attachment could not be read/);
});
let engine: PGlite;
let reporting: Reporting;

test("group reporting is rejected before attachment reads or private draft creation", async () => {
  let reads = 0;
  const group = provider({ type: "attachment", mimeType: "image/jpeg", stream: async () => { reads++; return new ReadableStream(); } }, { space: { type: "group", id: "synthetic-group" } });
  await assert.rejects(normalizeProviderMessage(group), /private conversation/);
  assert.equal(reads, 0);
  const before = (await reporting.db.query("SELECT count(*)::int count FROM report_drafts")).rows[0].count;
  let imageOperations = 0;
  const reply = await processIncoming({ id: "group-report-refused", senderId: "synthetic-group-sender", text: "REPORT Synthetic group evidence", photo: Buffer.from("synthetic-photo") }, reporting, { ...options, images: {
    sanitize: async bytes => { imageOperations++; return { bytes, mimeType: "image/jpeg" }; },
    store: async () => { imageOperations++; return { url: "https://images.example/group-fixture.jpg", storageKey: "synthetic-group" }; },
    analyze: async () => { imageOperations++; throw new Error("Synthetic analysis unavailable"); },
  } });
  assert.match(reply.responseText, /private conversation/);
  assert.equal(reply.responseText.includes("/confirm/"), false);
  assert.equal(imageOperations, 0);
  assert.equal((await reporting.db.query("SELECT count(*)::int count FROM report_drafts")).rows[0].count, before);
});

test("one attachment deadline bounds opening and stalled reading and cancels late streams", async () => {
  let readCancelled = false;
  const stalled = new ReadableStream({ cancel() { readCancelled = true; } });
  await assert.rejects(normalizeProviderMessage(provider({ type: "attachment", mimeType: "image/jpeg", stream: async () => stalled }), { attachmentTimeoutMs: 20 }), /download took too long/);
  assert.equal(readCancelled, true);
  let lateCancelled = false;
  let release!: (stream: ReadableStream) => void;
  const opening = new Promise<ReadableStream>(resolve => { release = resolve; });
  await assert.rejects(normalizeProviderMessage(provider({ type: "attachment", mimeType: "image/jpeg", stream: () => opening }), { attachmentTimeoutMs: 20 }), /download took too long/);
  release(new ReadableStream({ cancel() { lateCancelled = true; } }));
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(lateCancelled, true);
  assert.equal((await normalizeProviderMessage(provider({ type: "text", text: "HELP" })))?.text, "HELP", "the next message remains processable");
});

test("explicit REPORT DEMO classification survives confirmation and keeps test evidence out of real metrics", async () => {
  const before = await reporting.stats();
  const response = await processIncoming({ id: "explicit-demo-draft", senderId, chatId: "synthetic-direct-chat", text: "REPORT DEMO: Synthetic leaves at a grate" }, reporting, options);
  const token = response.responseText.match(/\/confirm\/([a-f0-9]+)/)?.[1];
  assert.ok(token);
  assert.equal((await reporting.getDraft(token)).isDemo, true);
  const saved = await reporting.confirmDraft(token, { latitude: 1, longitude: 1, description: "Synthetic confirmed demonstration", issueType: "blocked_drain", locationConfirmed: true, idempotencyKey: randomUUID() });
  assert.equal(saved.isDemo, true);
  assert.deepEqual(await reporting.stats(), before);
});

test("RESUME is sender-scoped, rotates an expired token, preserves confirmed photo evidence, and replays retries", async () => {
  const owner = "resume-test-owner";
  const messageId = "resume-source-photo";
  const imageOptions: HandlerOptions = { ...options, images: {
    sanitize: async bytes => ({ bytes, mimeType: "image/jpeg" }),
    store: async () => ({ url: "https://images.example/resume-evidence.jpg", storageKey: "resume-preserved-photo" }),
    analyze: async () => ({ drainVisible: true, suggestedCategory: "blocked_drain", visibleEvidence: "Leaves are visible over the grate.", humanReviewRecommended: true, uncertainty: "medium" }),
  } };
  const initial = await processIncoming({ id: messageId, senderId: owner, chatId: "resume-private-chat", text: "REPORT Leaves are visible at this grate", photo: Buffer.from("resume-test-photo") }, reporting, imageOptions);
  const oldToken = initial.responseText.match(/\/confirm\/([a-zA-Z0-9_-]+)/)?.[1];
  assert.ok(oldToken);
  const prior = await reporting.getDraft(oldToken);
  const groupReply = await processIncoming({ id: "resume-group-request", senderId: owner, text: "RESUME" }, reporting, options);
  assert.match(groupReply.responseText, /private conversation/);
  assert.equal(groupReply.responseText.includes("/confirm/"), false);
  assert.equal((await reporting.getDraft(oldToken)).id, prior.id);
  const foreign = await processIncoming({ id: "resume-other-person", senderId: "unrelated-sender", chatId: "resume-private-chat", text: "RESUME" }, reporting, options);
  assert.match(foreign.responseText, /No report draft belongs to this messaging identity/);
  assert.equal(foreign.responseText.includes("/confirm/"), false);
  assert.equal((await reporting.getDraft(oldToken)).id, prior.id);
  const confirmed = await reporting.confirmDraft(oldToken, { latitude: 35.924, longitude: -79.05, description: prior.description, issueType: "blocked_drain", locationConfirmed: true, idempotencyKey: randomUUID() });
  const before = (await reporting.list()).length;
  await reporting.db.query("UPDATE report_drafts SET expires_at=now()-interval '1 minute' WHERE id=$1", [prior.id]);
  await assert.rejects(reporting.getDraft(oldToken), /expired/);
  const incoming = { id: "resume-request", senderId: owner, chatId: "resume-private-chat", text: "RESUME" };
  const activeOptions = { ...options, appUrl: "https://fresh-preview.example" };
  const resumed = await Promise.all([processIncoming(incoming, new Reporting(reporting.db), activeOptions), processIncoming(incoming, new Reporting(reporting.db), activeOptions)]);
  assert.deepEqual(resumed[0], resumed[1]);
  assert.match(resumed[0]!.responseText, /https:\/\/fresh-preview\.example\/confirm\//);
  assert.match(resumed[0]!.responseText, /confirmed report inspection/);
  const newToken = resumed[0]!.responseText.match(/\/confirm\/([a-zA-Z0-9_-]+)/)?.[1];
  assert.ok(newToken);
  assert.notEqual(newToken, oldToken);
  const recovered = await reporting.getDraft(newToken);
  assert.equal(recovered.id, prior.id);
  assert.equal(recovered.photoId, prior.photoId);
  assert.equal(recovered.photoUrl, prior.photoUrl);
  assert.deepEqual(recovered.assessment, prior.assessment);
  assert.equal(recovered.confirmedIncidentId, confirmed.id);
  assert.ok(new Date(recovered.expiresAt).getTime() > Date.now() + 3500 * 1000);
  await assert.rejects(reporting.getDraft(oldToken), /expired/);
  assert.deepEqual(await processIncoming(incoming, new Reporting(reporting.db), activeOptions), resumed[0]);
  assert.equal((await reporting.list()).length, before);
});

test("RESUME selects only the latest pending draft for its sender and creates no public incident", async () => {
  const owner = "pending-resume-owner";
  await processIncoming({ id: "older-pending-resume-report", senderId: owner, chatId: "pending-resume-chat", text: "REPORT An older observation awaiting location confirmation" }, reporting, options);
  const original = await processIncoming({ id: "pending-resume-report", senderId: owner, chatId: "pending-resume-chat", text: "REPORT An observation awaiting location confirmation" }, reporting, options);
  const token = original.responseText.match(/\/confirm\/([a-zA-Z0-9_-]+)/)?.[1];
  assert.ok(token);
  const originalDraft = await reporting.getDraft(token);
  const before = (await reporting.list()).length;
  const result = await processIncoming({ id: "pending-resume-request", senderId: owner, chatId: "pending-resume-chat", text: "RESUME" }, reporting, options);
  assert.match(result.responseText, /location confirmation and review/);
  const resumedToken = result.responseText.match(/\/confirm\/([a-zA-Z0-9_-]+)/)?.[1];
  assert.ok(resumedToken);
  const draft = await reporting.getDraft(resumedToken);
  assert.equal(draft.id, originalDraft.id);
  assert.equal(draft.confirmedIncidentId, null);
  assert.equal((await reporting.list()).length, before);
});

test("confirmed photo observation attaches evidence to the existing incident and retried delivery adds it once", async () => {
  const original = await reporting.create({ latitude: 35.9201, longitude: -79.051, description: "Drain observation awaiting further evidence", issueType: "blocked_drain", locationConfirmed: true, idempotencyKey: randomUUID() });
  let stores = 0;
  const photoOptions: HandlerOptions = { ...options, images: {
    sanitize: async bytes => ({ bytes, mimeType: "image/jpeg" }),
    store: async () => { stores++; return { url: "https://images.example/followup.jpg", storageKey: "followup-photo" }; },
    analyze: async () => ({ drainVisible: true, suggestedCategory: "blocked_drain", visibleEvidence: "Leaves remain visible on the grate.", humanReviewRecommended: true, uncertainty: "medium" }),
  } };
  const incoming = { id: "photo-observe-confirm", senderId, chatId: "synthetic-direct-chat", text: `OBSERVE ${original.id} CONFIRM Leaves remain visible on this same grate`, photo: Buffer.from("mock photo evidence") };
  const before = (await reporting.list()).length;
  const reply = await processIncoming(incoming, reporting, photoOptions);
  assert.match(reply.responseText, /Observation saved to incident/);
  assert.match(reply.responseText, /AI uncertainty: medium/);
  await processIncoming(incoming, new Reporting(reporting.db), photoOptions);
  const saved = await reporting.detail(original.id);
  assert.equal(saved.observationCount, 2);
  assert.equal(saved.observations[0]?.photoUrl, "https://images.example/followup.jpg");
  assert.equal(saved.observations[0]?.assessment?.uncertainty, "medium");
  assert.equal((await reporting.list()).length, before);
  assert.equal(stores, 1);
});

test("photo OBSERVE without physical-drain confirmation never uploads or posts evidence", async () => {
  let stores = 0;
  const result = await processIncoming({ id: "unconfirmed-photo-observe", senderId, chatId: "synthetic-direct-chat", text: `OBSERVE ${randomUUID()} More leaves`, photo: Buffer.from("mock photo") }, reporting, {
    ...options, images: { sanitize: async bytes => ({ bytes, mimeType: "image/jpeg" }), store: async () => { stores++; throw new Error("Should not store"); }, analyze: async () => { throw new Error("Should not analyze"); } },
  });
  assert.match(result.responseText, /No observation has been posted yet/);
  assert.equal(stores, 0);
});
before(async () => {
  engine = new PGlite();
  await engine.exec(
    await readFile(new URL("../../sql/001_init.sql", import.meta.url), "utf8"),
  );
  const db: Database = {
    mode: "test-postgresql",
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
});
after(async () => {
  await engine?.close();
});

test("HELP and missing description explain explicit location confirmation without creating an incident", async () => {
  const before = (await reporting.list()).length;
  const help = await processIncoming(
    { id: "help", senderId, chatId: "synthetic-direct-chat", text: "HELP" },
    reporting,
    options,
  );
  assert.match(help.responseText, /private link to confirm the location/);
  const empty = await processIncoming(
    { id: "empty-report", senderId, chatId: "synthetic-direct-chat", text: "REPORT" },
    reporting,
    options,
  );
  assert.match(empty.responseText, /confirm the location/);
  assert.equal((await reporting.list()).length, before);
});

test("simulated message creates a private draft; confirmation creates a persistent dashboard incident", async () => {
  const before = (await reporting.list()).length;
  const incoming = {
    id: "text-report",
    senderId, chatId: 'synthetic-direct-chat',
    text: "REPORT Leaves cover this drain grate",
  };
  const reply = await processIncoming(incoming, reporting, options);
  const token = reply.responseText.match(
    /https:\/\/drain\.example\/confirm\/([a-f0-9]+)/,
  )?.[1];
  assert.ok(token);
  const draft = await reporting.getDraft(token);
  assert.equal(draft.description, "Leaves cover this drain grate");
  assert.equal((await reporting.list()).length, before);
  const saved = await reporting.confirmDraft(token, {
    latitude: 35.9132,
    longitude: -79.0558,
    description: draft.description,
    issueType: "blocked_drain",
    locationConfirmed: true,
    idempotencyKey: randomUUID(),
  });
  const found = await reporting.detail(saved.id);
  assert.equal(found.observations[0]?.source, "imessage");
  assert.equal(found.issueType, "blocked_drain");
  assert.equal(found.observationCount, 1);
  const status = await processIncoming(
    { id: "status-1", senderId, chatId: "synthetic-direct-chat", text: `STATUS ${saved.id}` },
    reporting,
    options,
  );
  assert.match(status.responseText, /pending review/);
  assert.match(status.responseText, /not municipal repair confirmations/);
});

test("concurrent provider retries and worker restarts create only one draft and replay the same reply", async () => {
  const incoming = {
    id: "concurrent-report",
    senderId, chatId: 'synthetic-direct-chat',
    text: "REPORT A second drain has leaves",
  };
  const replies = await Promise.all(
    Array.from({ length: 12 }, () =>
      processIncoming(incoming, reporting, options),
    ),
  );
  assert.equal(new Set(replies.map((r) => r.responseText)).size, 1);
  const persistedReply = await processIncoming(
    incoming,
    new Reporting(reporting.db),
    options,
  );
  assert.equal(persistedReply.responseText, replies[0]?.responseText);
  const sourceKey = `photon-${createHmac("sha256", secret).update(`message:${incoming.id}`).digest("hex")}`;
  assert.equal(
    (
      await reporting.db.query(
        "SELECT id FROM report_drafts WHERE source_message_id=$1",
        [sourceKey],
      )
    ).rows.length,
    1,
  );
  await assert.rejects(
    processIncoming(
      { ...incoming, text: "REPORT Different evidence using the same ID" },
      reporting,
      options,
    ),
    /different information/,
  );
});

test("recovery after reply receipt failure preserves the original confirmation link", async () => {
  const incoming = {
    id: "crash-retry",
    senderId, chatId: 'synthetic-direct-chat',
    text: "REPORT Debris around a drain",
  };
  const reply = await processIncoming(incoming, reporting, options);
  const key = createHmac("sha256", secret)
    .update(`message:${incoming.id}`)
    .digest("hex");
  await reporting.db.query(
    "UPDATE message_receipts SET response_text=NULL WHERE message_id=$1",
    [key],
  );
  assert.deepEqual(
    await processIncoming(incoming, new Reporting(reporting.db), options),
    reply,
  );
  assert.equal(
    (
      await reporting.db.query(
        "SELECT id FROM report_drafts WHERE source_message_id=$1",
        [`photon-${key}`],
      )
    ).rows.length,
    1,
  );
});

test("independent handler instances process a simultaneous retry without creating two drafts", async () => {
  const input = {
    id: "multi-instance",
    senderId, chatId: 'synthetic-direct-chat',
    text: "REPORT Litter around the drain grate",
  };
  const replies = await Promise.all([
    processIncoming(input, new Reporting(reporting.db), options),
    processIncoming(input, new Reporting(reporting.db), options),
  ]);
  assert.deepEqual(replies[0], replies[1]);
  const key = createHmac("sha256", secret)
    .update(`message:${input.id}`)
    .digest("hex");
  assert.equal(
    (
      await reporting.db.query(
        "SELECT id FROM report_drafts WHERE source_message_id=$1",
        [`photon-${key}`],
      )
    ).rows.length,
    1,
  );
});

test("photo analysis unavailable still persists photo evidence and creates an editable draft", async () => {
  let sanitized = 0;
  let stored = 0;
  const imageOptions: HandlerOptions = {
    ...options,
    images: {
      sanitize: async (bytes) => {
        sanitized++;
        return { bytes, mimeType: "image/jpeg" };
      },
      store: async () => {
        stored++;
        return {
          url: "https://images.example/persisted.jpg",
          storageKey: "persisted-photo",
        };
      },
      analyze: async () => {
        throw new Error("Credentials unavailable");
      },
    },
  };
  const incoming = {
    id: "photo-report",
    senderId, chatId: 'synthetic-direct-chat',
    text: "",
    photo: Buffer.from("mocked-provider-photo"),
  };
  const reply = await processIncoming(incoming, reporting, imageOptions);
  assert.match(reply.responseText, /Photo saved; AI analysis is unavailable/);
  const token = reply.responseText.match(/\/confirm\/([a-f0-9]+)/)?.[1];
  assert.ok(token);
  const draft = await reporting.getDraft(token);
  assert.equal(draft.photoUrl, "https://images.example/persisted.jpg");
  assert.equal(draft.issueType, "other");
  assert.equal(draft.assessment, undefined);
  await processIncoming(incoming, reporting, imageOptions);
  assert.equal(sanitized, 1);
  assert.equal(stored, 1);
});

test("structured photo findings remain draft suggestions before explicit location confirmation", async () => {
  const reply = await processIncoming(
    {
      id: "analyzed-photo",
      senderId, chatId: 'synthetic-direct-chat',
      text: "My observation",
      photo: Buffer.from("photo"),
    },
    reporting,
    {
      ...options,
      images: {
        sanitize: async (bytes) => ({ bytes, mimeType: "image/jpeg" }),
        store: async () => ({
          url: "https://images.example/analysis.jpg",
          storageKey: "analysis-photo",
        }),
        analyze: async () => ({
          drainVisible: true,
          suggestedCategory: "blocked_drain",
          visibleEvidence: "Leaves are visible over a grate.",
          humanReviewRecommended: true,
          uncertainty: "medium",
        }),
      },
    },
  );
  assert.match(reply.responseText, /uncertainty medium/);
  assert.match(reply.responseText, /No incident is public until you confirm/);
  const token = reply.responseText.match(/\/confirm\/([a-f0-9]+)/)?.[1];
  assert.ok(token);
  const draft = await reporting.getDraft(token);
  assert.equal(draft.description, "My observation");
  assert.equal(draft.issueType, "blocked_drain");
});

test("OBSERVE requires same-drain confirmation and retried confirmed observation is added once", async () => {
  const report = await reporting.create({
    latitude: 35.9135,
    longitude: -79.0558,
    description: "Test incident for community observation",
    issueType: "blocked_drain",
    locationConfirmed: true,
    idempotencyKey: randomUUID(),
  });
  const prompt = await processIncoming(
    {
      id: "observe-unconfirmed",
      senderId, chatId: 'synthetic-direct-chat',
      text: `OBSERVE ${report.id} More leaves are visible`,
    },
    reporting,
    options,
  );
  assert.match(prompt.responseText, /No observation has been posted yet/);
  assert.equal((await reporting.detail(report.id)).observationCount, 1);
  const incoming = {
    id: "observe-confirmed",
    senderId, chatId: 'synthetic-direct-chat',
    text: `OBSERVE ${report.id} CONFIRM More leaves are visible`,
  };
  await Promise.all([
    processIncoming(incoming, reporting, options),
    processIncoming(incoming, reporting, options),
  ]);
  assert.equal((await reporting.detail(report.id)).observationCount, 2);
});

test("NEARBY validates coordinates and returns candidate references without automatic merging", async () => {
  const invalid = await processIncoming(
    { id: "bad-nearby", senderId, chatId: "synthetic-direct-chat", text: "NEARBY 900 -79 blocked_drain" },
    reporting,
    options,
  );
  assert.match(invalid.responseText, /Send NEARBY/);
  const candidates = await processIncoming(
    { id: "nearby", senderId, chatId: "synthetic-direct-chat", text: "NEARBY 35.9132 -79.0558 blocked_drain" },
    reporting,
    options,
  );
  assert.match(
    candidates.responseText,
    /confirm the same physical drain yourself/,
  );
});

test("CONSENT and STOP persist a private hashed identity without exposing phone numbers", async () => {
  await processIncoming(
    { id: "consent", senderId, chatId: "synthetic-direct-chat", text: "CONSENT" },
    reporting,
    options,
  );
  const hash = createHmac("sha256", secret)
    .update(`sender:${senderId}`)
    .digest("hex");
  const consent = (
    await reporting.db.query(
      "SELECT * FROM messaging_preferences WHERE sender_hash=$1",
      [hash],
    )
  ).rows[0];
  assert.equal(consent?.follow_up_consent, true);
  assert.equal(JSON.stringify(consent).includes(senderId), false);
  await processIncoming(
    { id: "stop", senderId, chatId: "synthetic-direct-chat", text: "STOP" },
    reporting,
    options,
  );
  assert.equal(
    (
      await reporting.db.query(
        "SELECT * FROM messaging_preferences WHERE sender_hash=$1",
        [hash],
      )
    ).rows[0]?.follow_up_consent,
    false,
  );
});

function provider(content: unknown, extra: object = {}): Message {
  return {
    id: "provider-event",
    direction: "inbound",
    sender: { id: senderId, __platform: "imessage" },
    space: { type: "dm", id: "synthetic-direct-chat" },
    content,
    ...extra,
  } as Message;
}

test("Spectrum adapter ignores outbound traffic and reads grouped text/photo through capped SDK streams", async () => {
  assert.equal(
    await normalizeProviderMessage(
      provider(
        { type: "text", text: "REPORT Example" },
        { direction: "outbound" },
      ),
    ),
    undefined,
  );
  const photo = Buffer.from("small-photo");
  const grouped = provider({
    type: "group",
    items: [
      provider({ type: "text", text: "REPORT Leaves on grate" }),
      provider({
        type: "attachment",
        id: "photo",
        name: "photo.jpg",
        mimeType: "image/jpeg",
        stream: async () =>
          new ReadableStream({
            start(controller) {
              controller.enqueue(photo);
              controller.close();
            },
          }),
      }),
    ],
  });
  const input = await normalizeProviderMessage(grouped);
  assert.equal(input?.senderId, senderId);
  assert.equal(input?.text, "REPORT Leaves on grate");
  assert.deepEqual(input?.photo, photo);
  await assert.rejects(
    normalizeProviderMessage(
      provider({
        type: "attachment",
        mimeType: "image/jpeg",
        size: 8 * 1024 * 1024 + 1,
      }),
    ),
    /8 MB/,
  );
  await assert.rejects(
    normalizeProviderMessage(
      provider({ type: "attachment", mimeType: "text/html" }),
    ),
    /JPEG, PNG, or WebP/,
  );
});

test("Spectrum forwards message identity and attachment to the protected central API and safely retries", async () => {
  let attempts = 0;
  const request = (async (url: URL | RequestInfo, init?: RequestInit) => {
    attempts++;
    assert.equal(String(url), "http://localhost:3001/api/worker/messages");
    assert.equal(
      (init?.headers as Record<string, string>).Authorization,
      `Bearer ${secret}`,
    );
    const body = JSON.parse(init?.body as string);
    assert.equal(body.senderId, senderId);
    assert.equal(body.photoBase64, Buffer.from("photo").toString("base64"));
    return attempts === 1
      ? new Response("{}", { status: 503 })
      : Response.json({ responseText: "Confirm the location." });
  }) as typeof fetch;
  const result = await forwardToApi(
    {
      id: "sdk-id",
      senderId, chatId: 'synthetic-direct-chat',
      text: "REPORT Example",
      photo: Buffer.from("photo"),
    },
    { apiUrl: "http://localhost:3001", token: secret },
    request,
  );
  assert.equal(result.responseText, "Confirm the location.");
  assert.equal(attempts, 2);
});

test("Spectrum does not repeat permanent API validation failures", async () => {
  let calls = 0;
  const request = (async () => {
    calls++;
    return new Response("{}", { status: 415 });
  }) as typeof fetch;
  await assert.rejects(
    forwardToApi(
      { id: "bad-photo", senderId, chatId: "synthetic-direct-chat", text: "" },
      { apiUrl: "http://localhost:3001", token: secret },
      request,
    ),
    /JPEG, PNG, or WebP/,
  );
  assert.equal(calls, 1);
});
