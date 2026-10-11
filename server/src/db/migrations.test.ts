import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { openDatabase, type Database } from "./database.js";
import { Reporting } from "../services/reporting.js";

test("legacy upgrade preserves evidence, source IDs, status and event IDs across repeated migrations", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "drain-legacy-migration-"));
  const legacy = new PGlite(directory);
  let legacyClosed = false;
  const incidentId = randomUUID(), observationId = randomUUID();
  let db: Database | undefined;
  try {
    await legacy.exec(`
      CREATE TABLE incidents(id uuid PRIMARY KEY,latitude double precision NOT NULL,longitude double precision NOT NULL,description text NOT NULL,issue_type text NOT NULL,status text NOT NULL DEFAULT 'pending' CONSTRAINT incidents_status_check CHECK(status IN ('pending','under_review','closed')),is_demo boolean NOT NULL DEFAULT true,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now());
      CREATE TABLE observations(id uuid PRIMARY KEY,incident_id uuid NOT NULL REFERENCES incidents(id),description text NOT NULL,source text NOT NULL CONSTRAINT observations_source_check CHECK(source IN ('web','imessage')),photo_url text,source_event_id text UNIQUE,created_at timestamptz NOT NULL DEFAULT now());
      CREATE TABLE incident_events(occurred_at timestamptz NOT NULL DEFAULT now(),incident_id uuid NOT NULL,event_type text NOT NULL,source text NOT NULL);
    `);
    await legacy.query("INSERT INTO incidents(id,latitude,longitude,description,issue_type) VALUES($1,35.91,-79.05,'Original legacy evidence','blocked_drain')", [incidentId]);
    await legacy.query("INSERT INTO observations(id,incident_id,description,source,photo_url,source_event_id) VALUES($1,$2,'Original photo evidence','imessage','https://images.example/legacy.jpg','legacy-message')", [observationId,incidentId]);
    await legacy.query("INSERT INTO incident_events(incident_id,event_type,source) VALUES($1,'incident_created','imessage')", [incidentId]);
    await legacy.close();
    legacyClosed = true;
    db = await openDatabase(directory);
    const original = (await db.query("SELECT * FROM observations WHERE id=$1", [observationId])).rows[0];
    assert.equal(original.description, "Original photo evidence");
    assert.equal(original.source_event_id, "legacy-message");
    assert.equal(original.source_message_id, "legacy-message");
    const detail = await new Reporting(db).detail(incidentId);
    assert.equal(detail.status, "pending_review");
    assert.equal(detail.isDemo,true,"existing legacy demo classifications must remain unchanged");
    assert.equal((await db.query("SELECT column_default FROM information_schema.columns WHERE table_schema='public' AND table_name='incidents' AND column_name='is_demo'")).rows[0].column_default,"false","future inserts inherit the canonical real-report default");
    assert.equal(detail.observations[0].photoUrl, "https://images.example/legacy.jpg");
    assert.equal((await db.query("SELECT status FROM incidents WHERE id=$1", [incidentId])).rows[0].status, "pending");
    assert.equal((await new Reporting(db).list({status:"pending_review"})).length, 1);
    const event = (await db.query("SELECT * FROM incident_events WHERE incident_id=$1", [incidentId])).rows[0];
    assert.match(event.id, /^[0-9a-f-]{36}$/);
    assert.deepEqual(event.metadata, {});
    const created = await new Reporting(db).create({latitude:35.92,longitude:-79.04,description:"DEMO: Current schema write after legacy upgrade",issueType:"other",locationConfirmed:true,idempotencyKey:"legacy-upgrade-demo"},"demo",undefined,true);
    assert.equal(created.status,"pending_review");
    await db.close();
    db = undefined;
    db = await openDatabase(directory);
    assert.equal((await db.query("SELECT id FROM incident_events WHERE incident_id=$1", [incidentId])).rows[0].id, event.id);
    assert.equal((await db.query("SELECT count(*)::int count FROM observations WHERE id=$1", [observationId])).rows[0].count, 1);
    await assert.rejects(db.query("INSERT INTO observations(id,incident_id,description,source,source_message_id) VALUES($1,$2,'Duplicate source','imessage','legacy-message')",[randomUUID(),incidentId]));
    await assert.rejects(db.query("INSERT INTO incident_events(id,incident_id,event_type,source) VALUES($1,$2,'orphan','demo')",[randomUUID(),randomUUID()]));
  } finally {
    await db?.close();
    if (!legacyClosed) await legacy.close();
    await rm(directory,{recursive:true,force:true});
  }
});

test("legacy pending DEMO drafts preserve photo evidence and later starts retain explicit classifications", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "clearflow-draft-upgrade-"));
  const legacy = new PGlite(directory);
  let legacyClosed = false;
  let db: Database | undefined;
  const token = "synthetic-legacy-draft-regression-placeholder";
  const draftId = randomUUID(), photoId = randomUUID();
  try {
    await legacy.exec(await readFile(new URL("../../sql/001_init.sql", import.meta.url), "utf8"));
    await legacy.query("ALTER TABLE report_drafts DROP COLUMN is_demo");
    await legacy.query("INSERT INTO photos(id,url,storage_key,mime_type) VALUES($1,'https://images.example/preserved-draft.jpg','synthetic-preserved-photo','image/jpeg')", [photoId]);
    await legacy.query("INSERT INTO report_drafts(id,token_hash,source,description,issue_type,photo_id,source_message_id,expires_at) VALUES($1,$2,'imessage','DEMO: Existing pending test photo','blocked_drain',$3,'legacy-demo-draft',now()+interval '1 hour')", [draftId, createHash("sha256").update(token).digest("hex"), photoId]);
    await legacy.query("INSERT INTO report_drafts(id,token_hash,source,description,issue_type,source_message_id,expires_at) VALUES($1,$2,'imessage','DEMOGRAPHIC description is not a demo marker','other','legacy-real-draft',now()+interval '1 hour')", [randomUUID(), randomUUID()]);
    await legacy.close(); legacyClosed = true;
    db = await openDatabase(directory);
    const reporting = new Reporting(db);
    const preserved = await reporting.getDraft(token);
    assert.equal(preserved.isDemo, true);
    assert.equal(preserved.photoId, photoId);
    assert.equal(preserved.photoUrl, "https://images.example/preserved-draft.jpg");
    assert.equal((await db.query("SELECT is_demo FROM report_drafts WHERE source_message_id='legacy-real-draft'")).rows[0].is_demo, false);
    const explicitReal = await reporting.draft({ description: "DEMO: Prose with an explicit real classification", issueType: "other", sourceMessageId: "explicit-real-after-upgrade", isDemo: false });
    await db.close(); db = undefined;
    db = await openDatabase(directory);
    assert.equal((await new Reporting(db).getDraft(explicitReal.token)).isDemo, false, "reopening must not reinterpret stored text");
    assert.equal((await new Reporting(db).getDraft(token)).isDemo, true);
    assert.equal((await new Reporting(db).getDraft(token)).photoId, photoId);
  } finally {
    await db?.close(); if (!legacyClosed) await legacy.close();
    await rm(directory, { recursive: true, force: true });
  }
});
