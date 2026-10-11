import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import type { Database } from "./database.js";
import { seedCityShowcase } from "./cityShowcase.js";
import { Reporting } from "../services/reporting.js";
import request from "supertest";
import { createApp } from "../app.js";
import { formatReportPacket } from "../../../client/src/reportPacket.js";

test("city showcase is local-only, balanced, additive, repeatable, and excluded from real metrics",async()=>{
  await assert.rejects(()=>seedCityShowcase({mode:"postgresql"} as Database),/refuses non-local/);
  const engine = new PGlite();
  const db:Database={mode:"local-postgresql",timescale:false,query:async(s,p)=>await engine.query(s,p) as any,transaction:fn=>engine.transaction(tx=>fn({query:async(s,p)=>await tx.query(s,p) as any})),close:()=>engine.close()};
  await engine.exec(await readFile(new URL("../../sql/001_init.sql",import.meta.url),"utf8"));
  try {
    const anchor = new Date("2026-10-10T20:00:00Z");
    const initial = await seedCityShowcase(db,anchor);
    assert.equal(initial.photos.length,48);
    await seedCityShowcase(db,new Date(anchor.getTime()+3*3600000));
    for (const [table,count] of [["incidents",48],["observations",152],["photos",48],["incident_events",200],["moderation_history",48],["notification_outbox",0],["incident_subscriptions",0],["report_drafts",0]]) {
      assert.equal(Number((await db.query(`SELECT count(*) n FROM ${table}`)).rows[0].n),count,table);
    }
    const reporting = new Reporting(db);
    const reports=await reporting.list({demo:true,sort:"updated"});
    assert.equal(reports.length,48);
    assert.equal(reports.filter(r=>r.hasPhoto).length,24);
    assert.equal(reports.filter(r=>r.observationCount>=2).length,36);
    for (const category of ["blocked_drain","standing_water","damaged_drain","other"]) assert.equal(reports.filter(r=>r.issueType===category).length,12);
    for (const status of ["pending_review","under_review","closed"]) assert.equal(reports.filter(r=>r.status===status).length,16);
    assert.equal(reports.filter(r=>r.status!=="closed").length,32);
    assert.equal((await reporting.list({demo:false})).length,0);
    assert.equal((await reporting.stats()).totalIncidents,0);
    assert.ok(reports.every(r=>r.isDemo && r.description.startsWith("CITY DEMO")));
    assert.ok(reports.every(r=>new Date(r.updatedAt).getTime()<=anchor.getTime()));
    const closed=reports.find(r=>r.status==="closed" && r.observationCount===6)!;
    const detail=await reporting.detail(closed.id);
    assert.equal(detail.observations.length,6);
    assert.equal(detail.observations.filter(o=>o.photoUrl?.startsWith("/uploads/city-showcase-v1-")).length,3);
    assert.equal((await reporting.history(closed.id)).length,8);
    const api=createApp(db);
    const queue=await request(api).get("/api/incidents?demo=true&sort=updated");
    assert.equal(queue.status,200);
    assert.equal(queue.body.length,48);
    const apiDetail=await request(api).get(`/api/incidents/${closed.id}`);
    const apiHistory=await request(api).get(`/api/incidents/${closed.id}/history`);
    assert.equal(apiDetail.status,200);
    assert.equal(apiHistory.status,200);
    const packet=formatReportPacket(apiDetail.body,apiHistory.body,{includePhotoLinks:true,photoBaseUrl:"http://localhost:12345",historyState:"ready"});
    assert.match(packet,/DEMO \/ TEST REPORT/);
    assert.match(packet,/Public photo: http:\/\/localhost:12345\/uploads\//);
    const privatePacket=formatReportPacket(apiDetail.body,apiHistory.body,{historyState:"ready"});
    assert.ok(!privatePacket.includes("Public photo:"));
    // Reruns preserve unrelated real records too.
    await reporting.create({latitude:35.9,longitude:-79,issueType:"other",description:"Existing unrelated test record",locationConfirmed:true,idempotencyKey:"existing-unrelated-record"});
    await seedCityShowcase(db,anchor);
    assert.equal((await reporting.list({demo:false})).length,1);
  } finally { await db.close(); }
});
