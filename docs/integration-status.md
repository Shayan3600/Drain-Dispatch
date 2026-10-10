# Integration evidence and activation

Recorded October 10, 2026. Implementation, adapter tests, and live external verification are distinct. A successful local flow does not establish sponsor-service connectivity.

| Integration | Implemented | Verified here | Remaining live check |
| --- | --- | --- | --- |
| Gemini | Official SDK image input, strict schema, editable suggestion and uncertainty | Actual incoming iPhone photo assessed, findings persisted and displayed; real model authentication and four reference photos | Broader field evaluation; two reference photos needed one retry |
| Photon Spectrum | Real SDK worker, capped attachments, authenticated central API, private confirmation drafts, retries and consent-based follow-ups | Actual iPhone text and photo received, replies delivered, location confirmed; actual RESUME reply and recovered report verified externally; dashboard card, marker and photograph rendered; 26 isolated adapter/notification tests pass | Live consenting status notification and durable worker hosting |
| Tiger Data | Verified TLS PostgreSQL, additive legacy upgrades, Timescale hypertable and time_bucket | Actual cloud connection and migrations, existing-data preservation, idempotent reports, observations, moderation/history persistence after reconnect, demo exclusion and probe cleanup | Durable hosted API operation |
| Cloudinary | Sanitized JPEG upload with randomized asset IDs | Actual iPhone photo delivered as metadata-free JPEG, associated with confirmed messaging observation, rendered in dashboard; fixture authentication/upload/delivery/cleanup checks pass | Abandoned-photo retention/cleanup policy |
| Local photograph storage | Explicit local development adapter, refused in production | Sanitization/local persistence tests pass | Development only; running cloud app uses Cloudinary |

The complete isolated suite contains 43 tests, plus seven browser flows. See [photo-validation.md](photo-validation.md) for licensed reference sources, observed results and bounded coverage, and [verification evidence](verification-evidence.md) for the human messaging and community coordination checks. Canonical Spectrum settings are SPECTRUM_PROJECT_ID and SPECTRUM_PROJECT_SECRET; legacy PHOTON aliases remain supported. Secrets and environment files are excluded from Git and Docker context; fully redacted Gitleaks and known-credential/source/history scans guard publication.

## Gemini model and output contract

`GEMINI_MODEL` defaults to `gemini-3.1-flash-lite`, verified with the actual configured project and four reference photographs. Use a project-accessible model supporting image input and structured output. The previous `gemini-3.8-flash` configuration timed out on photographic checks; a 2.5 probe returned 404 despite appearing in the model inventory. See [photo validation](photo-validation.md) for the exact evidence.

