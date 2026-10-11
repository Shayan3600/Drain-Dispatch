# DrainDispatch

**See the blockage. Prevent the backup.**

A HackNC 2026 community stormwater reporting prototype. Turn visible drainage concerns into geolocated incidents with photo evidence, community observations, human review and follow-up history. Independent of the Town of Chapel Hill; reports do not automatically notify the Town or guarantee flood prevention.

[Live dashboard](https://draindispatchserver-production.up.railway.app) · [City evidence review](https://draindispatchserver-production.up.railway.app/city). Enable **Include labeled demo reports** to inspect the saved tests; they are excluded from real statistics. The built website/API and private persistent Photon worker are hosted on Railway. See [release verification](docs/verification-evidence.md#production-release) for evidence and remaining live acceptance steps.

## Run locally

Requires Node 22+ (24 recommended).

```powershell
npm ci
if (!(Test-Path .env)) { Copy-Item .env.example .env }
# Set separate random WORKER_TOKEN and MODERATOR_TOKEN in .env.
npm run dev
```

Open **http://localhost:5173**. API: **http://localhost:3001/api/health**.

Keep DATABASE_MODE=local and IMAGE_STORAGE=local for local development. Reports persist in embedded PostgreSQL at .data/postgres; sanitized photos persist in server/uploads. These adapters are explicitly labeled local and refused in production. No sponsor credential is required to test manual reporting.

Optional `npm run db:seed` creates three labeled demonstration incidents. Enable “Include labeled demo reports” in the map. Demo records are excluded from real activity metrics. Do not run a second API/seed process against the same local database while the API is running.

## What works locally

- Chapel Hill Leaflet/OpenStreetMap dashboard, filters, search, marker details and refresh.
- Report creation with explicit location confirmation, photo persistence and stable retry protection.
- Nearby suggestions within 30 meters; human choice before adding to an existing incident.
- Community observations, photo evidence, status/event history and protected moderation.
- Measured counts, categories, daily incident trends, UTC observation/review activity with exact values, and approximate recurring areas.
- Structured Gemini integration with editable suggestions and clear unavailable state.
- Real Spectrum SDK worker: HELP, REPORT, RESUME, STATUS, NEARBY, OBSERVE, CONSENT and STOP; expiring private location-confirmation drafts. RESUME securely reopens your latest report after a temporary URL changes, preserving saved photos and findings.
- Consent-based status notification outbox, leases, cancellation and provider dispatch.
- Official NWS alert context for the Chapel Hill center, with a graceful unavailable state.
- Responsive Aero design, accessible controls, safe participation guidance and official reporting links.

## Verification and integration limits

```powershell
npm run typecheck
npm test
npm run build
npx playwright install chromium
npm run test:browser
```

Browser tests use an isolated temporary PostgreSQL database, never the local/demo database. They exercise report/reload/detail/follow-up, mobile layout, confirmed duplicate consolidation, simulated message-draft confirmation, and correction of mocked AI suggestions with actual photo persistence.

Real service authentication and verification results are recorded in [Integration status](docs/integration-status.md). Mocked provider tests do not satisfy sponsor requirements. Outbound status notifications are at least once; a crash after sending but before acknowledgement can repeat an update. Use one Photon line; multi-line routing remains future work.

Before every publication, run `npm run security:scan` and a fully redacted Gitleaks scan of Git history and safe source. Real environment files and downloaded credential files stay private and local. The example file contains only empty settings. Never overwrite an existing `.env` when following fresh-checkout instructions.

## Activate and deploy

Put keys only in ignored .env or host secret managers. [Setup](docs/setup.md) gives account locations, settings and verification steps. DATABASE_URL switches to external PostgreSQL; Timescale event hypertables and time_bucket analytics activate when the extension is enabled. `npm run worker` starts the credentialed Spectrum worker.

Dockerfile and Railway configuration support an API serving the built client plus a separate persistent worker. Vercel configuration supports a separately hosted frontend with VITE_API_URL set at build time. No paid services, domain purchases or deployment upgrades have been initiated.

## Project documentation

- [Verified task checklist and remaining work](tasks/todo.md)
- [Architecture](docs/architecture.md) and [API contract](docs/api-contract.md)
- [Integration status and official SDK sources](docs/integration-status.md)
- [Human photo workflow, database coordination and mobile verification evidence](docs/verification-evidence.md)
- [Two-minute demo script](docs/demo-script.md) and [submission draft / track evidence](docs/submission.md)
- [Engineering lessons](tasks/lessons.md)

Residents should observe from a safe place, avoid identifying people in photos, and leave infrastructure maintenance to trained crews. Never enter drains, floodwater or active roadways. This is not an emergency service.
