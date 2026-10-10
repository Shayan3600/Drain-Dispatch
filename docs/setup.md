# Setup and service activation

Node 22+ (24 recommended), npm, and Git are required. Docker and a separately installed PostgreSQL are unnecessary for local development. The original private repository was inaccessible; the product owner authorized a new repository. Local development is independent of any uninspected original backend.

Put credentials only in a git-ignored local `.env` or host secret manager. Expected settings: DATABASE_URL, GEMINI_API_KEY, GEMINI_MODEL, PHOTON_PROJECT_ID, PHOTON_PROJECT_SECRET, CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET, MODERATOR_TOKEN, PUBLIC_APP_URL. Never paste credentials into repository files or chat.

## Start locally

1. `npm ci` from the project root.
2. Copy `.env.example` to `.env`. Keep `DATABASE_MODE=local` and `IMAGE_STORAGE=local`. Set MODERATOR_TOKEN and WORKER_TOKEN to separate random secrets of at least 32 characters. The development environment prepared in this workspace already has those secrets.
3. `npm run dev` starts API http://localhost:3001 and website http://localhost:5173. A persistent embedded PostgreSQL database is created in `.data/postgres`; photos are saved in `server/uploads`. This is actual local PostgreSQL, **not** a Tiger Data cloud connection.
4. Optional `npm run db:seed` inserts three explicitly labeled demo incidents. In the map, enable “Include labeled demo reports.” Demo records never inflate real metrics.
5. `npm run typecheck`, `npm test`, and `npm run build` verify the implementation. Browser checks use the running development server.

Do not run two processes against the same embedded database directory. The worker talks to the central API rather than opening it. Tests use isolated temporary databases.

## Connect real services

Tiger Data: Create a PostgreSQL service and copy its connection string into DATABASE_URL. Keep required TLS settings in the supplied URL; do not disable certificate verification. Cloud mode takes priority over DATABASE_MODE. Run `npm run db:migrate`. Execute `server/sql/002_tigerdata.sql` in the Tiger Data SQL editor to enable its event hypertable. `/api/health` must report `databaseMode:postgresql` and `timeSeriesEnabled:true` before claiming Tiger Data verification. Existing local incidents are not migrated automatically.

Gemini: Create a key in [Google AI Studio](https://aistudio.google.com/apikey), add GEMINI_API_KEY, and choose a model available to that project via GEMINI_MODEL. Default follows current official image/structured-output docs; access must be verified. Upload a real drain photo and choose “Review photo with Gemini.” No AI results are simulated when the key is missing. Confirm the description/category yourself.

Cloudinary: Obtain Cloud Name, API Key and API Secret from the [Cloudinary console](https://console.cloudinary.com/). Set all three CLOUDINARY values and IMAGE_STORAGE=cloudinary. Upload a photo, reload the incident and verify its image URL. Local photographs are not automatically copied to Cloudinary.

Photon: Create a project at [Photon](https://app.photon.codes/) and configure one real iMessage line (shared mode or a single dedicated line). Add PHOTON_PROJECT_ID and PHOTON_PROJECT_SECRET. Keep WORKER_TOKEN stable and identical on API/worker; rotating it invalidates messaging deduplication identities and pending draft derivations. Set API_URL to the central API and PUBLIC_APP_URL to the website. Run `npm run worker`. Test a real message/photo, open its confirmation link, and confirm a location; only then check the map. Send CONSENT to allow internal status updates for incidents contributed to in a direct message; STOP cancels pending updates. Worker polls a leased outbox and rechecks consent before sending. Delivery is at least once: a crash between sending and acknowledgement can repeat an update. STOP cannot recall an already-sent or in-flight message. Multiple dedicated lines require additional routing metadata and are not supported yet.

## Deploy

No hosting account is authenticated yet. Live deployments require provisioned accounts with free-tier/billing authorization confirmed; no purchase or upgrade has been made.

Simplest deployment: one Docker service serving API and built client. Dockerfile and railway.toml are included. Configure NODE_ENV=production, DATABASE_URL, IMAGE_STORAGE=cloudinary, storage credentials, PUBLIC_APP_URL, PUBLIC_API_URL, CLIENT_ORIGIN and random moderator/worker secrets. Local database/storage are refused in production. The API process listens on PORT supplied by the host. Run a second persistent service from the same image with command `node server/dist/photon/worker.js`; set API_URL to the HTTPS API, Photon credentials and the same WORKER_TOKEN. The worker needs no database secret.

Separate Vercel client: included vercel.json builds client/dist and supports confirmation-link paths. Set VITE_API_URL to the public HTTPS API URL at **build time**. Add the exact Vercel origin to API CLIENT_ORIGIN; comma-separated origins are supported. Secrets must never have the VITE_ prefix. Railway proxy deployments may need TRUST_PROXY=1; set it only behind a trusted single proxy.

Verify deployed health, report creation/reload, photo persistence, weather error handling, CORS, iMessage reply, and persistent worker operation. Domain purchase, live recorded backup and sponsor qualification remain pending until those checks succeed.
