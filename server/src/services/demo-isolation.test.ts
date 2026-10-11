import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import type { Database } from "../db/database.js";
import { Reporting } from "./reporting.js";

test("nearby and confirmation isolate real and demo records while explicit demo observations remain supported", async () => {
  const engine = new PGlite();
  const db: Database = { mode: "test-postgresql", timescale: false,
    query: async (sql, params) => await engine.query(sql, params) as any,
    transaction: fn => engine.transaction(tx => fn({ query: async (sql, params) => await tx.query(sql, params) as any })), close: () => engine.close() };
  try {
    await engine.exec(await readFile(new URL("../../sql/001_init.sql", import.meta.url), "utf8"));
    const reporting = new Reporting(db);
    const location = { latitude: 35.9132, longitude: -79.0558, issueType: "blocked_drain" as const };
    const submission = { ...location, description: "Synthetic isolation observation", locationConfirmed: true as const, idempotencyKey: randomUUID() };
    const real = await reporting.create(submission);
    const demo = await reporting.create({ ...submission, idempotencyKey: randomUUID() }, "demo", undefined, true);
    assert.deepEqual((await reporting.nearby(location)).map(item => item.id), [real.id]);
    assert.deepEqual((await reporting.nearby({ ...location, demo: true })).map(item => item.id), [demo.id]);
    for (const isDemo of [false, true]) {
      const draft = await reporting.draft({ description: "Synthetic draft evidence", issueType: location.issueType, sourceMessageId: randomUUID(), isDemo });
      const wrong = isDemo ? real : demo;
      await assert.rejects(reporting.confirmDraft(draft.token, { ...submission, existingIncidentId: wrong.id }), /same real or demo classification/);
      const target = isDemo ? demo : real;
      const confirmed = await reporting.confirmDraft(draft.token, { ...submission, existingIncidentId: target.id });
      assert.equal(confirmed.id, target.id);
      assert.equal(confirmed.isDemo, isDemo);
      assert.equal((await reporting.detail(target.id)).observationCount, 2);
    }
    await reporting.observe(demo.id, { description: "Explicit synthetic demo follow-up", sameLocationConfirmed: true, idempotencyKey: randomUUID() });
    assert.equal((await reporting.detail(demo.id)).observationCount, 3);
    assert.equal((await reporting.stats()).observationCount, 2, "demo submissions never inflate real metrics");
  } finally { await engine.close(); }
});
