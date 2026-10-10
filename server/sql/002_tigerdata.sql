-- Run only on a configured Tiger Data/PostgreSQL service with Timescale available.
-- API detects the extension and uses time_bucket for analytics automatically.
CREATE EXTENSION IF NOT EXISTS timescaledb;
SELECT create_hypertable('incident_events', by_range('occurred_at'), if_not_exists => TRUE, migrate_data => TRUE);
