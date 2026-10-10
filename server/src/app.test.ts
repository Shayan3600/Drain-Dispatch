import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import request from "supertest";
import sharp from "sharp";
import { openDatabase } from "./db/database.js";
import { createApp } from "./app.js";
import { Reporting, distanceMeters } from "./services/reporting.js";

test("persistent PostgreSQL API: reports, retries, matching, observations, moderation, drafts and metrics", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "draindispatch-api-"));
  process.env.MODERATOR_TOKEN = "test-only-moderator-secret";
  process.env.WORKER_TOKEN = "test-only-worker-secret";
  let db = await openDatabase(path.join(dir, "db"));
  let app = createApp(db);
  try {
    assert.equal((await request(app).post('/api/incidents').send({description:'x'.repeat(70_000)})).status,413);
    assert.equal(
      (await request(app).get("/api/health")).body.databaseMode,
      "local-postgresql",
    );
    assert.equal(
      (
        await request(app)
          .post("/api/incidents")
          .send({ description: "Unconfirmed report" })
      ).status,
      400,
    );
    const report = {
      description: "Leaves visibly cover part of a curb drain grate.",
      latitude: 35.9132,
      longitude: -79.0558,
      issueType: "blocked_drain",
      locationConfirmed: true,
      idempotencyKey: randomUUID(),
    };
    const result = await request(app).post("/api/incidents").send(report);
    assert.equal(result.status, 201);
    const id = result.body.id;
    const retry = await request(app).post("/api/incidents").send(report);
    assert.equal(retry.body.id, id);
    assert.equal(
      (
        await request(app)
          .post("/api/incidents")
          .send({
            ...report,
            description: "Different content for the same key.",
          })
      ).status,
      409,
    );
    const candidates = await request(app)
      .get("/api/incidents/nearby")
      .query({
        latitude: 35.91321,
        longitude: -79.0558,
        issueType: "blocked_drain",
      });
    assert.equal(candidates.body[0].id, id);
    assert.ok(candidates.body[0].distanceMeters < 30);
    assert.equal(
      (
        await request(app)
          .get("/api/incidents/nearby")
          .query({
            latitude: 35.9232,
            longitude: -79.0558,
            issueType: "blocked_drain",
          })
      ).body.length,
      0,
    );
    assert.equal(
      (
        await request(app)
          .get("/api/incidents/nearby")
          .query({
            latitude: 35.9132,
            longitude: -79.0558,
            issueType: "standing_water",
          })
      ).body.length,
      0,
    );
    const observation = {
      description: "Same drain, additional visible leaf cover today.",
      sameLocationConfirmed: true,
      idempotencyKey: randomUUID(),
    };
    assert.equal(
      (
        await request(app)
          .post(`/api/incidents/${id}/observations`)
          .send({ ...observation, sameLocationConfirmed: false })
      ).status,
      400,
    );
    assert.equal(
      (
        await request(app)
          .post(`/api/incidents/${id}/observations`)
          .send(observation)
      ).status,
      201,
    );
    await request(app)
      .post(`/api/incidents/${id}/observations`)
      .send(observation);
    const detail = (await request(app).get(`/api/incidents/${id}`)).body;
    assert.equal(detail.observations.length, 2);
    assert.equal(detail.observationCount, 2);
    assert.ok(!JSON.stringify(detail).includes("senderId"));
    assert.equal(
      (
        await request(app)
          .patch(`/api/incidents/${id}/status`)
          .send({
            status: "closed",
            evidence: "Follow-up photograph documents a clear grate.",
          })
      ).status,
      401,
    );
    assert.equal(
      (
        await request(app)
          .patch(`/api/incidents/${id}/status`)
          .set("Authorization", "Bearer test-only-moderator-secret")
          .send({ status: "closed", evidence: "short" })
      ).status,
      400,
    );
    assert.equal(
      (
        await request(app)
          .patch(`/api/incidents/${id}/status`)
          .set("Authorization", "Bearer test-only-moderator-secret")
          .send({
            status: "under_review",
            evidence: "Moderator reviewed submitted visual evidence.",
          })
      ).status,
      200,
    );
    assert.equal(
      (await request(app).get(`/api/incidents/${id}/history`)).body.length,
      3,
    );
    const service = new Reporting(db),
      draft = await service.draft({
        description: "Visible standing water by a walkway.",
        issueType: "standing_water",
        sourceMessageId: "test-message-1",
      });
    assert.equal(
      (await request(app).get(`/api/report-drafts/${draft.token}`)).body
        .description,
      "Visible standing water by a walkway.",
    );
    const draftInput = {
      ...report,
      issueType: "standing_water",
      description: "Edited description confirmed by the sender.",
      idempotencyKey: randomUUID(),
    };
    const confirmed = await request(app)
      .post(`/api/report-drafts/${draft.token}/confirm`)
      .send(draftInput);
    assert.equal(confirmed.status, 200);
    const twice = await request(app)
      .post(`/api/report-drafts/${draft.token}/confirm`)
      .send(draftInput);
    assert.equal(twice.body.id, confirmed.body.id);
    const expired = await service.draft({
      description: "Expired draft demonstration.",
      issueType: "other",
      sourceMessageId: "test-expired",
    });
    await db.query(
      "UPDATE report_drafts SET expires_at=now()-interval '1 second' WHERE source_message_id=$1",
      ["test-expired"],
    );
    assert.equal(
      (await request(app).get(`/api/report-drafts/${expired.token}`)).status,
      410,
    );
    const demo = await service.create(
      { ...report, idempotencyKey: "demo-record-test" },
      "demo",
      undefined,
      true,
    );
    assert.equal(demo.isDemo, true);
    const stats = (await request(app).get("/api/stats")).body;
    assert.equal(stats.totalIncidents, 2);
    assert.equal(stats.observationCount, 3);
    assert.equal(
      stats.overTime.reduce(
        (n: number, r: { count: number }) => n + r.count,
        0,
      ),
      2,
    );
    await db.close();
    db = await openDatabase(path.join(dir, "db"));
    app = createApp(db);
    assert.equal(
      (await request(app).get(`/api/incidents/${id}`)).body.observationCount,
      2,
    );
    // Irrelevant/malicious payloads cannot be persisted as photographs.
    process.env.IMAGE_STORAGE = "local";
    process.env.LOCAL_UPLOAD_PATH = path.join(dir, "uploads");
    app = createApp(db);
    assert.equal(
      (
        await request(app)
          .post("/api/uploads")
          .attach("photo", Buffer.from("<script>alert(1)</script>"), {
            filename: "fake.jpg",
            contentType: "image/jpeg",
          })
      ).status,
      415,
    );
    const bytes = await sharp({
      create: { width: 24, height: 24, channels: 3, background: "#456789" },
    })
      .png()
      .toBuffer();
    const photo = await request(app)
      .post("/api/uploads")
      .attach("photo", bytes, {
        filename: "test.png",
        contentType: "image/png",
      });
    assert.equal(photo.status, 201);
    assert.ok(photo.body.url.includes("/uploads/"));
    delete process.env.GEMINI_API_KEY;
    assert.equal(
      (await request(app).post("/api/analyze").send({ photoId: photo.body.id }))
        .status,
      503,
    );
    const saved = await request(app)
      .post("/api/incidents")
      .send({
        ...report,
        photoId: photo.body.id,
        idempotencyKey: randomUUID(),
      });
    assert.equal(saved.status, 201);
    assert.equal(
      (await request(app).get(`/api/incidents/${saved.body.id}`)).body
        .observations[0].photoUrl,
      photo.body.url,
    );
  } finally {
    await db.close();
    await rm(dir, { recursive: true, force: true });
  }
});

test("geographic distance is measured in meters", () => {
  assert.equal(
    distanceMeters(
      { latitude: 35, longitude: -79 },
      { latitude: 35, longitude: -79 },
    ),
    0,
  );
  assert.ok(
    distanceMeters(
      { latitude: 35, longitude: -79 },
      { latitude: 35.001, longitude: -79 },
    ) > 110,
  );
});
