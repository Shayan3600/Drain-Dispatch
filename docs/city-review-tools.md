# City Review tools — scope and verification

This change improves only the read-only `/city` workflow. It does not add staff authorization, assignments, work orders, private notes, city status writes or municipal submission. No database migration or production data writes are required.

## Map and queue

- City-specific interactive Leaflet map, clickable markers and evidence selection.
- Fit filtered reports and focus selected report controls; panning/zooming are retained during polling.
- Optional map-area queue filter. Selecting a report outside the current viewport does not close its evidence.
- Photo-evidence and multiple-submission filters, latest-observation timestamp and queue sort choices.
- Counts describe matching loaded reports, not an exhaustive city inventory. The read API still caps results at 500.

## Data freshness

Live mode polls every 30 seconds while the browser tab is visible; returning to a hidden tab triggers a catch-up read. Overlapping/obsolete reads are cancelled and reads have a 15-second deadline. Synthetic mode is explicit and uses manual refresh.

Keep the last good queue/evidence during refresh. Show last-success timestamps and error/stale warnings. Selected report, filters and packet photo opt-in persist for the same report. A stale copied packet carries an explicit warning. No POST/PATCH requests are made from city tools.

## Additive read API contract

`GET /api/incidents` adds optional `hasPhoto` and `latestObservationAt`. These are aggregated from persisted observations, including canonical `photo_id` and legacy photo URLs; no photo-table join multiplies counts. If metadata is absent from an older API, photo availability is unknown, and photo-only filtering explicitly excludes those unknown records.

`sort=updated` returns report-update order with a stable ID tie-break; `sort=created` and the default preserve report-creation order. City Review requests update-first ordering; consumer callers keep their existing default. Invalid sort values are rejected by the API validator.

## Verification

- Isolated in-memory PostgreSQL test: photo/no-photo/legacy-photo summaries, accurate count/latest timestamp, default/updated ordering and invalid query rejection.
- Browser tests: automatic refresh, retained selected evidence/photo choice, stale packet warning and recovery, hidden-tab pause/catch-up, map controls and mobile filters.
- Existing city tests: marker selection, demo labeling, public packet fields and copy fallback.

Tests use isolated data or mocked API responses; they do not send provider messages or access production records. Test-only Windows sandbox build/static-serving configuration is not part of the change.

## Release boundary

Review the branch/PR, then verify the additive API and `/city` on the team's agreed staging/deployment target. Do not assume a pushed branch is deployed. No changes to consumer reporting, Photon, AI analysis, notification dispatch or the shared consumer map are included.
