import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import type { Database } from "../db/database.js";
import { Reporting } from "./reporting.js";

test("activity counts initial and later observations on UTC days, excludes demo/old/future activity, and keeps existing trends", async () => {
  const engine = new PGlite();
  const db: Database = {mode:"test-postgresql",timescale:false,
    query:async(sql,params)=>(await engine.query(sql,params)) as any,
    transaction:fn=>engine.transaction(tx=>fn({query:async(sql,params)=>(await tx.query(sql,params)) as any})),close:()=>engine.close()};
  try {
    await engine.exec(await readFile(new URL("../../sql/001_init.sql",import.meta.url),"utf8"));
    await db.query("SET TIME ZONE 'America/Los_Angeles'");
    const today = new Date(String((await db.query("SELECT to_char(now() AT TIME ZONE 'UTC','YYYY-MM-DD') today")).rows[0].today)+"T00:00:00Z");
    const dayBefore = new Date(today.getTime()-2*86400000);
    const yesterday = new Date(today.getTime()-86400000);
    const firstTime = new Date(yesterday.getTime()-1000).toISOString();
    const secondTime = new Date(yesterday.getTime()+1000).toISOString();
    const reporting = new Reporting(db);
    const input = {latitude:0,longitude:0,description:"Isolated activity contract fixture",issueType:"other" as const,locationConfirmed:true as const,idempotencyKey:randomUUID()};
    const real = await reporting.create(input);
    await db.query("UPDATE incident_events SET occurred_at=$2 WHERE incident_id=$1",[real.id,firstTime]);
    await db.query("UPDATE observations SET created_at=$2 WHERE incident_id=$1",[real.id,firstTime]);
    const later = await reporting.observe(real.id,{description:"Later observation contract fixture",sameLocationConfirmed:true,idempotencyKey:randomUUID()});
    await db.query("UPDATE observations SET created_at=$2 WHERE id=$1",[later.id,secondTime]);
    await reporting.status(real.id,"under_review","Isolated test moderation evidence");
    await db.query("UPDATE incident_events SET occurred_at=$2 WHERE incident_id=$1 AND event_type IN ('observation_added','status_changed')",[real.id,secondTime]);
    const old = await reporting.observe(real.id,{description:"Older observation excluded from period",sameLocationConfirmed:true,idempotencyKey:randomUUID()});
    await db.query("UPDATE observations SET created_at=now()-interval '35 days' WHERE id=$1",[old.id]);
    const future = await reporting.observe(real.id,{description:"Future observation excluded from period",sameLocationConfirmed:true,idempotencyKey:randomUUID()});
    await db.query("UPDATE observations SET created_at=now()+interval '1 day' WHERE id=$1",[future.id]);
    const demo = await reporting.create({...input,idempotencyKey:randomUUID()},"demo",undefined,true);
    await reporting.status(demo.id,"under_review","Demo fixture must not inflate status metrics");
    await db.query("UPDATE observations SET created_at=$2 WHERE incident_id=$1",[demo.id,secondTime]);
    await db.query("UPDATE incident_events SET occurred_at=$2 WHERE incident_id=$1",[demo.id,secondTime]);
    const stats = await reporting.stats();
    assert.deepEqual(stats.activityPeriod,{bucket:"day",timeZone:"UTC",days:30,includesCurrentDay:true,startDate:new Date(today.getTime()-29*86400000).toISOString(),endDate:today.toISOString()});
    assert.deepEqual(stats.activityOverTime.map(row=>({...row,date:new Date(row.date).toISOString()})),[
      {date:dayBefore.toISOString(),incidents:1,observations:1,statusChanges:0},
      {date:yesterday.toISOString(),incidents:0,observations:1,statusChanges:1},
    ]);
    assert.equal(stats.totalIncidents,1);
    assert.equal(stats.observationCount,4,"the all-time total remains separate from the calendar-day window");
    assert.equal(stats.overTime.reduce((sum,row)=>sum+row.count,0),1);
    assert.equal(stats.participationMeasure,"Observation submissions; not unique people");
  } finally { await engine.close(); }
});

test("confirmed message reports explicitly stay real even when a legacy demo default is inherited", async () => {
  const engine = new PGlite();
  const db: Database = {mode:"test-postgresql",timescale:false,
    query:async(sql,params)=>(await engine.query(sql,params)) as any,
    transaction:fn=>engine.transaction(tx=>fn({query:async(sql,params)=>(await tx.query(sql,params)) as any})),close:()=>engine.close()};
  try {
    await engine.exec(await readFile(new URL("../../sql/001_init.sql",import.meta.url),"utf8"));
    await db.query("ALTER TABLE incidents ALTER COLUMN is_demo SET DEFAULT true");
    const reporting = new Reporting(db);
    const demo = await reporting.create({latitude:0,longitude:0,description:"Existing demo evidence must keep its classification",issueType:"other",locationConfirmed:true,idempotencyKey:randomUUID()},"demo",undefined,true);
    const draft = await reporting.draft({description:"Explicitly confirmed message observation",issueType:"other",sourceMessageId:randomUUID(),token:"synthetic-confirmation-token-for-regression"});
    const confirmed = await reporting.confirmDraft(draft.token,{latitude:0.01,longitude:0.01,description:"Explicitly confirmed message observation",issueType:"other",locationConfirmed:true,idempotencyKey:randomUUID()});
    assert.equal(confirmed.isDemo,false);
    assert.equal((await reporting.detail(demo.id)).isDemo,true,"existing records are never reclassified");
    const stats = await reporting.stats();
    assert.equal(stats.totalIncidents,1);
    assert.equal(stats.observationCount,1);
    assert.equal(stats.activityOverTime.reduce((total,row)=>total+row.observations,0),1);
  } finally { await engine.close(); }
});
