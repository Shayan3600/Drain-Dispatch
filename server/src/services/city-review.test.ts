import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { randomUUID } from "node:crypto";
import request from "supertest";
import type { Database } from "../db/database.js";
import { createApp } from "../app.js";
import { Reporting } from "./reporting.js";

test("city read metadata preserves counts, supports legacy photos and optional update-first ordering", async () => {
  // In-memory PostgreSQL: no environment credentials, files or real reports touched.
  const engine = new PGlite();
  const db: Database = { mode:"local-postgresql", timescale:false,
    query:async(sql,params)=>(await engine.query(sql,params)) as any,
    transaction:fn=>engine.transaction(tx=>fn({query:async(sql,params)=>(await tx.query(sql,params)) as any})),
    close:()=>engine.close() };
  await engine.exec(await readFile(new URL("../../sql/001_init.sql",import.meta.url),"utf8"));
  try {
    const reporting = new Reporting(db);
    const input = { latitude:35.9132, longitude:-79.0558, issueType:"blocked_drain" as const, locationConfirmed:true as const };
    const older = await reporting.create({...input,description:"Older city test incident",idempotencyKey:randomUUID()});
    const newer = await reporting.create({...input,description:"Newer city test incident",idempotencyKey:randomUUID()});
    const legacy = await reporting.create({...input,description:"Legacy photo city test",idempotencyKey:randomUUID()});
    await db.query("UPDATE incidents SET created_at='2026-10-01',updated_at='2026-10-10' WHERE id=$1",[older.id]);
    await db.query("UPDATE incidents SET created_at='2026-10-03',updated_at='2026-10-03' WHERE id=$1",[newer.id]);
    await db.query("UPDATE incidents SET created_at='2026-10-02',updated_at='2026-10-02' WHERE id=$1",[legacy.id]);
    const photoId = randomUUID();
    await db.query("INSERT INTO photos(id,url,storage_key,mime_type) VALUES($1,$2,$3,$4)",[photoId,"https://example.invalid/public-photo.jpg","synthetic-key","image/jpeg"]);
    await reporting.observe(older.id,{description:"Photo-bearing observation",photoId,sameLocationConfirmed:true,idempotencyKey:randomUUID()});
    await db.query("UPDATE observations SET created_at='2026-10-09' WHERE incident_id=$1",[older.id]);
    // An isolated legacy column, not a migration or write against an actual dataset.
    await db.query("ALTER TABLE observations ADD COLUMN photo_url text");
    await db.query("UPDATE observations SET photo_url='https://example.invalid/legacy.jpg' WHERE incident_id=$1",[legacy.id]);
    const app = createApp(db);
    const result = await request(app).get("/api/incidents?sort=updated&demo=false");
    assert.equal(result.status,200);
    assert.equal(result.body[0].id,older.id);
    const saved = result.body.find((item:{id:string})=>item.id===older.id);
    assert.equal(saved.observationCount,2);
    assert.equal(saved.hasPhoto,true);
    assert.equal(saved.latestObservationAt,"2026-10-09T00:00:00.000Z");
    assert.equal(result.body.find((item:{id:string})=>item.id===legacy.id).hasPhoto,true);
    assert.equal(result.body.find((item:{id:string})=>item.id===newer.id).hasPhoto,false);
    const defaultOrder=await request(app).get("/api/incidents");
    assert.equal(defaultOrder.body[0].id,newer.id);
    assert.equal((await request(app).get("/api/incidents?sort=unsafe")).status,400);
    assert.equal((await request(app).get("/api/incidents?issueType=standing_water&sort=updated")).body.length,0);
  } finally { await db.close(); }
});
