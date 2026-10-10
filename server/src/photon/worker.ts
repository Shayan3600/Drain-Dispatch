import "../config.js";
import { pathToFileURL } from "node:url";
import {
  Spectrum,
  type Message,
  type Content,
  type Attachment,
} from "spectrum-ts";
import { imessage } from "spectrum-ts/providers/imessage";
import { z } from "zod";
import type { IncomingMessage, MessageReply } from "./handler.js";
import type { Followup } from "./notifications.js";

const MAX_BYTES = 8 * 1024 * 1024;
const acceptedImages = new Set(["image/jpeg", "image/png", "image/webp"]);
class ApiRequestError extends Error {}

function parts(content: Content): { text: string[]; photos: Attachment[] } {
  if (content.type === "text") return { text: [content.text], photos: [] };
  if (content.type === "attachment") {
    if (!acceptedImages.has(content.mimeType.toLowerCase()))
      throw new Error("Please send a still JPEG, PNG, or WebP photo.");
    return { text: [], photos: [content] };
  }
  if (content.type === "group") {
    const result: { text: string[]; photos: Attachment[] } = {
      text: [],
      photos: [],
    };
    for (const child of content.items) {
      if (child.direction !== "inbound") continue;
      const item = parts(child.content);
      result.text.push(...item.text);
      result.photos.push(...item.photos);
    }
    return result;
  }
  return { text: [], photos: [] };
}

/** Read a provider-owned attachment stream with a hard byte cap, never a user URL. */
async function boundedPhoto(attachment: Attachment): Promise<Buffer> {
  if (attachment.size !== undefined && attachment.size > MAX_BYTES)
    throw new Error("Photographs must be 8 MB or smaller.");
  const stream = await attachment.stream();
  const reader = stream.getReader();
  const chunks: Buffer[] = [];
  let total = 0;
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      if (!(part.value instanceof Uint8Array))
        throw new Error(
          "The photograph could not be read. Send a JPEG, PNG, or WebP photo.",
        );
      total += part.value.byteLength;
      if (total > MAX_BYTES)
        throw new Error("Photographs must be 8 MB or smaller.");
      chunks.push(Buffer.from(part.value));
    }
  } finally {
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
  return Buffer.concat(chunks, total);
}

export async function normalizeProviderMessage(
  message: Message,
): Promise<IncomingMessage | undefined> {
  if (
    message.direction !== "inbound" ||
    message.sender?.kind === "agent" ||
    !message.sender?.id
  )
    return undefined;
  const content = parts(message.content);
  if (!content.text.length && !content.photos.length) return undefined;
  if (content.photos.length > 1)
    throw new Error(
      "Please send one photograph per report so its evidence and location stay together.",
    );
  const text = content.text.join("\n");
  if (text.length > 2000)
    throw new Error("Please keep your description under 2,000 characters.");
  const space = message.space as Message["space"] & { type?: string };
  return {
    id: message.id,
    senderId: message.sender.id,
    text,
    ...(space?.type === "dm" ? { chatId: space.id } : {}),
    ...(content.photos[0]
      ? { photo: await boundedPhoto(content.photos[0]) }
      : {}),
  };
}

