CREATE TABLE IF NOT EXISTS incidents (
 id uuid PRIMARY KEY, latitude double precision NOT NULL CHECK(latitude BETWEEN -90 AND 90),
 longitude double precision NOT NULL CHECK(longitude BETWEEN -180 AND 180), description text NOT NULL,
 issue_type text NOT NULL CHECK(issue_type IN ('blocked_drain','standing_water','damaged_drain','other')),
 status text NOT NULL DEFAULT 'pending_review' CHECK(status IN ('pending_review','under_review','closed')),
 is_demo boolean NOT NULL DEFAULT false, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS incidents_location ON incidents(latitude,longitude);
CREATE TABLE IF NOT EXISTS photos (
 id uuid PRIMARY KEY, url text NOT NULL, storage_key text NOT NULL, mime_type text NOT NULL,
 assessment jsonb, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS observations (
 id uuid PRIMARY KEY, incident_id uuid NOT NULL REFERENCES incidents(id), description text NOT NULL,
 source text NOT NULL CHECK(source IN ('web','imessage','demo')), photo_id uuid REFERENCES photos(id),
 source_message_id text UNIQUE, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS observation_incident ON observations(incident_id,created_at);
CREATE TABLE IF NOT EXISTS incident_events (
 id uuid NOT NULL, occurred_at timestamptz NOT NULL DEFAULT now(), incident_id uuid NOT NULL REFERENCES incidents(id),
 event_type text NOT NULL, source text NOT NULL, metadata jsonb NOT NULL DEFAULT '{}', PRIMARY KEY(id,occurred_at)
);
CREATE INDEX IF NOT EXISTS events_incident ON incident_events(incident_id,occurred_at DESC);
CREATE TABLE IF NOT EXISTS report_drafts (
 id uuid PRIMARY KEY, token_hash text UNIQUE NOT NULL, source text NOT NULL, description text NOT NULL,
 issue_type text NOT NULL, photo_id uuid REFERENCES photos(id), source_message_id text UNIQUE,
 expires_at timestamptz NOT NULL, confirmed_incident_id uuid REFERENCES incidents(id), created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS request_receipts (
 request_key text PRIMARY KEY, payload_hash text NOT NULL, result jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS message_receipts (
 message_id text PRIMARY KEY, payload_hash text, response_text text, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS moderation_history (
 id uuid PRIMARY KEY, incident_id uuid NOT NULL REFERENCES incidents(id), previous_status text NOT NULL,
 new_status text NOT NULL, actor text NOT NULL, evidence text NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS messaging_preferences (
 sender_hash text PRIMARY KEY, follow_up_consent boolean NOT NULL DEFAULT false, updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS message_context (
 source_message_id text PRIMARY KEY, sender_hash text NOT NULL, chat_id text NOT NULL
);
CREATE TABLE IF NOT EXISTS incident_subscriptions (
 incident_id uuid NOT NULL REFERENCES incidents(id), sender_hash text NOT NULL, chat_id text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(incident_id,sender_hash,chat_id)
);
CREATE TABLE IF NOT EXISTS notification_outbox (
 id uuid PRIMARY KEY, incident_id uuid NOT NULL REFERENCES incidents(id), sender_hash text NOT NULL,
 chat_id text NOT NULL, response_text text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
 delivered_at timestamptz, cancelled_at timestamptz, lease_token uuid, lease_expires_at timestamptz, attempts integer NOT NULL DEFAULT 0
);
