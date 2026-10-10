# Integration evidence and activation

Recorded October 10, 2026. Implementation, adapter tests, and live external verification are distinct. A successful local flow does not establish sponsor-service connectivity.

| Integration | Implemented | Verified here | Remaining live check |
| --- | --- | --- | --- |
| Gemini | Official `@google/genai` image input, JSON schema output, Zod validation, editable category suggestion and uncertainty | Typechecked; missing credentials fail clearly; Photon tests use explicitly simulated assessment results | Configure `GEMINI_API_KEY`; analyze blocked drains, clean drains, puddles and unrelated photographs with the selected model |
| Photon Spectrum | Official cloud SDK worker, inbound direction filtering, message IDs, grouped text/photos, bounded attachment streams, replies, authenticated central API forwarding, persistent drafts and retry handling | Thirteen automated handler/adapter tests using simulated provider messages and local PostgreSQL pass | Configure `PHOTON_PROJECT_ID`, `PHOTON_PROJECT_SECRET`, and a matching `WORKER_TOKEN`; send and reply through a real iMessage line, confirm location in the browser, verify dashboard persistence |
| Tiger Data | PostgreSQL connection via `DATABASE_URL`; `incident_events` conversion when TimescaleDB is available; time-series metadata exposed by the database adapter | Local embedded PostgreSQL is implemented; the local mode does not contain the TimescaleDB extension | Provision a Tiger Data database, configure TLS through its connection settings, run migrations, verify hypertable metadata and time-bucket queries against that service |
| Cloudinary | Managed upload of sanitized JPEG bytes with randomized asset IDs | Typechecked; missing credentials fail clearly | Configure `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`; upload, reload the report and verify the stored image URL |
| Local photograph storage | Explicit `IMAGE_STORAGE=local`, filesystem upload and `/uploads` URL | Four image tests pass: metadata removal/orientation, PNG/WebP conversion/resizing, invalid or oversized input, local persistence and missing-service errors | Development only; production requires managed storage |

## Gemini model and output contract

`GEMINI_MODEL` defaults to `gemini-3.8-flash`; override it only with a model enabled for the project that supports both image input and structured output. Google's current [Gemini 2.5 Flash model page](https://ai.google.dev/gemini-api/docs/models/gemini-2.5-flash) lists those capabilities but limits 2.5 access to previously active users, directing new projects to newer models.

The service uses `models.generateContent`, inline base64 image data, `responseMimeType: application/json`, and `responseJsonSchema`. The [published SDK configuration reference](https://googleapis.github.io/js-genai/release_docs/interfaces/types.GenerateContentConfig.html) specifies that `responseJsonSchema` and `responseSchema` are alternatives; both must not be supplied together. The [Part reference](https://googleapis.github.io/js-genai/release_docs/interfaces/types.Part.html) defines `inlineData` for images. The newer [structured output guide](https://ai.google.dev/gemini-api/docs/structured-output) also documents the Interactions API; this application uses the installed SDK's `generateContent` contract.

An assessment contains `drainVisible`, `suggestedCategory`, `visibleEvidence`, `humanReviewRecommended`, and `uncertainty`. The user reviews and edits suggestions before publication. No assessment supplies a street address, unseen damage, definite flooding prediction or municipal status. Missing credentials and failed or invalid model output return an unavailable state. Automated tests do not establish real model accuracy.

## Photon contract

Documentation used is Photon **Stable**. [Cloud configuration](https://photon.codes/docs/spectrum-ts/providers/imessage) uses `Spectrum({projectId, projectSecret, providers: [imessage.config()]})`; project lines and token renewal are discovered by the provider. The worker's [message stream](https://photon.codes/docs/spectrum-ts/messages) yields `[space, message]`, and it ignores outbound messages. Each message has a stable ID and an optional sender; those IDs support persisted retry handling.

The official [group source](https://raw.githubusercontent.com/photon-hq/spectrum-ts/main/packages/core/src/content/group.ts) represents group items as complete Message envelopes. The [attachment source](https://raw.githubusercontent.com/photon-hq/spectrum-ts/main/packages/core/src/content/attachment.ts) exposes metadata plus lazy `read()` and `stream()` methods. DrainDispatch reads the provider stream with an 8 MB cap and does not fetch arbitrary URLs supplied by messages. Photo bytes pass through the same sanitization/storage services as browser uploads.

The application runs a long-lived cloud worker, with telemetry disabled. Provider messages become private drafts; a browser confirmation supplies or confirms their location before publication. Live delivery has not yet been verified. If converting to HTTP callbacks later, the [webhook documentation](https://photon.codes/docs/spectrum-ts/webhooks) requires raw request bytes, signature verification and message-ID deduplication; callback handlers run after the HTTP response, which affects durability.

## Tiger Data contract

The [hypertable creation guide](https://www.tigerdata.com/docs/learn/hypertables/creating-and-configuring-hypertables) documents table conversion and migration of existing data. The adapter detects the TimescaleDB extension before converting `incident_events` with `create_hypertable`, `by_range('occurred_at')`, `if_not_exists` and `migrate_data`. A hypertable's time partition column must be non-null, and unique keys must include that column. The report entities retain ordinary PostgreSQL IDs; the event table carries the composite event/time key. Local PostgreSQL results must never be labeled Tiger Data live verification.

## Dependency advisory review

The October 10 npm audit initially reports 18 moderate dependency nodes, all tracing to one advisory: [GHSA-8988-4f7v-96qf](https://github.com/advisories/GHSA-8988-4f7v-96qf), concerning inbound W3C baggage parsing in `@opentelemetry/core` versions below 2.8.0. Top-level core 2.12.0 is already patched; experimental OTLP packages 0.218.0 bring nested core 2.7.1 copies. Photon telemetry 3.8.1 remains the latest release found in the npm registry and declares these experimental 0.218 ranges.

The root override pins `@opentelemetry/core` to 2.12.0. A clean lockfile resolution was required because the existing npm graph retained vulnerable nested copies. The final lock contains one fully resolved core 2.12.0 entry, and Spectrum remains 12.10.1. Do not apply npm's proposed Spectrum downgrade to 4.2.0; that changes the application's current contracts. The [2.8.0 release notes](https://github.com/open-telemetry/opentelemetry-js/releases/tag/v2.8.0) identify the baggage parser correction.

After installation, `npm audit --json` reports zero vulnerabilities. Runtime imports of Spectrum and its iMessage provider pass. Direct checks of the installed W3C baggage propagator reject a one-megabyte entry, cap a 500-entry header at 180 entries, and preserve a normal entry. Typechecking, all 26 backend/image/Photon tests and five browser tests pass, including a fresh Linux install in GitHub CI. This verifies the vulnerable parser replacement and the application's tested adapter behavior; it does not establish live provider delivery or optional telemetry-exporter interoperability.

One tooling limitation remains: `npm ls @opentelemetry/core` labels pinned upstream 2.7.1 requests as invalid against the intentional 2.12.0 root override, despite the patched installed package and successful audit/runtime checks. A clean install also needs the local Vite process stopped on Windows because its native modules are held open. During verification, `npm install` successfully restored the complete dependency tree after that operating-system lock prevented `npm ci`; native-module cleanup warnings concerned already-loaded temporary directories.

