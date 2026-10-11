-- Add current contracts without deleting legacy evidence, source IDs, or event rows.
ALTER TABLE observations ADD COLUMN IF NOT EXISTS photo_id uuid REFERENCES photos(id);
ALTER TABLE observations ADD COLUMN IF NOT EXISTS source_message_id text;
ALTER TABLE observations ADD COLUMN IF NOT EXISTS photo_url text;
CREATE UNIQUE INDEX IF NOT EXISTS observations_source_message_id_key ON observations(source_message_id);
ALTER TABLE incident_events ADD COLUMN IF NOT EXISTS id uuid;
ALTER TABLE incident_events ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}';
UPDATE incident_events SET id=gen_random_uuid() WHERE id IS NULL;
ALTER TABLE incident_events ALTER COLUMN id SET NOT NULL;
-- Retain legacy 'pending' records while new writes use the current status name.
ALTER TABLE incidents DROP CONSTRAINT IF EXISTS incidents_status_check;
ALTER TABLE incidents ADD CONSTRAINT incidents_status_check CHECK(status IN ('pending','pending_review','under_review','closed'));
ALTER TABLE incidents ALTER COLUMN status SET DEFAULT 'pending_review';
ALTER TABLE incidents ALTER COLUMN is_demo SET DEFAULT false;
ALTER TABLE report_drafts ADD COLUMN IF NOT EXISTS is_demo boolean NOT NULL DEFAULT false;
ALTER TABLE observations DROP CONSTRAINT IF EXISTS observations_source_check;
ALTER TABLE observations ADD CONSTRAINT observations_source_check CHECK(source IN ('web','imessage','demo'));
