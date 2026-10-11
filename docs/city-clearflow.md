# Clearflow city workspace

City-only update based on main b9931a1c032c2f82dc81192c126c9ada409e25b1.
The community app, Photon/AI integrations, production schema and hosted databases are unchanged.

## Included

- Simplified Clearflow UI, matching the supplied design's typography roles: Not Just Groovy for branding/display title, Segoe UI for form/card headings and controls, quiet supporting text, and responsive layouts.
- Keyboard-accessible custom filter menus (arrows, Enter, Escape, Home/End, typeahead, outside click).
- Saved API records as the city page's single data source. No built-in sample mode/fallback; persisted DEMO records remain clearly labeled and excluded from real metrics. Active is the default; All statuses includes closed records.
- Category-specific map colors, progressively darker from one to five submissions; five or more uses the darkest shade. Counts are submissions, not severity or unique people. Closed reports have dashed outlines; the selected report has a ring.
- Origin-only referrer for city OpenStreetMap tiles without relaxing the page-wide no-referrer policy.
- Read-only queue/map/evidence/history and privacy-conscious packet export with Clearflow branding. No assignment, municipal status writes, automatic filing, sounds or floating bubbles.
- Isolated local PostgreSQL/PGlite showcase: 48 demo reports, 152 observations, 48 original synthetic illustrations, and 200 history events. All categories/statuses and count bands are covered.

## Run the complete local demo

From the repository root:

```sh
npm ci
npm run build
node --import tsx scripts/city-showcase.ts
```

Open the URL printed by the script. It binds only to 127.0.0.1 on an automatically allocated free port and creates a fresh database directory under ignored .data/. Existing servers and databases are not reused or overwritten. Stop the foreground process with Ctrl+C. Keep .data/ private; do not commit it.

The optional PowerShell launcher scripts/start-city-showcase.ps1 starts the same local demo in the background and opens its URL. Build first. It records the exact PID for stopping only that process.

scripts/city-showcase-counts.ts is an idempotent compatibility utility for older local showcase databases. It refuses cloud/non-local targets and changes only recognized synthetic demo records. Fresh showcases already have all count bands, so it normally adds nothing.

## Verify

```sh
npm run typecheck
npm test
npm run build
npx playwright install chromium
npm run test:browser -- tests/browser/city-review.spec.ts tests/browser/city-tools.spec.ts tests/browser/city-clearflow.spec.ts
```

The city UI tests mock only their API and tile requests; app assets use the existing standard Vite test server. The full showcase test exercises the actual database schema and reporting service in memory. No Windows-specific paths, local static harness, extracted reference ZIP or personal database are required by these tests. Typography expectations were measured against the uploaded reference's CSS. Headless tests do not access the public OSM tile service.

## Fonts and release caveat

Not Just Groovy v1.00 is by Zdeněk Gromnica / FutureMillennium and is supplied unmodified, with attribution and its CC BY-NC-ND 3.0 license. It permits noncommercial use only; obtain permission or replace it before commercial use. Instrument Serif's retained files include their SIL OFL notice. Barstain Outline was used only in the reference's decorative ribbon, absent from this city workspace; that restrictive demo font is not added here.

This is a hackathon prototype, independent of the Town of Chapel Hill. Demo evidence is not an actual complaint, verified hazard, inspection or repair. Opening Town resources or copying a packet does not file a municipal report.
