import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createHmac, randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import type { Message } from "spectrum-ts";
import type { Database } from "../db/database.js";
import { Reporting } from "../services/reporting.js";
import { processIncoming, type HandlerOptions } from "./handler.js";
import { forwardToApi, normalizeProviderMessage } from "./worker.js";

const secret = "test-worker-secret-at-least-24-characters";
const options = { secret, appUrl: "https://drain.example" };
const senderId = "+15550001111";
let engine: PGlite;
let reporting: Reporting;
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
  const help = await processIncoming(
    { id: "help", senderId, text: "HELP" },
    reporting,
    options,
  );
  assert.match(help.responseText, /private link to confirm the location/);
  const empty = await processIncoming(
    { id: "empty-report", senderId, text: "REPORT" },
    reporting,
    options,
  );
  assert.match(empty.responseText, /confirm the location/);
  assert.equal((await reporting.list()).length, 0);
});

test("simulated message creates a private draft; confirmation creates a persistent dashboard incident", async () => {
  const incoming = {
    id: "text-report",
    senderId,
    text: "REPORT Leaves cover this drain grate",
  };
  const reply = await processIncoming(incoming, reporting, options);
  const token = reply.responseText.match(
    /https:\/\/drain\.example\/confirm\/([a-f0-9]+)/,
  )?.[1];
  assert.ok(token);
  const draft = await reporting.getDraft(token);
  assert.equal(draft.description, "Leaves cover this drain grate");
  assert.equal((await reporting.list()).length, 0);
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
    { id: "status-1", senderId, text: `STATUS ${saved.id}` },
    reporting,
    options,
  );
  assert.match(status.responseText, /pending review/);
  assert.match(status.responseText, /not municipal repair confirmations/);
});

test("concurrent provider retries and worker restarts create only one draft and replay the same reply", async () => {
  const incoming = {
    id: "concurrent-report",
    senderId,
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
    senderId,
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
    senderId,
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
    senderId,
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
      senderId,
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
      senderId,
      text: `OBSERVE ${report.id} More leaves are visible`,
    },
    reporting,
    options,
  );
  assert.match(prompt.responseText, /No observation has been posted yet/);
  assert.equal((await reporting.detail(report.id)).observationCount, 1);
  const incoming = {
    id: "observe-confirmed",
    senderId,
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
    { id: "bad-nearby", senderId, text: "NEARBY 900 -79 blocked_drain" },
    reporting,
    options,
  );
  assert.match(invalid.responseText, /Send NEARBY/);
  const candidates = await processIncoming(
    { id: "nearby", senderId, text: "NEARBY 35.9132 -79.0558 blocked_drain" },
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
    { id: "consent", senderId, text: "CONSENT" },
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
    { id: "stop", senderId, text: "STOP" },
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
      senderId,
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
      { id: "bad-photo", senderId, text: "" },
      { apiUrl: "http://localhost:3001", token: secret },
      request,
    ),
    /JPEG, PNG, or WebP/,
  );
  assert.equal(calls, 1);
});
