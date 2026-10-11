import { resolveSpectrumCredentials } from "./config.js";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import { rateLimit } from "express-rate-limit";
import multer from "multer";
import { z } from "zod";
import { randomUUID, timingSafeEqual } from "node:crypto";
import path from "node:path";
import { readFile } from "node:fs/promises";
import type { Database } from "./db/database.js";
import {
  Reporting,
  AppError,
  reportSchema,
  observationSchema,
  issueType,
  coordinates,
} from "./services/reporting.js";
import {
  sanitizeImage,
  storeImage,
  analyzeImage,
  ImageServiceError,
  MAX_IMAGE_BYTES,
} from "./services/images.js";
import { handleIncoming } from "./photon/handler.js";
import {
  claimFollowups,
  authorizeFollowup,
  acknowledgeFollowup,
} from "./photon/notifications.js";

function authorized(actual: string | undefined, expected: string | undefined) {
  if (!expected || !actual) return false;
  const a = Buffer.from(actual),
    b = Buffer.from(`Bearer ${expected}`);
  return a.length === b.length && timingSafeEqual(a, b);
}
export function createApp(db: Database) {
  const app = express(),
    reporting = new Reporting(db);
  app.disable("x-powered-by");
  app.use((req, res, next) => {
    let requestedPath: string;
    try { requestedPath = decodeURIComponent(req.path); }
    catch { res.status(400).end(); return; }
    if (/(?:^|\/)(?:\.env(?:\.|$)|\.git(?:\/|$)|[^/]*credentials[^/]*|[^/]+\.env(?:\.|$)|@fs(?:\/|$)|server(?:\/|$)|scripts(?:\/|$))/i.test(requestedPath)) {
      res.status(404).json({error:{code:"NOT_FOUND",message:"Endpoint not found."}});
      return;
    }
    next();
  });
  if (process.env.TRUST_PROXY === "1") app.set("trust proxy", 1);
  app.use(helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
    contentSecurityPolicy: {
      directives: {
        // Production pages load public map tiles and Cloudinary/legacy HTTPS photo evidence.
        imgSrc: ["'self'", "data:", "blob:", "https:"],
      },
    },
  }));
  const origins = (process.env.CLIENT_ORIGIN || "http://localhost:5173").split(
    ",",
  ).map(origin => origin.trim());
  app.use(
    cors({
      origin: (origin, cb) => cb(null, !origin || origins.includes(origin)),
    }),
  );
  app.use(
    "/api",
    rateLimit({
      windowMs: 60_000,
      limit: 100,
      standardHeaders: "draft-8",
      legacyHeaders: false,
      message: {error:{code:"RATE_LIMITED",message:"Too many requests. Wait a minute and try again."}},
    }),
  );
  const photoLimit = rateLimit({
    windowMs: 60_000,
    limit: 10,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: {error:{code:"RATE_LIMITED",message:"Too many photo requests. Wait a minute and try again."}},
  });
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: MAX_IMAGE_BYTES, files: 1 },
    fileFilter: (_r, f, cb) => {
      if (!["image/jpeg", "image/png", "image/webp"].includes(f.mimetype))
        cb(
          new AppError(
            415,
            "UNSUPPORTED_IMAGE",
            "Choose a JPEG, PNG or WebP photo. For iPhone HEIC, send a JPEG/PNG screenshot or take a new photo using Camera > Formats > Most Compatible.",
          ),
        );
      else cb(null, true);
    },
  });
  if (process.env.IMAGE_STORAGE === "local")
    app.use(
      "/uploads",
      express.static(path.resolve(process.env.LOCAL_UPLOAD_PATH || "uploads"), {
        dotfiles: "deny",
        index: false,
        maxAge: "1d",
      }),
    );
  const moderator: express.RequestHandler = (req, res, next) =>
    authorized(req.headers.authorization, process.env.MODERATOR_TOKEN)
      ? next()
      : next(
          new AppError(
            401,
            "UNAUTHORIZED",
            "Authorized moderator credentials required.",
          ),
        );
  const worker: express.RequestHandler = (req, res, next) =>
    authorized(req.headers.authorization, process.env.WORKER_TOKEN)
      ? next()
      : next(
          new AppError(
            401,
            "UNAUTHORIZED",
            "Trusted worker credentials required.",
          ),
        );
  app.use("/api/worker/messages", worker, express.json({ limit: "12mb" }));
  app.use(express.json({ limit: "64kb" }));
  app.get("/api/health", async (_req, res) => {
    await db.query("SELECT 1");
    res.json({
      ok: true,
      databaseMode: db.mode,
      timeSeriesEnabled: db.timescale,
      capabilities: {
        gemini: !!process.env.GEMINI_API_KEY,
        photon:
          !!resolveSpectrumCredentials(process.env).projectId &&
          !!resolveSpectrumCredentials(process.env).projectSecret,
        storage:
          process.env.IMAGE_STORAGE === "local"
            ? "local"
            : process.env.CLOUDINARY_API_SECRET
              ? "cloudinary"
              : "unconfigured",
      },
      prototype: true,
    });
  });
  app.get("/api/incidents", async (req, res) => {
    const filter = z
      .object({
        issueType: issueType.optional(),
        status: z.enum(["pending_review", "under_review", "closed"]).optional(),
        demo: z.enum(["true", "false"]).optional(),
      })
      .parse(req.query);
    res.json(
      await reporting.list({
        ...filter,
        demo: filter.demo === undefined ? undefined : filter.demo === "true",
      }),
    );
  });
  app.get("/api/incidents/nearby", async (req, res) => {
    const q = coordinates
      .extend({
        latitude: z.coerce.number().min(-90).max(90),
        longitude: z.coerce.number().min(-180).max(180),
        issueType,
      })
      .parse(req.query);
    res.json(await reporting.nearby(q));
  });
  app.get("/api/incidents/:id", async (req, res) =>
    res.json(await reporting.detail(z.uuid().parse(req.params.id))),
  );
  app.post("/api/incidents", async (req, res) =>
    res.status(201).json(await reporting.create(reportSchema.parse(req.body))),
  );
  app.post("/api/incidents/:id/observations", async (req, res) =>
    res
      .status(201)
      .json(
        await reporting.observe(
          z.uuid().parse(req.params.id),
          observationSchema.parse(req.body),
        ),
      ),
  );
  app.get("/api/incidents/:id/history", async (req, res) =>
    res.json(await reporting.history(z.uuid().parse(req.params.id))),
  );
  app.patch("/api/incidents/:id/status", moderator, async (req, res) => {
    const input = z
      .object({
        status: z.enum(["pending_review", "under_review", "closed"]),
        evidence: z.string().trim().min(10).max(2000),
      })
      .parse(req.body);
    res.json(
      await reporting.status(
        z.uuid().parse(req.params.id),
        input.status,
        input.evidence,
      ),
    );
  });
  app.post(
    "/api/uploads",
    photoLimit,
    upload.single("photo"),
    async (req, res) => {
      if (!req.file)
        throw new AppError(400, "PHOTO_REQUIRED", "Choose a photo to upload.");
      const image = await sanitizeImage(req.file.buffer);
      const stored = await storeImage(image);
      const id = randomUUID();
      await db.query(
        "INSERT INTO photos(id,url,storage_key,mime_type) VALUES($1,$2,$3,$4)",
        [id, stored.url, stored.storageKey, image.mimeType],
      );
      res
        .status(201)
        .json({
          id,
          url: stored.url,
          storage: process.env.IMAGE_STORAGE || "cloudinary",
        });
    },
  );
  app.post("/api/analyze", photoLimit, async (req, res) => {
    const { photoId } = z.object({ photoId: z.uuid() }).parse(req.body);
    const photo = (
      await db.query("SELECT * FROM photos WHERE id=$1", [photoId])
    ).rows[0];
    if (!photo) throw new AppError(404, "UNKNOWN_PHOTO", "Photo not found.");
    let bytes: Buffer;
    if (photo.storage_key.startsWith("local:")) {
      const file = photo.storage_key.slice(6);
      if (!/^[a-f0-9-]+\.jpg$/.test(file))
        throw new Error("Invalid storage key");
      bytes = await readFile(
        path.resolve(process.env.LOCAL_UPLOAD_PATH || "uploads", file),
      );
    } else {
      const url = new URL(photo.url);
      if (url.protocol !== "https:" || url.hostname !== "res.cloudinary.com")
        throw new Error("Unexpected photo host");
      const response = await fetch(url, {
        signal: AbortSignal.timeout(15000),
        redirect: "error",
      });
      if (!response.ok)
        throw new AppError(
          503,
          "PHOTO_UNAVAILABLE",
          "Stored photo could not be read.",
        );
      bytes = Buffer.from(await response.arrayBuffer());
    }
    const image = await sanitizeImage(bytes);
    const assessment = await analyzeImage(image);
    await db.query("UPDATE photos SET assessment=$2 WHERE id=$1", [
      photoId,
      JSON.stringify(assessment),
    ]);
    res.json(assessment);
  });
  app.get("/api/stats", async (_req, res) => res.json(await reporting.stats()));
  app.post("/api/report-drafts", worker, async (req, res) => {
    const input = z
      .object({
        description: z.string().trim().min(5).max(2000),
        issueType,
        photoId: z.uuid().optional(),
        sourceMessageId: z.string().min(1).max(200),
      })
      .parse(req.body);
    res.status(201).json(await reporting.draft(input));
  });
  app.get("/api/report-drafts/:token", async (req, res) => {
    res.set("Cache-Control", "no-store");
    res.json(
      await reporting.getDraft(
        z.string().min(40).max(100).parse(req.params.token),
      ),
    );
  });
  app.post("/api/report-drafts/:token/confirm", async (req, res) => {
    const input = reportSchema
      .extend({
        existingIncidentId: z.uuid().optional(),
        sameLocationConfirmed: z.literal(true).optional(),
      })
      .parse(req.body);
    if (input.existingIncidentId && !input.sameLocationConfirmed)
      throw new AppError(
        400,
        "CONFIRM_SAME_LOCATION",
        "Confirm this concerns the same physical drain.",
      );
    res.json(
      await reporting.confirmDraft(
        z.string().min(40).max(100).parse(req.params.token),
        input,
      ),
    );
  });
  app.post("/api/worker/messages", worker, async (req, res) => {
    const input = z
      .object({
        id: z.string().min(1).max(500),
        senderId: z.string().min(1).max(500),
        chatId: z.string().min(1).max(500).optional(),
        text: z.string().max(2000),
        photoBase64: z.string().max(12_000_000).optional(),
      })
      .parse(req.body);
    const responseText = await handleIncoming(
      {
        ...input,
        photo: input.photoBase64
          ? Buffer.from(input.photoBase64, "base64")
          : undefined,
      },
      reporting,
    );
    res.json({ responseText });
  });
  app.get("/api/worker/followups", worker, async (_req, res) =>
    res.json({ followups: await claimFollowups(db) }),
  );
  app.post("/api/worker/followups/:id/authorize", worker, async (req, res) => {
    const { leaseToken } = z.object({ leaseToken: z.uuid() }).parse(req.body);
    res.json({
      authorized: await authorizeFollowup(
        db,
        z.uuid().parse(req.params.id),
        leaseToken,
      ),
    });
  });
  app.post("/api/worker/followups/:id/ack", worker, async (req, res) => {
    const { leaseToken } = z.object({ leaseToken: z.uuid() }).parse(req.body);
    res.json({
      acknowledged: await acknowledgeFollowup(
        db,
        z.uuid().parse(req.params.id),
        leaseToken,
      ),
    });
  });
  let weatherCache: { expires: number; value: object } | undefined;
  app.get("/api/weather", async (_req, res) => {
    if (weatherCache && weatherCache.expires > Date.now()) {
      res.json(weatherCache.value);
      return;
    }
    try {
      const response = await fetch(
        "https://api.weather.gov/alerts/active?point=35.9132,-79.0558",
        {
          headers: {
            "User-Agent":
              "DrainDispatch HackNC prototype (community stormwater observations)",
            Accept: "application/geo+json",
          },
          signal: AbortSignal.timeout(8000),
        },
      );
      if (!response.ok) throw new Error("NWS unavailable");
      const data = (await response.json()) as {
        features: Array<{ id: string; properties: Record<string, any> }>;
      };
      const value = {
        alerts: data.features
          .filter((f) => /flood|rain|thunderstorm/i.test(f.properties.event))
          .map((f) => ({
            id: f.id,
            event: f.properties.event,
            headline: f.properties.headline,
            description: f.properties.description,
            severity: f.properties.severity,
            expires: f.properties.expires,
            url: f.id,
          })),
        source: "National Weather Service",
        retrievedAt: new Date().toISOString(),
        coverage: "Chapel Hill center; not a forecast for each incident",
        available: true,
      };
      weatherCache = { expires: Date.now() + 300000, value };
      res.json(value);
    } catch {
      res
        .status(503)
        .json({
          error: {
            code: "WEATHER_UNAVAILABLE",
            message:
              "Official weather alerts are temporarily unavailable. Check weather.gov.",
          },
          alerts: [],
          source: "National Weather Service",
          available: false,
        });
    }
  });
  app.use("/api", (_req, res) =>
    res
      .status(404)
      .json({ error: { code: "NOT_FOUND", message: "Endpoint not found." } }),
  );
  if (process.env.NODE_ENV === "production") {
    const clientDist = path.resolve(import.meta.dirname, "../../client/dist");
    app.use(express.static(clientDist));
    app.get("/{*path}", (_req, res) =>
      res.sendFile(path.join(clientDist, "index.html")),
    );
  }
  app.use(
    (
      error: unknown,
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction,
    ) => {
      if (error instanceof z.ZodError) {
        res
          .status(400)
          .json({
            error: {
              code: "VALIDATION_ERROR",
              message: "Check your inputs and explicitly confirm the location.",
              fields: error.issues.map((i) => ({
                field: i.path.join("."),
                message: i.message,
              })),
            },
          });
        return;
      }
      if (error instanceof AppError || error instanceof ImageServiceError) {
        res
          .status(error.status)
          .json({ error: { code: error.code, message: error.message } });
        return;
      }
      if (error instanceof multer.MulterError) {
        res
          .status(400)
          .json({
            error: {
              code: "UPLOAD_ERROR",
              message: "Choose one photo no larger than 8 MB.",
            },
          });
        return;
      }
      if (typeof error === "object" && error !== null && "type" in error && error.type === "entity.too.large") {
        res.status(413).json({error:{code:"REQUEST_TOO_LARGE",message:"This request is too large. Send a shorter description or a photo under 8 MB."}});
        return;
      }
      if (error instanceof SyntaxError) {
        res
          .status(400)
          .json({
            error: {
              code: "INVALID_JSON",
              message: "Request JSON could not be read.",
            },
          });
        return;
      }
      console.error(
        "Request failed:",
        error instanceof Error ? error.name : "Unknown error",
      );
      res
        .status(500)
        .json({
          error: {
            code: "SERVER_ERROR",
            message: "The request could not be completed. Please try again.",
          },
        });
    },
  );
  return app;
}
