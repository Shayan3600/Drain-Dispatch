# Clearflow design preview

The owner supplied Clearflow Website v5 and confirmed the brand **Clearflow**, close visual fidelity, and **preview only**. Production remains pinned to its previously verified release. No Railway changes, public URL changes, credential rotations, database resets or new public tunnels are part of this preview.

The preview starts from current main `b9931a1`, including merged PR #4's city map controls, polling, stale-evidence warnings, read-only sort/metadata API and tests. Original signed history and the logo are preserved. Repository/package/database/internal identifiers remain compatible under the new public name.

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

- Final typecheck and production build pass; 50 backend tests pass; dependency audit reports zero vulnerabilities.
- All 20 browser flows pass in installed Windows Brave: reporting, duplicate observation, uploaded JPEG persistence, editable mocked Gemini findings, private draft recovery, city polling/stale evidence, map recovery/resize/referrer privacy, Clearflow assets and mobile/accessibility controls.
- One limited desktop viewport returned 12/12 real OSM HTTP 200 PNG tiles, each with an origin-only referrer. Automated suites intercept tiles with synthetic responses; no bulk provider requests are needed.
- Desktop and mobile visual checks preserve the supplied artwork and show no horizontal overflow. Performance controls support reduced motion, keyboard dismissal and restored focus. Screenshots contain only synthetic data and remain local.
- The expanded test suite initially exhausted a shared localhost rate-limit bucket. Independent synthetic client identities in the isolated e2e harness fix test isolation; production rate limits are unchanged.

Repeat source/index/history/public-build secret scans are required before publication. A reviewable preview PR and local preview will be recorded after those checks. Production remains unchanged. This preview does not establish a fresh live hosted iMessage test; real sponsor acceptance from the existing release remains documented separately.
