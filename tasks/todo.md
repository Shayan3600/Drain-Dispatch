# DrainDispatch implementation plan

## Team handoff and verified publication

- [x] Verify the owner finished reviewing both saved reports and map markers; close the temporary tunnel and Photon worker, restoring local-only settings.
- [x] Publish safe source on development/live-integrations with PR #1; verify push and pull-request CI.
- [x] Update the existing team Notion plan with verified milestones, current workflow, setup/security guidance and clearly pending GIS/deployment/demo work.
- [x] Read back the Notion changes and verify existing team planning content is preserved.
- [x] Publish final safe verification documentation after repeat secret scans; commit 5b87b3d and its Docker runtime CI passed.

Plan checkpoint: update the supplied Notion page in place, retaining team assignments and research. Distinguish verified real services from simulated duplicate contributors and planned public GIS. Never transfer credential files, private confirmation links or private user evidence to Notion.

## Production readiness and release

- [x] Inspect available production host configuration and authentication without exposing values; Railway project and CLI are connected.
- [x] Re-run meaningful release checks; verify production safety, migrations, public data labeling and persistent worker deployment requirements.
- [x] Deploy to the authorized production target, using dedicated secret configuration and safe source only.
- [x] Verify deployed health, report/photo persistence, dashboard and worker operation; record actual release status in the team handoff.

Release checkpoint: the owner authorized production deployment when ready. A durable host and its authenticated account are required; an expired temporary tunnel is not production. Preserve database records, avoid destructive migrations and do not transfer private files.

Release re-plan: Railway is connected to the owner's existing desirable-emotion production project; CLI authorization is complete. Its automatic monorepo services had no credentials and used development commands. Reuse the API service for built website/API and the other service for the persistent worker; preserve both services and all database records. New Railway services reject deprecated config-file settings, so use reviewed staged service configuration instead of assigning the legacy TOML paths. Transfer individual existing values only through dedicated variable stdin settings, suppressing diagnostics and never uploading .env files. PR #2 city-review is imported with original signed history; fix marker/demo labeling and verify the integrated routes before publication/merge/deployment.

Release verification re-plan: parallel CI exposed a timing-dependent browser assertion that matched both the activity total and incident detail count. Scope the assertion to the incident dialog, preserving product behavior. All five reporting browser flows pass locally after the fix. Release commit 0243c778 is scanned and published; both push and PR CI passed before applying the reviewed non-destructive Railway deployment.

Production review: Railway API and private worker are online, each with one running replica and none crashed. External HTTPS acceptance verified PostgreSQL/Timescale, two retained DEMO cards/markers, loaded photo/findings/history, mobile fit, city packet privacy, NWS, denied sensitive/protected routes and invalid input rejection. No dataset mutations were observed. Worker logs confirm real Photon authentication and listener startup. PR #1 merged; PR #2 closed as included, with original signed history and the teammate's concurrent logo preserved. The owner was asked for a fresh hosted RESUME check; that human check, deliberate restart testing and live consenting notifications are not claimed complete. See verification-evidence.md.

## Next milestones after real iPhone text test

- [x] Independently verify the owner's Photon report in Tiger Data and dashboard; capture safe evidence.
- [x] Prepare a fresh temporary session and verify real iPhone photo ingestion, Gemini findings, Cloudinary storage, confirmed incident and dashboard image.
- [x] Verify two-contributor duplicate coordination, observation counts and history with real database records (synthetic contributors; real Tiger Data).
- [x] Polish mobile map/details/statistics and Aero styling while preserving reporting functionality.
- [x] Verify useful time-series/environmental dashboard and weather context.
- [x] Update demo/submission evidence, comprehensive checks, secret scans, safe development branch and PR.
- [x] Close the temporary session after live testing; preserve all private configuration and existing work.

Plan checkpoint: first real receive/reply was confirmed by the worker and owner; independently inspect persistence before claiming the full result. The photo milestone takes priority. Any new public session uses the same approved single production-app scope, verified public dataset, protected endpoints and temporary lifetime.

## Photo-session recovery plan

