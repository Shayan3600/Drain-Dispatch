import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createHmac, randomBytes, randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import type { Database } from "../db/database.js";
import { processIncoming } from "../photon/handler.js";
import { Reporting, observationSchema } from "./reporting.js";

test("two synthetic senders coordinate through explicit matching without exposing identities or inflating real metrics", async () => {
  const engine = new PGlite();
  const secret = randomBytes(32).toString("hex");
  const options = { secret, appUrl: "https://fixture.example" };
  const key = (value: string) => createHmac("sha256",secret).update(value).digest("hex");
  const db: Database = { mode:"test-postgresql",timescale:false,
    query:async(sql,params)=>(await engine.query(sql,params)) as any,
    transaction:fn=>engine.transaction(tx=>fn({query:async(sql,params)=>(await tx.query(sql,params)) as any})),
    close:()=>engine.close() };
  try {
    await engine.exec(await readFile(new URL("../../sql/001_init.sql",import.meta.url),"utf8"));
    const reporting = new Reporting(db);
    const before = await reporting.stats();
    const firstMessage = {id:randomUUID(),senderId:"synthetic-sender-A",chatId:"synthetic-chat-A",text:"REPORT DEMO: Synthetic fixture evidence from sender A"};
    await processIncoming(firstMessage,reporting,options);
    assert.equal((await reporting.list()).length,0,"a message draft alone does not publish an incident");
    const firstSource = "photon-" + key("message:" + firstMessage.id);
    const fixture = await reporting.create({latitude:0,longitude:0,description:"DEMO: Synthetic fixture observation A",issueType:"blocked_drain",locationConfirmed:true,idempotencyKey:randomUUID()},"imessage",firstSource,true);
    const nearby = await reporting.nearby({latitude:0.0001,longitude:0.0001,issueType:"blocked_drain"});
    assert.equal(nearby[0]?.id,fixture.id);
    assert.ok(nearby[0]!.distanceMeters > 0 && nearby[0]!.distanceMeters <= 30);
    const unconfirmed = await processIncoming({id:randomUUID(),senderId:"synthetic-sender-B",text:`OBSERVE ${fixture.id} DEMO: Unconfirmed fixture observation`},reporting,options);
    assert.match(unconfirmed.responseText,/No observation has been posted yet/);
    assert.equal((await reporting.detail(fixture.id)).observationCount,1);
    assert.equal(observationSchema.safeParse({description:"Synthetic observation",idempotencyKey:randomUUID(),sameLocationConfirmed:false}).success,false);
    const confirmed = {id:randomUUID(),senderId:"synthetic-sender-B",chatId:"synthetic-chat-B",text:`OBSERVE ${fixture.id} CONFIRM DEMO: Synthetic fixture observation B`};
    const reply = await processIncoming(confirmed,reporting,options);
    const retry = await processIncoming(confirmed,new Reporting(db),options);
    assert.equal(retry.responseText,reply.responseText);
    const detail = await reporting.detail(fixture.id);
    assert.equal(detail.observationCount,2);
    assert.deepEqual(detail.observations.map(observation=>observation.source),["imessage","imessage"]);
    const attribution = (await db.query("SELECT count(*)::int observations,count(DISTINCT c.sender_hash)::int senders FROM observations o JOIN message_context c ON c.source_message_id=o.source_message_id WHERE o.incident_id=$1",[fixture.id])).rows[0];
    assert.equal(attribution.observations,2);
    assert.equal(attribution.senders,2,"these are synthetic sender identities, not a count of real people");
    for (const identity of [firstMessage.senderId,confirmed.senderId,firstMessage.chatId,confirmed.chatId,key("sender:"+firstMessage.senderId),key("sender:"+confirmed.senderId)])
      assert.equal(JSON.stringify(detail).includes(identity),false);
    const independent = await reporting.create({latitude:0.0001,longitude:0.0001,description:"DEMO: Independent fixture without explicit same-drain matching",issueType:"blocked_drain",locationConfirmed:true,idempotencyKey:randomUUID()},"demo",undefined,true);
    assert.notEqual(independent.id,fixture.id,"proximity does not automatically merge reports");
    assert.equal((await reporting.detail(fixture.id)).observationCount,2);
    const history = await reporting.history(fixture.id);
    assert.equal(history.length,2);
    assert.deepEqual(new Set(history.map(event=>event.eventType)),new Set(["incident_created","observation_added"]));
    assert.deepEqual(await reporting.stats(),before,"all synthetic fixtures are excluded from real metrics");
    assert.equal((await reporting.stats()).participationMeasure,"Observation submissions; not unique people");
  } finally { await engine.close(); }
});
