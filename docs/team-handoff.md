## Verified development handoff — October 10, 2026
### Current release and evidence
- **Repository:** [Shayan3600/Drain-Dispatch](https://github.com/Shayan3600/Drain-Dispatch), exclusively. Work is on `development/live-integrations`; [PR #1](https://github.com/Shayan3600/Drain-Dispatch/pull/1) is open. Main was preserved; no force-push or history rewrite.
- **Verified source:** commit `983652d`. Both [pull-request CI](https://github.com/Shayan3600/Drain-Dispatch/actions/runs/38082746986) and [push CI](https://github.com/Shayan3600/Drain-Dispatch/actions/runs/38082722789) passed: fresh installation, typecheck, 43 backend tests, production build, seven browser flows, dependency audit and secret checks.
- **Human proof:** an actual iPhone text and photo were received through Photon, replies arrived, location confirmation persisted, and the owner confirmed both saved test reports and map markers. Independent service/database/browser checks verified the photo, findings, observation and event history.
- **Public-session status:** testing complete. Temporary HTTPS tunnel and messaging worker stopped; local-only URL settings restored. Saved reports, photo, assessment and drafts retained. Local app remains available; this is not a durable production deployment.
- **Release direction:** production deployment is authorized when ready. Durable host/account authentication and deployed acceptance checks are still required.
### Implemented reporting workflow
1. A resident sends text or a drain photo through the configured Photon iMessage conversation, or uses the web report form.
2. The worker ignores outbound messages, caps incoming attachment bytes, and uses an authenticated central API. Receipts and private sender hashes make retries idempotent.
3. Sharp rotates/resizes the image and removes metadata; Cloudinary stores a sanitized JPEG. Gemini returns structured visible findings, a suggested category and uncertainty. Users review/edit the interpretation; AI does not invent a location or predict flooding.
4. A private browser link confirms location/category and asks whether to create a report or add an observation to an existing one.
5. Tiger Data saves the incident, photograph association, observation and timestamped events. The map/detail view displays evidence, counts and history after reload.
6. The Town's official reporting resource is a separate handoff link. Opening it is not proof that the Town received or resolved a report.
### Sponsor verification
- **Photon / Spectrum — real service verified:** actual inbound text and photo, outbound replies and secure RESUME recovery. Canonical settings are `SPECTRUM_PROJECT_ID` and `SPECTRUM_PROJECT_SECRET`; legacy PHOTON names remain accepted. Durable worker hosting and a live consenting status-notification delivery remain pending.
- **Gemini — real service verified:** actual iPhone image and four licensed reference images assessed with `gemini-3.1-flash-lite`. Findings persist and render; strict output validation and safe errors are implemented. Two reference requests needed one retry. This is bounded functional evidence, not an accuracy benchmark.
- **Tiger Data — real service verified:** authenticated TLS connection, additive legacy-schema migrations, preserved existing records, Timescale event hypertable, persistent/idempotent reporting, observation/history queries and UTC activity buckets.
- **Cloudinary — real service verified:** actual upload, HTTPS JPEG delivery, metadata removal, confirmed photo association and loaded dashboard image. Verification fixtures were cleaned up; the owner's saved image was preserved. Abandoned-photo retention remains a launch policy decision.
- **NWS — real endpoint verified:** current official alerts, retrieval time, Chapel Hill center coverage and explicit unavailable state. No per-drain forecast or flood-prevention claim.
### Community, analytics and frontend
- Possible duplicates are nearby active reports of the same category within 30 meters and 30 days. Users explicitly choose; reports are never automatically merged. Observations show count, photographs and history.
- Two simulated contributors were tested against real Tiger Data: one shared incident, two confirmed observations, retry creates none, unconfirmed evidence creates none, and private identities stay out of public responses. Two actual humans through Photon remain a separate live acceptance check.
- Thirty-day UTC activity includes the current partial day plus 29 preceding days. Incidents, observations and status-review events are shown with an accessible daily table and recent activity bars. Status reviews are not a count of municipal repairs.
- Labeled DEMO tests are excluded from real metrics. Enable **Include labeled demo reports** to browse them; separate demo-preview counts explain why both test markers can be visible while real totals are zero.
- Frutiger Aero implementation uses glossy water-inspired blue/green surfaces, translucent panels, environmental artwork and readable incident controls. Mobile review covered 390 × 844, 16px form controls, touch targets and persistent dialog close controls.
### Recovery fixes and operator runbook
- The earlier tunnel was closed before the owner finished dashboard inspection. The replacement session was kept available until the owner confirmed success; the operational lesson is recorded.
- **RESUME:** send in the same private Photon conversation after a testing URL change. Sender-scoped recovery rotates/renews the confirmation token without reuploading or losing saved evidence. Other senders/groups cannot recover it; retries replay the cached response.
- Confirmed drafts now open **the saved report**, clear filters that hide it, enable its demo visibility when appropriate, focus its map marker and remove the private token from the address on return. No repeated submission is made.
- JPEG, PNG and WebP are supported. This Windows image runtime cannot decode HEIC; use a screenshot/PNG or iPhone Camera → Formats → Most Compatible for JPEG.
- Commands implemented: `HELP`, `REPORT`, `RESUME`, `STATUS`, `NEARBY`, `OBSERVE`, `CONSENT`, `STOP`. Photo observations require explicit same-drain confirmation. Consent-based updates use a persistent outbox; delivery is at least once, and STOP cannot recall an in-flight message.
### Team setup and safe collaboration
1. Use the development branch or PR until merged. Node 22+ is required; Node 24 is recommended.
2. Run `npm ci`, then `npm run dev` (API 3001, web 5173). Copy `.env.example` only when no local `.env` exists; never overwrite existing credentials. See [setup](https://github.com/Shayan3600/Drain-Dispatch/blob/development/live-integrations/docs/setup.md).
3. Offline development supports explicit local PostgreSQL/photo adapters. A configured cloud connection takes precedence. Real production requires remote Tiger Data, Cloudinary and the configured integrations.
4. Run `npm run typecheck`, `npm test`, `npm run build`, and `npm run test:browser`. Browser tests use their own local database/API and do not touch cloud credentials or send provider messages.
5. Deploy API/frontend plus a separate persistent Photon worker. Configure secrets through the host's dedicated secret manager, verify HTTPS/public base URL and origins, and run the deployment checklist. A temporary tunnel is only a bounded phone-testing session.
6. Before every push: inspect ignored/staged files, scan exact source and outgoing history with the known-credential scanner and Gitleaks, and verify the public build. Never force-push shared history.
### Privacy and release safeguards
- Credential files, downloaded database credentials, local data/uploads and screenshots are excluded from Git and Docker context. No secrets, phone numbers, provider identities, private confirmation links or raw provider/database errors belong in Notion, GitHub or demo artifacts.
- Public sensitive-file paths are denied; moderator, worker and notification routes require authorization. Public submissions are rate-limited and validated; image limits and sanitization are enforced.
- Current publicly demonstrated records are explicitly approved, labeled tests. Use synthetic or approved evidence for any broader release or recording.
- Latest full-history/source/build credential scans and Gitleaks reported zero findings; dependency audit reported zero vulnerabilities.
### Remaining milestones — retain in scope
- [ ] Authenticated durable HTTPS hosting and persistent worker; verify deployed health, migration safety, report/photo reload, CORS, reply delivery and restart persistence.
- [ ] Two actual human reporters joining one incident and one live consenting status update.
- [ ] Chapel Hill GIS environmental overlays and verified inlet inventory/asset association if obtainable; retain source attribution and unknown values. Durham research must not be presented as Chapel Hill infrastructure.
- [ ] Additional hourly activity view and explainable attention context if useful; no validated flood-prediction claim.
- [ ] Photo retention/cleanup policy, broader image evaluation and accessibility review.
- [ ] Timed rehearsal, recorded safe backup, final Devpost fields, actual sponsor eligibility/deadline confirmation and optional domain.
### Documentation for reviewers and demo operators
- [Verification evidence](https://github.com/Shayan3600/Drain-Dispatch/blob/development/live-integrations/docs/verification-evidence.md)
- [Integration contracts and limits](https://github.com/Shayan3600/Drain-Dispatch/blob/development/live-integrations/docs/integration-status.md)
- [Licensed image validation](https://github.com/Shayan3600/Drain-Dispatch/blob/development/live-integrations/docs/photo-validation.md)
- [API contract](https://github.com/Shayan3600/Drain-Dispatch/blob/development/live-integrations/docs/api-contract.md)
- [Two-minute script and operator checklist](https://github.com/Shayan3600/Drain-Dispatch/blob/development/live-integrations/docs/demo-script.md)
- [Submission draft](https://github.com/Shayan3600/Drain-Dispatch/blob/development/live-integrations/docs/submission.md)