- [x] Diagnose Cloudflare error: tunnel was closed before owner dashboard inspection; application and confirmed data remain healthy.
- [x] Reopen the approved single-app HTTPS session, preserve credentials/data, update public base URL, and externally verify protections.
- [x] Add sender-scoped RESUME to recover an existing photo draft without reuploading or exposing tokens; verify isolation, expiration and retry behavior.
- [x] Let the owner inspect the persisted dashboard/photo/location; keep the temporary session open until owner finishes or the announced safety deadline.
- [x] Complete final checks, secret scan, development branch publication and PR; update review evidence accurately.

Re-plan checkpoint: stop assuming service verification ends the human session. Existing incident, photograph, assessment and confirmation are preserved. No data reset, deletion or repeated upload is needed.

Dashboard correction checkpoint: public mobile verification returns two active demo incidents and shows both cards/markers when enabled, while real-only statistics correctly stay zero. Confirmed RESUME drafts currently reopen the form instead of the saved location. Fix saved-report restoration, dashboard filtering/map focus and clear demo-preview counts; verify the end-to-end return path before publication.

## Credential activation and continued development - October 10, 2026

- [x] Confirm origin is Shayan3600/Drain-Dispatch and preserve existing history.
- [x] Inspect environment variable names only and extend exclusions to downloaded credential files.
- [x] Standardize Spectrum variable names with backward compatibility and preserve local values.
- [x] Validate real Tiger Data connection, migrations, time-series queries and persistent reporting.
- [x] Validate real Cloudinary storage and Gemini image assessment.
- [x] Validate real Spectrum authentication, line availability and inbound reporting worker.
- [x] Verify iMessage draft -> browser confirmation -> Tiger Data incident -> map.
- [x] Resolve configuration/build/test issues, run automated secret scans of source and history.
- [x] Publish safe source to the configured repository; verify CI and document precise live-service results.
- [x] Continue deployment/demo preparation and record genuine external blockers.

Plan checkpoint: preserve all planned features and credential values; no environment file is included in Git or transferred externally. Service authentication uses credentials only through the corresponding service SDK. Root owns security/publication and frontend verification; focused agents own Tiger Data configuration, Gemini/Cloudinary and Spectrum verification.

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
- [x] Real blocked/mostly-clear drain, puddle and unrelated photo verification; coverage and licenses in docs/photo-validation.md.

## Photon
- [x] Official Spectrum worker; greeting, HELP, REPORT, STATUS, NEARBY, OBSERVE.
- [x] Attachment ingestion and Gemini analysis through shared services.
- [x] Persistent drafts with hashed expiring token and browser confirmation.
- [x] Persistent provider idempotency and consent-based follow-up preferences.
- [x] Adapter tests including retries, attachments and missing locations.
- [x] Real text send/reply and iMessage-to-dashboard verification (human iPhone test and independent persistence/display checks passed).

## Community and environment
- [x] Protected moderator status changes with supporting evidence and history.
- [x] Municipal reporting resources kept separate from internal status.
- [x] Live counts, categories, reporting trends, repeated locations, closed records and participation activity.
- [x] Implement Tiger Data hypertable migration and conditional time_bucket analytics.
- [x] Verify real Tiger Data cloud connection and time-series queries.
- [x] Official NWS alerts with clear unavailable state and safe participation wording.

