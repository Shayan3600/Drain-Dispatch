# DrainDispatch architecture

React + TypeScript + Vite + Tailwind + Leaflet browser, Express TypeScript API, PostgreSQL/Tiger Data and a persistent Spectrum worker. The original private repository was inaccessible; the product owner authorized a fresh repository. No uninspected original backend was overwritten or claimed preserved.

One shared reporting service owns incident creation, observations, duplicate suggestions and event writes. Browser and Photon both call it. Incidents represent locations/problems; observations represent submitted evidence. AI suggestions never substitute for location confirmation or municipal verification.

PostgreSQL transactions persist each report and its event history. Database constraints enforce UUID references and stable provider-message idempotency. Tiger Data event hypertables/time buckets support analytics where available. No silent in-memory production database fallback.

Uploads are byte-validated, size-limited and re-encoded to strip metadata before persistent storage. Gemini receives only sanitized images and returns a validated structured assessment. Provider secrets remain server-side. Public responses never contain messaging identities.

Draft links use cryptographically random tokens (or HMAC-derived unpredictable provider-retry tokens) with one-hour expirations. The draft lookup stores token hashes; privileged message retry receipts cache reply text, which can contain its confirmation link, so they must remain private and must never be logged or exported. Reporting starts only in a private messaging conversation. The browser confirms map coordinates. Row locking makes confirmation single-use under concurrent requests, and stored demo classification prevents real and demo drafts from merging. Moderator endpoints require an independent secret and keep status history with evidence. No automatic municipal filing.

Local development explicitly uses PGlite, a persistent embedded PostgreSQL runtime, and disk image storage. Production refuses local adapters and requires an external PostgreSQL URL and managed storage. Phone identifiers are HMAC-hashed for consent and receipts; public serializers exclude them. Worker sends only through the authenticated central API and disables SDK telemetry. Request payload hashes and transactions protect against retries; same-location merging requires human confirmation.

Weather awareness uses cached official NWS alerts for the Chapel Hill center, with unavailable state and coverage limitation. It does not predict flooding. Analytics count real observations and incident creation events; labeled demo records are excluded. Repeated locations use rounded coordinate cells: approximate clusters, not verified identical drains.

Deployment targets: static client (Vercel or equivalent), persistent API and worker (Railway or equivalent), Tiger Data PostgreSQL and managed image storage. No purchases or billable upgrades without approval.