export async function forwardToApi(
  input: IncomingMessage,
  config: { apiUrl: string; token: string },
  request: typeof fetch = fetch,
): Promise<MessageReply> {
  const base = new URL(config.apiUrl);
  if (
    !["http:", "https:"].includes(base.protocol) ||
    base.username ||
    base.password
  )
    throw new Error("Configure a valid API_URL.");
  if (process.env.NODE_ENV === "production" && base.protocol !== "https:")
    throw new Error("The production worker requires an HTTPS API_URL.");
  const body = JSON.stringify({
    id: input.id,
    senderId: input.senderId,
    text: input.text,
    ...(input.chatId ? { chatId: input.chatId } : {}),
    ...(input.photo ? { photoBase64: input.photo.toString("base64") } : {}),
  });
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await request(new URL("/api/worker/messages", base), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${config.token}`,
        },
        body,
        signal: AbortSignal.timeout(90_000),
      });
      if (!response.ok) {
        if (response.status >= 500 && attempt < 2) continue;
        if (
          response.status === 400 ||
          response.status === 413 ||
          response.status === 415 ||
          response.status === 422
        ) {
          throw new ApiRequestError(
            "The report could not be accepted. Send a description under 2,000 characters and one still JPEG, PNG, or WebP photo under 8 MB. Send HELP for commands.",
          );
        }
        if (response.status === 429)
          throw new ApiRequestError(
            "Too many requests arrived. Wait a minute before trying again.",
          );
        throw new ApiRequestError(
          "The report service is unavailable. Please try again shortly. Your location must still be confirmed before publication.",
        );
      }
      const result = (await response.json()) as Partial<MessageReply>;
      if (
        typeof result.responseText !== "string" ||
        result.responseText.length === 0
      )
        throw new Error("The report service returned an incomplete response.");
      return { responseText: result.responseText };
    } catch (error) {
      if (error instanceof ApiRequestError || attempt === 2) throw error;
    }
  }
  throw new Error("The report service is unavailable. Please try again.");
}

const followupSchema = z.object({
  id: z.uuid(),
  chatId: z.string().min(1).max(500),
  responseText: z.string().min(1).max(4000),
  leaseToken: z.uuid(),
});

/** Acknowledgement follows send; a crash between them can produce a duplicate notification. */
export async function dispatchFollowups(
  config: { apiUrl: string; token: string },
  deliver: (followup: Followup) => Promise<void>,
  request: typeof fetch = fetch,
): Promise<number> {
  const base = new URL(config.apiUrl);
  if (
    !["http:", "https:"].includes(base.protocol) ||
    base.username ||
    base.password ||
    (process.env.NODE_ENV === "production" && base.protocol !== "https:")
  )
    throw new Error("Configure a secure API_URL.");
  const headers = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${config.token}`,
  };
  const claimed = await request(new URL("/api/worker/followups", base), {
    headers,
    signal: AbortSignal.timeout(15_000),
  });
  if (!claimed.ok) throw new Error("Follow-up claim failed");
  const { followups } = z
    .object({ followups: z.array(followupSchema).max(10) })
    .parse(await claimed.json());
  let sent = 0;
  for (const item of followups) {
    try {
      const body = JSON.stringify({ leaseToken: item.leaseToken });
      const eligible = await request(
        new URL(`/api/worker/followups/${item.id}/authorize`, base),
        { method: "POST", headers, body, signal: AbortSignal.timeout(15_000) },
      );
      if (
        !eligible.ok ||
        ((await eligible.json()) as { authorized?: boolean }).authorized !==
          true
      )
        continue;
      await deliver(item);
      sent++;
      const ack = await request(
        new URL(`/api/worker/followups/${item.id}/ack`, base),
        { method: "POST", headers, body, signal: AbortSignal.timeout(15_000) },
      );
      if (
        !ack.ok ||
        ((await ack.json()) as { acknowledged?: boolean }).acknowledged !== true
      )
        console.error(
          "A follow-up was sent but not acknowledged; retry may send it again.",
        );
    } catch {
      console.error(
        "A follow-up could not be delivered; its lease will expire for retry.",
      );
    }
  }
  return sent;
}

export async function startWorker(): Promise<void> {
  const {
    PHOTON_PROJECT_ID: projectId,
    PHOTON_PROJECT_SECRET: projectSecret,
    WORKER_TOKEN: token,
  } = process.env;
  if (!projectId || !projectSecret || !token || token.length < 24)
    throw new Error(
      "Configure PHOTON_PROJECT_ID, PHOTON_PROJECT_SECRET, and WORKER_TOKEN (at least 24 characters) in your private .env file.",
    );
  const app = await Spectrum({
    projectId,
    projectSecret,
    providers: [imessage.config()],
    telemetry: false,
    options: { logLevel: "error" },
  });
  const config = {
    apiUrl: process.env.API_URL ?? "http://localhost:3001",
    token,
  };
  let pendingFollowups: Promise<void> | undefined;
  let shuttingDown = false;
  const poll = () => {
    if (pendingFollowups || shuttingDown) return;
    pendingFollowups = dispatchFollowups(config, async (item) => {
      const space = await imessage(app).space.get(item.chatId);
      await space.send(item.responseText);
    })
      .then(() => undefined)
      .catch(() => {
        console.error(
          "Follow-up polling failed; check the protected API and database.",
        );
      })
      .finally(() => {
        pendingFollowups = undefined;
      });
  };
  const timer = setInterval(poll, 30_000);
  timer.unref();
  poll();
  const stop = () => {
    shuttingDown = true;
    clearInterval(timer);
    void app.stop();
  };
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
  console.info(
    "DrainDispatch Photon worker connected. Incoming reports use the central API.",
  );
  try {
    for await (const [space, message] of app.messages) {
      if (message.direction !== "inbound" || message.sender?.kind === "agent")
        continue;
      await space.responding(async () => {
        let incoming: IncomingMessage | undefined;
        try {
          incoming = await normalizeProviderMessage(message);
        } catch (error) {
          await message.reply(
            error instanceof Error
              ? error.message
              : "The attachment could not be read. Send HELP for supported formats.",
          );
          return;
        }
        if (!incoming) return;
        try {
          const result = await forwardToApi(incoming, config);
          await message.reply(result.responseText);
        } catch (error) {
          // Never log phone numbers, messages, provider errors, or credentials.
          console.error(
            "A message could not be processed or replied to; check API availability and worker configuration.",
          );
          try {
            await message.reply(
              error instanceof ApiRequestError
                ? error.message
                : "DrainDispatch could not finish this request. Try again shortly. If you received a confirmation link earlier, use that link first.",
            );
          } catch {
            console.error("The provider reply failed.");
          }
        }
      });
    }
  } finally {
    shuttingDown = true;
    clearInterval(timer);
    await pendingFollowups;
    process.removeListener("SIGINT", stop);
    process.removeListener("SIGTERM", stop);
    await app.stop();
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  startWorker().catch((error) => {
    console.error(
      error instanceof Error && error.message.startsWith("Configure ")
        ? error.message
        : "Photon worker startup failed. Check private credentials and service connectivity.",
    );
    process.exitCode = 1;
  });
}
