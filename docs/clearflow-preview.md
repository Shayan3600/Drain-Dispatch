# Clearflow design preview

The owner supplied Clearflow Website v5 and confirmed the brand **Clearflow**, close visual fidelity, and **preview only**. Production remains pinned to its previously verified release. No Railway changes, public URL changes, credential rotations, database resets or new public tunnels are part of this preview.

The preview starts from current main `b9931a1`, including merged PR #4's city map controls, polling, stale-evidence warnings, read-only sort/metadata API and tests. Original signed history and the logo are preserved. Repository/package/database/internal identifiers remain compatible under the new public name.

PR #5's employee interface is integrated with its original signed feature history. The review page uses Clearflow styling and the supplied logo, category/count marker palettes, accessible custom filters and saved API evidence. Counts indicate submissions, not hazard severity. The main page's **Employee login** link opens `/employee/login`; **Continue to demo** enters `/employee`. Sign out clears the tab's demo preference. `/city` remains a compatible employee entry. No passwords are collected and no backend permission is granted by this presentation gate.

Marketing copy is replaced with short reporting instructions. Reporting confirmations, photo limits, Town reporting distinctions and necessary privacy/safety guidance remain.

## Preserved working behavior

- Real web and iMessage reports, capped/sanitized photographs, Gemini interpretation and human review, Cloudinary storage and Tiger Data persistence.
- Private confirmation links, sender-scoped RESUME, confirmed-report recovery without another submission, explicit location and same-drain confirmation, idempotent receipts.
- Community observations, duplicate suggestions, report/photo details, status history, separate DEMO visibility/counts, thirty-day UTC analytics and official weather context.
- City queue/map tools, current viewport/photo/status filters, evidence freshness, public-field-only report packets, manual clipboard fallback and the separate Town reporting resource.
- Authenticated moderator/worker/outbox endpoints, rate limits, credential-file denials, validated input and local isolated tests.

The ZIP's standalone form prepares downloads and device-only drafts; those mock interactions are replaced with the existing service-backed reporting flow. Copy distinguishes community publication from municipal filing. Actual image formats and the 8 MB limit remain authoritative. Supplied assets/credits are retained with provenance; no claim of commercial font licensing is added.

## Map failure diagnosis

The Windows Brave screenshot shows OSM HTTP 403 policy-error tiles. Both the prior HTML meta and Helmet defaults suppressed Referer. [OSM's tile policy](https://operations.osmfoundation.org/policies/tiles/) requires a valid Referer for web applications. Page/server policy now uses strict-origin-when-cross-origin; map images explicitly send only the origin. Private confirmation paths and tokens are excluded. Maps retain attribution and browser caching; there is no provider rotation or cache-busting to evade a block. Background failures remain visible as an actionable error while incident markers remain usable. Automated browser tests use synthetic tile responses instead of bulk-loading public OSM infrastructure.

## Verification and review

Verified locally:

- Final typecheck and production build pass; 51 backend tests pass; dependency audit reports zero vulnerabilities.
- All 28 browser flows pass in installed Windows Brave: reporting, duplicate observation, uploaded JPEG persistence, editable mocked Gemini findings, private draft recovery, city polling/stale evidence, map recovery/resize/referrer privacy, Clearflow assets, demo login/sign out, keyboard filters, count palettes and mobile/accessibility controls.
- One limited desktop viewport returned 12/12 real OSM HTTP 200 PNG tiles, each with an origin-only referrer. Automated suites intercept tiles with synthetic responses; no bulk provider requests are needed.
- Desktop and mobile visual checks preserve the supplied artwork and show no horizontal overflow. Performance controls support reduced motion, keyboard dismissal and restored focus. Screenshots contain only synthetic data and remain local.
- The expanded test suite initially exhausted a shared localhost rate-limit bucket. Independent synthetic client identities in the isolated e2e harness fix test isolation; production rate limits are unchanged.

Repeat source/index/history/public-build secret scans pass before publication. [Preview PR #6](https://github.com/Shayan3600/Drain-Dispatch/pull/6) contains the combined release on `development/clearflow-preview`, retaining PR #5's original signed history. Production remains unchanged. This preview does not establish a fresh live hosted iMessage test; real sponsor acceptance from the existing release remains documented separately.

## Employee integration acceptance

The combined version passes 51 backend tests, including additive/idempotent demo seeding and refusal to seed a remote database, and all 28 Brave browser tests with a clean exit. Synthetic desktop/mobile employee screenshots show no overflow or mutation requests. A single loaded display-font face is shared between community and employee pages.

The separate loopback preview uses a fresh local PostgreSQL database with 48 labeled synthetic reports, 152 observations, 48 illustrations and 200 history events. Preview verification loads a saved photo, denies five credential/internal paths, returns 401 on three unauthenticated protected routes, rejects an invalid public submission and retains the original record count. Existing local and hosted data are untouched.

GitHub push and PR CI pass on combined source commit `f804b89`, including history/source scanning, clean installation, typecheck, backend tests, production build, Docker runtime and Linux browser tests. [PR check run](https://github.com/Shayan3600/Drain-Dispatch/actions/runs/38120089517). The team Notion plan records the preview workflow and preserves previous assignments and production evidence.

To review from a fresh checkout: build, run `node --import tsx scripts/city-showcase.ts`, open its printed loopback origin, and use Employee login. Community demo counts require **Include labeled demo reports**; employee review includes labeled DEMO records automatically. The launcher owns a separate process and database; stop only that process when finished. No public tunnel is created for this preview.

## Updated employee PR and recovery acceptance

The six additional commits in PR #5 through `a4db174` are incorporated with original ancestry. Ten supplied reference photographs retain original bytes, aspect ratios, watermarks and provenance. `--reference-photos` creates a separate local dataset; it does not modify existing demo or hosted records. Full-size links, photo retry and accurate submitted-versus-reference captions are verified.

The combined source passes 57 backend tests and all 36 browser tests in Windows Brave, plus TypeScript checks, production builds and a zero-vulnerability dependency audit. New coverage proves private-conversation reporting, bounded attachment downloads, real/demo matching isolation, preserved legacy photo drafts, transient draft retry without lost edits, independent history loading and map availability during an analytics outage. React StrictMode required a persistent simulated outage in the retry test; production code was not changed to accommodate the fixture.

A fresh photo preview has 48 synthetic reports, 152 observations, 48 photo associations and 200 history events. Desktop and mobile evidence loads without horizontal overflow or writes; five private-file paths and three protected routes are denied, invalid input is rejected and record counts remain unchanged. The old preview listener is stopped; its database is retained. The photo manifest is `.data/city-showcase-photos-active.json`.

The owner authorized the GitHub merge after safe checks and ended further hackathon gap expansion. Both Railway services remain pinned to `0243c778` on `development/live-integrations`; the GitHub merge does not promote this preview or change production settings. See PR #6 for the current merge and CI result, and [project gaps](project-gaps.md) for concise deferred operating limits.
