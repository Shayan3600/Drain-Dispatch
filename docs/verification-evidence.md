# Verification evidence — October 10, 2026

Evidence excludes credentials, sender identities, private confirmation links and raw service logs. Boolean checks are performed against the actual services; isolated tests and simulated contributors are identified separately.

## Human iMessage text workflow

The owner sent REPORT DEMO on an iPhone, received the Photon reply, followed the location confirmation, submitted it and opened the Town's official reporting resource. The worker recorded receipt, central API completion and reply-send completion using content-free markers.

Independent Tiger Data queries verified one corresponding messaging incident, a persisted confirmation, an iMessage observation and an incident-created event. The public API returned that incident. Browser verification found its dashboard card, map marker, messaging observation and loaded history. The synthetic DEMO was labeled and excluded from real analytics; enable **Include labeled demo reports** to view it. Opening the Town resource is a separate outbound link and does not establish municipal filing.

Local review evidence: `docs/screenshots/real-text-report.png`. It contains only the owner-approved synthetic report and public dashboard; screenshots remain excluded from Git. No phone number, chat identifier, token or credential was recorded in the evidence.

## Real photo services

The licensed USGS photograph completed `/api/uploads` → sanitized JPEG → actual Cloudinary HTTPS delivery → actual Gemini structured findings → persisted Tiger Data photo/assessment. Its exact unreferenced test photo and asset were removed. [Photo sources and validation](photo-validation.md) document limits and attribution.

The owner then sent a real photograph through iMessage. Content-free worker markers verified actual attachment receipt, central API completion and provider reply-send completion. Independent checks verified the photograph and strict Gemini assessment persisted, Cloudinary delivered JPEG bytes with EXIF/XMP/IPTC absent, the active confirmation link was valid, confirmation referenced an incident, and its messaging observation referenced that photo. Browser verification scrolled the lazy-loaded photograph into view and checked nonzero natural image dimensions, visible findings and history. `docs/screenshots/real-photo-workflow.png` is local evidence with report text, coordinates and identifiers withheld. The actual image remains associated with the saved report; it was not deleted or reset.

## Community coordination in real Tiger Data

`npx tsx server/scripts/verify-coordination.ts` exercises two generated synthetic sender identities against the cloud database. Two explicitly confirmed observations attach to one incident, retrying adds none, an unconfirmed observation creates none, a nearby report stays separate without explicit matching, public details exclude sender identities, and history remains complete. Two simulated event dates produce the expected daily buckets. Demo fixtures are excluded from real analytics from insertion; only invocation-created records are removed.

This is real database verification with simulated contributors. It does not claim two humans sent real provider messages.

## Mobile review

Synthetic API fixtures were used for the four `mobile-*-preview.png` screenshots in `docs/screenshots/`. The dashboard, evidence/history, follow-up and photo-help layouts fit 390 × 844 without horizontal overflow. Forms use 16px controls and dialog actions meet 44px touch targets. The modal close control remains visible when scrolling.

## Temporary exposure and remaining proof

The first text-testing tunnel and worker were closed after success. A new single-app HTTPS tunnel is used only for the next photo session, with a 30-minute automatic lifetime and immediate manual shutdown. Credential/source paths are denied; moderator, worker and follow-up routes require independent authorization; submissions are validated and rate limited. The preflight found only the labeled synthetic report before reopening.

The second tunnel closed after technical verification, before the owner finished inspecting the dashboard. A replacement temporary session was externally verified and opened for that review; this operational mistake is recorded in tasks/lessons.md. The owner subsequently confirmed both saved reports and map markers. The replacement tunnel and Photon worker were stopped, their process termination checked, and original local URL settings restored without changing credentials or saved evidence. Durable hosting, live consenting status-notification delivery, recorded backup/rehearsal and current prize-track eligibility remain separate checks. Never include private configuration or provider messages in demonstration artifacts.

Recovery checks externally verified the existing confirmation page and draft at the replacement HTTPS host, retaining the original photo, structured findings and confirmed incident. The implemented RESUME command binds recovery to the same hashed sender in a private conversation, rotates the token atomically with its cached reply, renews expiry and preserves confirmed records. Automated tests prove other senders/groups cannot obtain that link, expired photo drafts retain evidence and retries do not rotate repeatedly. Actual RESUME processing/reply delivery and the fresh private page were verified; the owner confirmed that link works.