The service uses `models.generateContent`, inline base64 image data, `responseMimeType: application/json`, and `responseJsonSchema`. The [published SDK configuration reference](https://googleapis.github.io/js-genai/release_docs/interfaces/types.GenerateContentConfig.html) specifies that `responseJsonSchema` and `responseSchema` are alternatives; both must not be supplied together. The [Part reference](https://googleapis.github.io/js-genai/release_docs/interfaces/types.Part.html) defines `inlineData` for images. The newer [structured output guide](https://ai.google.dev/gemini-api/docs/structured-output) also documents the Interactions API; this application uses the installed SDK's `generateContent` contract.

An assessment contains `drainVisible`, `suggestedCategory`, `visibleEvidence`, `humanReviewRecommended`, and `uncertainty`. The user reviews and edits suggestions before publication. No assessment supplies a street address, unseen damage, definite flooding prediction or municipal status. Missing credentials and failed or invalid model output return an unavailable state. Automated tests do not establish real model accuracy.

## Photon contract

Documentation used is Photon **Stable**. [Cloud configuration](https://photon.codes/docs/spectrum-ts/providers/imessage) uses `Spectrum({projectId, projectSecret, providers: [imessage.config()]})`; project lines and token renewal are discovered by the provider. The worker's [message stream](https://photon.codes/docs/spectrum-ts/messages) yields `[space, message]`, and it ignores outbound messages. Each message has a stable ID and an optional sender; those IDs support persisted retry handling.

The official [group source](https://raw.githubusercontent.com/photon-hq/spectrum-ts/main/packages/core/src/content/group.ts) represents group items as complete Message envelopes. The [attachment source](https://raw.githubusercontent.com/photon-hq/spectrum-ts/main/packages/core/src/content/attachment.ts) exposes metadata plus lazy `read()` and `stream()` methods. DrainDispatch reads the provider stream with an 8 MB cap and does not fetch arbitrary URLs supplied by messages. Photo bytes pass through the same sanitization/storage services as browser uploads.

The application runs a long-lived worker, with telemetry disabled. Provider messages become private drafts; a browser confirmation supplies or confirms their location before publication. Actual inbound text and photograph, delivered replies, phone confirmation and persisted dashboard display passed in an owner-operated iPhone session. Temporary tunnels require an active session; they do not establish durable hosting. If converting to HTTP callbacks later, the [webhook documentation](https://photon.codes/docs/spectrum-ts/webhooks) requires raw request bytes, signature verification and message-ID deduplication; callback handlers run after the HTTP response, which affects durability.

## Tiger Data contract

The legacy cloud schema used `is_demo=true` as its incident default. A targeted migration restores the canonical false default, and confirmation explicitly inserts false. Tests cover the inherited true default and preservation of existing demo rows. Existing user reports were not reclassified; labeled test records remain excluded from real metrics.

The [hypertable creation guide](https://www.tigerdata.com/docs/learn/hypertables/creating-and-configuring-hypertables) documents table conversion and migration of existing data. The adapter detects the TimescaleDB extension before converting `incident_events` with `create_hypertable`, `by_range('occurred_at')`, `if_not_exists` and `migrate_data`. A hypertable's time partition column must be non-null, and unique keys must include that column. The report entities retain ordinary PostgreSQL IDs; the event table carries the composite event/time key. Local PostgreSQL results must never be labeled Tiger Data live verification.

## Dependency advisory review

The October 10 npm audit initially reports 18 moderate dependency nodes, all tracing to one advisory: [GHSA-8988-4f7v-96qf](https://github.com/advisories/GHSA-8988-4f7v-96qf), concerning inbound W3C baggage parsing in `@opentelemetry/core` versions below 2.8.0. Top-level core 2.12.0 is already patched; experimental OTLP packages 0.218.0 bring nested core 2.7.1 copies. Photon telemetry 3.8.1 remains the latest release found in the npm registry and declares these experimental 0.218 ranges.

The root override pins `@opentelemetry/core` to 2.12.0. A clean lockfile resolution was required because the existing npm graph retained vulnerable nested copies. The final lock contains one fully resolved core 2.12.0 entry, and Spectrum remains 12.10.1. Do not apply npm's proposed Spectrum downgrade to 4.2.0; that changes the application's current contracts. The [2.8.0 release notes](https://github.com/open-telemetry/opentelemetry-js/releases/tag/v2.8.0) identify the baggage parser correction.

After installation, `npm audit --json` reports zero vulnerabilities. Runtime imports of Spectrum and its iMessage provider pass. Direct checks of the installed W3C baggage propagator reject a one-megabyte entry, cap a 500-entry header at 180 entries, and preserve a normal entry. Typechecking, all 26 backend/image/Photon tests and five browser tests pass, including a fresh Linux install in GitHub CI. This verifies the vulnerable parser replacement and the application's tested adapter behavior; it does not establish live provider delivery or optional telemetry-exporter interoperability.

One tooling limitation remains: `npm ls @opentelemetry/core` labels pinned upstream 2.7.1 requests as invalid against the intentional 2.12.0 root override, despite the patched installed package and successful audit/runtime checks. A clean install also needs the local Vite process stopped on Windows because its native modules are held open. During verification, `npm install` successfully restored the complete dependency tree after that operating-system lock prevented `npm ci`; native-module cleanup warnings concerned already-loaded temporary directories.

