# DrainDispatch implementation plan

## Foundation
- [x] Read complete product brief and inspect workspace (empty), Node and Git.
- [x] Check available credentials without exposing values; no service variables found.
- [x] Original repository inaccessible; user authorized a fresh repository, Shayan3600/Drain-Dispatch.
- [x] Read project instructions/lessons; no original source was accessible or overwritten.
- [x] Install compatible dependencies and connect React/Vite to the new shared Express service.
- [x] PostgreSQL migrations: incidents, observations, photos, assessments, events, drafts, moderation, messaging receipts.
- [x] Verify database health and persistent report creation/retrieval.

## Core reporting
- [x] Chapel Hill interactive map with attribution, filters, detail panels and refresh.
- [x] Description, category, map location, explicit location confirmation, optional photo.
- [x] Validate all API inputs; public data excludes sender identities.
- [x] Transactional incidents + observations + events and retry protection.
- [x] Nearby suggestions within 30m considering category, recency and status; explicit same-location choice.
- [x] Detail pages, observation/photo/event history and follow-up contributions.

## AI and storage
- [x] Official Gemini SDK structured image assessment with schema validation and uncertainty.
- [x] Editable AI suggestions and graceful unavailable/irrelevant-image states.
- [x] Image byte/type/size validation, metadata stripping and persistent storage.
- [ ] Real blocked/clean drain, puddle and unrelated photo verification (credentials required).

## Photon
- [x] Official Spectrum worker; greeting, HELP, REPORT, STATUS, NEARBY, OBSERVE.
- [x] Attachment ingestion and Gemini analysis through shared services.
- [x] Persistent drafts with hashed expiring token and browser confirmation.
- [x] Persistent provider idempotency and consent-based follow-up preferences.
- [x] Adapter tests including retries, attachments and missing locations.
- [ ] Real send/reply and iMessage-to-dashboard verification (credentials required).

## Community and environment
- [x] Protected moderator status changes with supporting evidence and history.
- [x] Municipal reporting resources kept separate from internal status.
- [x] Live counts, categories, reporting trends, repeated locations, closed records and participation activity.
- [x] Implement Tiger Data hypertable migration and conditional time_bucket analytics.
- [ ] Verify real Tiger Data cloud connection and time-series queries.
- [x] Official NWS alerts with clear unavailable state and safe participation wording.

## Polish and launch
- [x] Responsive accessible Frutiger Aero interface and loading/error states.
- [x] Typecheck, build, backend tests, browser reporting/reload/detail flow, mobile QA.
- [ ] Commit and publish verified source to the new repository.
- [ ] Frontend/API/Photon worker deployment and production database/CORS checks.
- [ ] .tech domain only if available with no paid purchase.
- [x] Demo records clearly labeled and excluded from real metrics by default.
- [x] Demo script, Devpost copy, track eligibility evidence and screenshots.
- [ ] Recorded backup after live integration verification, rehearsal.


## Review and launch readiness

Local prototype verified October 10, 2026:
- Typechecking and client/server production builds pass.
- 26 backend/image/Photon/notification tests pass: validation, real PostgreSQL persistence/reopen, report/observation retries, matching, moderation authorization, draft expiry/confirmation, attachments, private consent, notification leases and cancellation.
- Five Playwright tests pass: reporting/reload/follow-up, mobile layout, explicit duplicate consolidation, simulated message-to-browser confirmation, actual photo persistence and correction of mocked AI suggestions.
- npm audit reports zero vulnerabilities; compatible patched OpenTelemetry override retained. See integration-status.md for the npm ls reporting limitation.
- Desktop/mobile screenshots inspected; three labeled demonstration records persist locally and do not affect real metrics.
- Local API and website run on ports 3001 and 5173. NWS alert retrieval succeeded locally; weather failures also have an unavailable state.
- .env, local database, uploads and generated artifacts are excluded from Git. Docker/Railway/Vercel/CI configuration exists; no public deployment or Docker runtime has been verified.

Remaining launch blockers: no live Gemini, Photon, Tiger Data, Cloudinary or hosting credentials. Real representative-image evaluation, live send/reply/status notification tests, public URLs, production database/CORS/worker checks, .tech domain, recorded live backup and rehearsal remain pending. No sponsor eligibility involving a real service is claimed. All originally requested features remain in scope.

Known limits: single Photon line; at-least-once outbound notifications; STOP cannot recall an in-flight message; weather coverage is Chapel Hill center; repeated coordinates are approximate clusters; no municipal filing or verified municipal partnership. Moderation evidence is supplied by an authorized moderator, not independently verified city action. Full accessibility compliance and multi-line messaging require further review.

Additional feature implemented and tested: consent-driven status notifications via private subscriptions and a persistent leased outbox; retries of an old CONSENT cannot override a later STOP.
