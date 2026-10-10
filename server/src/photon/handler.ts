import { createHash, createHmac } from "node:crypto";
import { z } from "zod";
import {
  AppError,
  coordinates,
  issueType,
  observationSchema,
  type Reporting,
} from "../services/reporting.js";
import {
  analyzeImage,
  sanitizeImage,
  storeImage,
  type Assessment,
  type SanitizedImage,
  type StoredImage,
} from "../services/images.js";
import { revokePendingFollowups, subscribe } from "./notifications.js";

export interface IncomingMessage {
  id: string;
  senderId: string;
  text: string;
  chatId?: string;
  photo?: Buffer;
}
export interface MessageReply {
  responseText: string;
}
export interface HandlerOptions {
  secret?: string;
  appUrl?: string;
  images?: {
    sanitize(image: Buffer): Promise<SanitizedImage>;
    store(image: SanitizedImage): Promise<StoredImage>;
    analyze(image: SanitizedImage): Promise<Assessment>;
  };
}

const inputSchema = z.object({
  id: z.string().min(1).max(500),
  senderId: z.string().min(1).max(500),
  text: z.string().max(2000),
  chatId: z.string().min(1).max(500).optional(),
});
const help =
  "DrainDispatch organizes community drainage observations. Send REPORT followed by a description, or send a JPEG, PNG, or WebP photo. We will send a private link to confirm the location before publishing. STATUS <incident UUID>; NEARBY <latitude> <longitude> <category>; OBSERVE <incident UUID> CONFIRM <description> (only after checking it is the same drain). Categories: blocked_drain, standing_water, damaged_drain, other. CONSENT enables private follow-up messages about reports you submit; STOP disables them. Follow-ups require the connected Photon worker and are only delivered to private conversations. Stay out of roadways, drains, and floodwater. This is not an emergency service.";
const inFlight = new WeakMap<
  Reporting,
  Map<string, { payloadHash: string; operation: Promise<MessageReply> }>
>();
const keyed = (secret: string, value: string) =>
  createHmac("sha256", secret).update(value).digest("hex");