The owner then reported an empty dashboard. Fresh public mobile reproduction returned two active demo records, both cards and markers with demo visibility enabled, and zero real-only statistics. The confirmed-draft UI was nevertheless reopening a form instead of its saved incident. It now restores the existing record without another POST, resets hiding filters, enables its demo visibility, focuses/highlights its marker and returns to the map. Separate demo-preview counts explain zero real statistics. A public mobile browser verified this against the actual recovered report without printing tokens; a regression covers closed/out-of-area demo records, hidden filters and zero repeated writes. The owner confirmed the restored saved-report page and both map records worked.

## Publication and team handoff

Safe source commit `983652d13c1babe70b6fdd49f5a21a24ac3a8735` is on `development/live-integrations` in Shayan3600/Drain-Dispatch, with [PR #1](https://github.com/Shayan3600/Drain-Dispatch/pull/1) open. Both [pull-request CI](https://github.com/Shayan3600/Drain-Dispatch/actions/runs/38082746986) and [push CI](https://github.com/Shayan3600/Drain-Dispatch/actions/runs/38082722789) passed against that exact source: 43 backend tests, seven browser flows, typecheck/build, dependency audit and secret checks. Main history was preserved. Full-history and exact staged-source Gitleaks scans and the known-credential/public-build scan reported zero findings before publication.

The existing team Notion plan was updated in place and read back: current status, completed checklists, real-service evidence, recovery/runbook, privacy boundaries and launch work were verified; existing team assignments, GIS research and linked Figma planning were preserved. [Team handoff](team-handoff.md) mirrors the safe milestone notes. Production deployment is authorized when ready; authenticated hosting, deployed acceptance checks and a persistent worker are still required.

## Time-series and weather

Read-only actual Tiger Data verification confirmed UTC daily boundaries even with an America/Los_Angeles database session, real-only observation counts and Timescale buckets over the current partial UTC day plus 29 preceding days. The dashboard exposes exact observation/review values and an accessible daily table; synthetic fixtures verified counts, missing-day zero filling and mobile layout. Current real totals may be zero because the human tests were synthetic DEMOs. The live NWS endpoint returned HTTP 200, official source/coverage and a recent retrieval timestamp with zero relevant alerts; this is current alert context, not a flood prediction.


## Production release

CI-tested release `0243c778` is deployed to [Railway HTTPS](https://draindispatchserver-production.up.railway.app), with [city review](https://draindispatchserver-production.up.railway.app/city). Both [PR CI](https://github.com/Shayan3600/Drain-Dispatch/actions/runs/38099754164) and [push CI](https://github.com/Shayan3600/Drain-Dispatch/actions/runs/38099751587) passed: 49 backend tests, ten browser flows, typecheck/build, Docker build/runtime, audit and fully redacted secret scans. A timing-dependent count assertion was scoped to its incident dialog. PR #1 is merged; PR #2 is closed as included with signed ancestry preserved. A concurrent teammate logo addition remains on main.

The existing API service runs the built website/API; the existing second service runs the compiled private Photon worker with no public domain. Both have one running replica and zero crashed replicas. Source is pinned to the tested commit, so later pushes require a separately reviewed deployment. Existing credentials were configured individually through dedicated authenticated secret settings via stdin, never through .env uploads. Shared worker identity credentials were preserved. No destructive migrations, database resets or evidence cleanup were performed.

External acceptance returned HTTPS health 200 with PostgreSQL and Timescale enabled. Two retained reports are DEMO-labeled; mobile rendering showed two cards/two markers, no horizontal overflow, loaded Cloudinary photo, Gemini findings and history. City review showed accurate test labels, one selected marker and a packet excluding private fields. NWS returned available/200. Eight sensitive paths returned 404, six protected routes returned 401 without credentials, and an invalid unconfirmed submission returned 400. Public assets/security headers passed; zero browser errors or mutations were observed, and report IDs were unchanged. Content-free worker log checks confirmed actual Photon project authentication and listener startup.

Earlier owner-operated text/photo/RESUME proof remains valid; a fresh hosted iPhone reply, deliberate restart test, two real contributors joining one incident and live consenting status notification remain separate acceptance steps. Send RESUME in the same private conversation to test the production confirmation URL without reuploading saved evidence. Temporary tunnels and local messaging workers remain stopped. No raw logs, private links, identifiers or new screenshots were published.