## Polish and launch
- [x] Responsive accessible Frutiger Aero interface and loading/error states.
- [x] Typecheck, build, backend tests, browser reporting/reload/detail flow, mobile QA.
- [x] Commit and publish verified source to the new repository.
- [x] Frontend/API/Photon worker deployment and production database/CORS checks.
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
- Published source to the private [Shayan3600/Drain-Dispatch repository](https://github.com/Shayan3600/Drain-Dispatch). Local main follows origin/main; the original local commit is preserved on local-checkpoint.
- [GitHub CI run 38077385193](https://github.com/Shayan3600/Drain-Dispatch/actions/runs/38077385193) passed against source commit e1a326a6383e058bef4ab326957bbafdc7e686dc: fresh Linux npm ci, typecheck, 26 tests, build, five browser tests and dependency audit.
- .env, local database, uploads and generated artifacts are excluded from Git. Docker/Railway/Vercel/CI configuration exists; no public deployment or Docker runtime has been verified.

Credential activation review, October 10, 2026:
- All 35 backend/configuration/migration/image/Photon tests and five browser flows pass; typecheck/build pass; npm audit reports zero vulnerabilities.
- Actual Tiger Data TLS/authentication, additive upgrade of the older schema, preserved pre-existing data/evidence/source IDs, hypertable, time_bucket, idempotency, reconnect persistence and demo exclusion pass. Only probe-created test records were removed.
- Actual Cloudinary authentication/upload/delivery/metadata removal/cleanup pass. Actual Gemini assessment passes four licensed reference photographs; two requests needed one retry. Faster gemini-3.1-flash-lite is configured and provider failures have safe actionable messages.
- Actual Spectrum authentication, enabled iMessage platform and shared-mode token issuance pass. Human text inbound/reply/location confirmation and independent Tiger Data/dashboard checks now pass. Status notification delivery remains pending.
- Owner approved a temporary HTTPS testing tunnel after local preflight: no public records existed; private credential/source paths are blocked; worker/moderator/outbox routes require authentication; inputs are validated and rate limited. Only the production app is exposed; tunnel closes after the test session. This is not durable hosting.
- Gitleaks history/source scans and the known-credential scan of working/staged source, history and public build report zero findings. Credential files remain local, ignored in Git and Docker context.

Remaining launch checks: durable hosting/account configuration, production worker operation, .tech domain, recorded live backup and rehearsal. Owner inspection is complete and temporary public testing is closed. Sponsor-service verification evidence is documented; official current prize-track eligibility still requires confirmation. All originally requested features remain in scope.

Known limits: single Photon line; at-least-once outbound notifications; STOP cannot recall an in-flight message; weather coverage is Chapel Hill center; repeated coordinates are approximate clusters; no municipal filing or verified municipal partnership. Moderation evidence is supplied by an authorized moderator, not independently verified city action. Full accessibility compliance and multi-line messaging require further review.

Additional feature implemented and tested: consent-driven status notifications via private subscriptions and a persistent leased outbox; retries of an old CONSENT cannot override a later STOP.

## Review after the owner's first live test

- Independent cloud and browser checks proved the actual text incident, confirmation, observation, history, dashboard card and map marker. Only the verified synthetic DEMO was labeled and excluded from real metrics.
- 39 backend tests, five browser flows, typecheck/build and zero-vulnerability audit pass before analytics extensions.
- Real incoming Photon photograph, central API completion and reply-send completion pass. Cloudinary JPEG delivery, metadata stripping, persisted Gemini structured assessment, confirmed incident/photo association and loaded dashboard image/findings/history pass independently.
- Confirmed photo OBSERVE now attaches to the existing incident, with no repeated upload/observation on retry and no upload before explicit same-drain confirmation. iPhone HEIC errors explain JPEG/PNG alternatives.
- Two simulated contributors were verified against real Tiger Data without changing real totals or actual reports. Mobile evidence/help/form layouts were visually checked at 390 × 844.
- The first tunnel/worker closed after the text test. The fresh photo tunnel exposes only the protected production app and automatically expires after 30 minutes; close it as soon as this session finishes.

Final extension checks: 43 backend tests and seven browser flows pass; typecheck and production builds pass; dependency audit reports zero vulnerabilities. Actual Tiger Data UTC activity queries and live NWS availability/coverage/timestamps pass. Legacy is_demo=true default was corrected without changing existing incident rows. Actual secure RESUME delivery and external restored-page checks pass, preserving saved evidence and confirmed records. The saved-report return path now enables demo visibility, clears hiding filters and focuses its marker without another POST; separate demo-preview counts explain zero real metrics. The owner confirmed this fix and both map records. The temporary tunnel and worker are stopped and original local URL settings restored.

Production review: role-specific startup validation rejects incomplete sponsor/public URL configuration before database/provider calls; protected-route secrets must be independent. The worker's Railway service settings omit the API's HTTP health check and use compiled JavaScript. The suite has 49 passing backend tests and ten browser flows, including city-review coverage. Docker build/runtime CI passed against 5b87b3d. Railway is connected and individually scoped secrets are configured through CLI stdin; no .env file was uploaded. Staged service changes are reviewed and non-destructive. A deployment is not claimed until hosted acceptance succeeds.