function photoUuid(key: string) {
  const bytes = createHash("sha256").update(`photo:${key}`).digest();
  bytes[6] = (bytes[6]! & 15) | 64;
  bytes[8] = (bytes[8]! & 63) | 128;
  const hex = bytes.subarray(0, 16).toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** The API calls this shared service; the Spectrum worker never opens a database. */
export async function processIncoming(
  input: IncomingMessage,
  reporting: Reporting,
  options: HandlerOptions = {},
): Promise<MessageReply> {
  inputSchema.parse(input);
  const secret = options.secret ?? process.env.WORKER_TOKEN;
  if (!secret || secret.length < 24)
    throw new AppError(
      503,
      "WORKER_NOT_CONFIGURED",
      "Configure a WORKER_TOKEN of at least 24 characters.",
    );
  const key = keyed(secret, `message:${input.id}`);
  const payloadHash = keyed(
    secret,
    JSON.stringify({
      senderId: input.senderId,
      text: input.text,
      chatId: input.chatId ?? null,
      photo: input.photo
        ? createHash("sha256").update(input.photo).digest("hex")
        : null,
    }),
  );
  let queue = inFlight.get(reporting);
  if (!queue) {
    queue = new Map();
    inFlight.set(reporting, queue);
  }
  const running = queue.get(key);
  if (running) {
    if (running.payloadHash !== payloadHash)
      throw new AppError(
        409,
        "RETRY_CONFLICT",
        "This message identifier was already used for different information.",
      );
    return running.operation;
  }
  const operation = processOnce(
    input,
    reporting,
    { ...options, secret },
    key,
    payloadHash,
  );
  queue.set(key, { payloadHash, operation });
  try {
    return await operation;
  } finally {
    queue.delete(key);
  }
}

export async function handleIncoming(
  input: IncomingMessage,
  reporting: Reporting,
): Promise<string> {
  return (await processIncoming(input, reporting)).responseText;
}

async function processOnce(
  input: IncomingMessage,
  reporting: Reporting,
  options: HandlerOptions & { secret: string },
  key: string,
  payloadHash: string,
): Promise<MessageReply> {
  await reporting.db.query(
    "INSERT INTO message_receipts(message_id,payload_hash) VALUES($1,$2) ON CONFLICT(message_id) DO NOTHING",
    [key, payloadHash],
  );
  const receipt = (
    await reporting.db.query(
      "SELECT response_text,payload_hash FROM message_receipts WHERE message_id=$1",
      [key],
    )
  ).rows[0];
  if (receipt?.payload_hash !== payloadHash)
    throw new AppError(
      409,
      "RETRY_CONFLICT",
      "This message identifier was already used for different information.",
    );
  if (input.chatId)
    await reporting.db.query(
      `INSERT INTO message_context(source_message_id,sender_hash,chat_id) VALUES($1,$2,$3) ON CONFLICT DO NOTHING`,
      [
        `photon-${key}`,
        keyed(options.secret, `sender:${input.senderId}`),
        input.chatId,
      ],
    );
  if (receipt?.response_text) return { responseText: receipt.response_text };
  // Durable mutation keys below also prevent duplication if the process crashes before recording its reply.
  const responseText = await command(input, reporting, options, key);
  await reporting.db.query(
    "UPDATE message_receipts SET response_text=$2 WHERE message_id=$1",
    [key, responseText],
  );
  return { responseText };
}

async function command(
  input: IncomingMessage,
  reporting: Reporting,
  options: HandlerOptions & { secret: string },
  key: string,
): Promise<string> {
  const text = input.text.trim();
  const upper = text.toUpperCase();
  if (!input.photo && /^(HELP|HI|HELLO|HEY|START)$/.test(upper)) return help;
  if (!input.photo && /^(CONSENT|STOP)$/.test(upper)) {
    const consent = upper === "CONSENT";
    const senderHash = keyed(options.secret, `sender:${input.senderId}`);
    const response = consent
      ? "Consent saved for private follow-up messages when the review status changes on an incident you report or observe. Delivery requires a connected Photon worker. Send STOP at any time to withdraw consent. Reports never imply consent."
      : "Follow-up consent withdrawn and pending updates cancelled. You can still send HELP or submit observations when you choose.";
    await reporting.db.transaction(async (c) => {
      const receipt = (
        await c.query(
          "SELECT response_text FROM message_receipts WHERE message_id=$1 FOR UPDATE",
          [key],
        )
      ).rows[0];
      if (receipt?.response_text) return;
      await c.query(
        "INSERT INTO messaging_preferences(sender_hash,follow_up_consent) VALUES($1,$2) ON CONFLICT(sender_hash) DO UPDATE SET follow_up_consent=EXCLUDED.follow_up_consent,updated_at=now()",
        [senderHash, consent],
      );
      if (!consent) await revokePendingFollowups(c, senderHash);
      // Commit the receipt with consent; a delayed retry must never re-enable consent after a later STOP.
      await c.query(
        "UPDATE message_receipts SET response_text=$2 WHERE message_id=$1",
        [key, response],
      );
    });
    return response;
  }
  if (!input.photo && /^STATUS\b/i.test(text)) {
    const id = z.uuid().safeParse(text.slice(6).trim());
    if (!id.success)
      return "Send STATUS followed by the full incident UUID from your confirmation screen.";
    try {
      const report = await reporting.detail(id.data);
      return `Incident ${report.id}: ${report.status.replaceAll("_", " ")}. ${report.observationCount} observation(s). These are DrainDispatch community statuses, not municipal repair confirmations.`;
    } catch (error) {
      if (error instanceof AppError && error.status === 404)
        return "That incident was not found. Check the full reference and try again.";
      throw error;
    }
  }
  if (!input.photo && /^NEARBY\b/i.test(text)) {
    const [, latitude, longitude, category, ...extra] = text.split(/\s+/);
    const parsed = coordinates
      .extend({ issueType })
      .safeParse({
        latitude: Number(latitude),
        longitude: Number(longitude),
        issueType: category,
      });
    if (!parsed.success || !latitude || !longitude || extra.length)
      return "Send NEARBY <latitude> <longitude> <category>, for example NEARBY 35.9132 -79.0558 blocked_drain. We search active reports within 30 meters; nearby drains can be different drains.";
    const matches = await reporting.nearby(parsed.data);
    return matches.length
      ? `Possible nearby matches (confirm the same physical drain yourself):\n${matches
          .slice(0, 5)
          .map(
            (r) =>
              `${r.id} — ${Math.round(r.distanceMeters)} m — ${r.description.slice(0, 180)}`,
          )
          .join("\n")}`
      : "No matching active reports from the last 30 days were found within 30 meters. Send REPORT and a description to start a new observation.";
  }
  if (!input.photo && /^OBSERVE\b/i.test(text)) {
    const match = text.match(/^OBSERVE\s+(\S+)\s+CONFIRM\s+([\s\S]+)$/i);
    if (!match || !z.uuid().safeParse(match[1]).success)
      return "First check the incident on the website and confirm it concerns the same physical drain. Then send OBSERVE <incident UUID> CONFIRM <description>. No observation has been posted yet.";
    const parsed = observationSchema.safeParse({
      description: match[2],
      sameLocationConfirmed: true,
      idempotencyKey: `photon-${key}`,
    });
    if (!parsed.success)
      return "Include an observation description between 5 and 2,000 characters after CONFIRM.";
    try {
      const result = await reporting.observe(
        match[1]!,
        parsed.data,
        "imessage",
        `photon-${key}`,
      );
      await subscribe(reporting.db, result.incidentId, `photon-${key}`);
      return `Observation saved to incident ${result.incidentId}. Thank you for documenting visible evidence. This does not verify a repair or municipal action.`;
    } catch (error) {
      if (error instanceof AppError && error.status === 404)
        return "That incident was not found. Check the full reference before sending another observation.";
      throw error;
    }
  }
  let description = text.replace(/^REPORT\b\s*/i, "").trim();
  if (!input.photo && description.length < 5)
    return "Send REPORT followed by a description of what you can safely see, or send a photograph. We need you to confirm the location on the website before creating an incident.";
  let photoId: string | undefined;
  let assessment: Assessment | undefined;
  let analysisNote = "";
  if (input.photo) {
    const images = options.images ?? {
      sanitize: sanitizeImage,
      store: storeImage,
      analyze: analyzeImage,
    };
    photoId = photoUuid(key);
    const existing = (
      await reporting.db.query("SELECT assessment FROM photos WHERE id=$1", [
        photoId,
      ])
    ).rows[0];
    if (existing) assessment = existing.assessment ?? undefined;
    else {
      const sanitized = await images.sanitize(input.photo);
      const stored = await images.store(sanitized);
      try {
        assessment = await images.analyze(sanitized);
      } catch {
        analysisNote =
          "Photo saved; AI analysis is unavailable. Review and describe the visible evidence yourself. ";
      }
      await reporting.db.query(
        "INSERT INTO photos(id,url,storage_key,mime_type,assessment) VALUES($1,$2,$3,$4,$5) ON CONFLICT(id) DO NOTHING",
        [
          photoId,
          stored.url,
          stored.storageKey,
          sanitized.mimeType,
          assessment ? JSON.stringify(assessment) : null,
        ],
      );
    }
    if (!assessment)
      analysisNote =
        "Photo saved; AI analysis is unavailable. Review and describe the visible evidence yourself. ";
    if (!description)
      description =
        assessment?.visibleEvidence ??
        "Photograph submitted for community review.";
  }
  const token = keyed(options.secret, `draft:${input.id}`);
  const draft = await reporting.draft({
    description,
    issueType: assessment?.suggestedCategory ?? "other",
    photoId,
    sourceMessageId: `photon-${key}`,
    token,
  });
  const base = new URL(
    options.appUrl ?? process.env.PUBLIC_APP_URL ?? "http://localhost:5173",
  );
  const url = new URL(`/confirm/${draft.token}`, base).toString();
  return `${analysisNote}${assessment ? `AI suggestion: ${assessment.suggestedCategory.replaceAll("_", " ")}; uncertainty ${assessment.uncertainty}. ${assessment.visibleEvidence} ` : ""}Confirm the location and edit the report here: ${url} . Link expires in one hour. No incident is public until you confirm; a photo cannot establish GPS location. Stay out of roadways, drains, and floodwater.`;
}
