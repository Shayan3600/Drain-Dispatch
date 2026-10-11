import { test } from "node:test";
import assert from "node:assert/strict";
import pg from "pg";
import { randomBytes } from "node:crypto";
import { resolveDatabaseConfig, resolveSpectrumCredentials, validateProductionConfig, ProductionConfigurationError } from "../config.js";

test("Spectrum canonical names take precedence and empty canonical names use Photon aliases", () => {
  assert.deepEqual(resolveSpectrumCredentials({ SPECTRUM_PROJECT_ID: "new", SPECTRUM_PROJECT_SECRET: " new-secret ", PHOTON_PROJECT_ID: "old", PHOTON_PROJECT_SECRET: "old-secret" }), { projectId: "new", projectSecret: " new-secret " });
  assert.deepEqual(resolveSpectrumCredentials({ SPECTRUM_PROJECT_ID: "", PHOTON_PROJECT_ID: "legacy", PHOTON_PROJECT_SECRET: "secret" }), { projectId: "legacy", projectSecret: "secret" });
  assert.deepEqual(resolveSpectrumCredentials({ SPECTRUM_PROJECT_ID: " ", SPECTRUM_PROJECT_SECRET: "\t", PHOTON_PROJECT_ID: "legacy", PHOTON_PROJECT_SECRET: "secret" }), { projectId: "legacy", projectSecret: "secret" });
  assert.deepEqual(resolveSpectrumCredentials({}), { projectId: undefined, projectSecret: undefined });
});

test("remote URL credentials are preserved while verified TLS is pinned in pg", () => {
  const env = { DATABASE_URL: "postgresql://user:p%40ss%2Fword@db.example:6543/drains?sslmode=require&application_name=drain", PGHOST: "ignored" };
  const original = { ...env };
  const resolved = resolveDatabaseConfig(env)!;
  const client = new pg.Client(resolved);
  const params = (client as unknown as { connectionParameters: { password: string; host: string; ssl: { rejectUnauthorized?: boolean } } }).connectionParameters;
  assert.equal(params.password, "p@ss/word");
  assert.equal(params.host, "db.example");
  assert.notEqual(params.ssl.rejectUnauthorized, false);
  assert.equal(new URL(resolved.connectionString!).searchParams.get("sslmode"), "verify-full");
  assert.deepEqual(env, original);
});

test("insecure remote URL options and invalid credentials fail without revealing input", () => {
  for (const query of ["sslmode=disable", "sslmode=no-verify", "ssl=0", "ssl=false", "sslmode=require&uselibpqcompat=true", "sslmode=verify-ca&uselibpqcompat=true"]) {
    assert.throws(() => resolveDatabaseConfig({ DATABASE_URL: `postgresql://user:private-value@db.example/drains?${query}` }), error => error instanceof Error && !error.message.includes("private-value") && error.message.includes("verified TLS"));
  }
  assert.throws(() => resolveDatabaseConfig({ DATABASE_URL: "private-invalid-value" }), error => error instanceof Error && !error.message.includes("private-invalid-value"));
  assert.throws(() => resolveDatabaseConfig({ PGHOST: "db.example", PGUSER: "user", PGPASSWORD: "secret", PGDATABASE: "drains", PGPORT: "bad" }), /valid port/);
});

test("Tiger credential fields use verified TLS; local development remains explicit", () => {
  assert.deepEqual(resolveDatabaseConfig({ TIGER_DATA_HOST: "db.example", TIGER_DATA_USER: "user", TIGER_DATA_PASSWORD: " p@ss ", TIGER_DATA_DATABASE: "drains", TIGER_DATA_PORT: "6543" }), { host: "db.example", user: "user", password: " p@ss ", database: "drains", port: 6543, ssl: { rejectUnauthorized: true } });
  assert.equal(resolveDatabaseConfig({}), undefined);
  const local = resolveDatabaseConfig({ DATABASE_URL: "postgresql://user:secret@localhost/drains?sslmode=disable" })!;
  assert.equal(local.ssl, undefined);
  assert.equal((new pg.Client(local) as unknown as { connectionParameters: { ssl: boolean } }).connectionParameters.ssl, false);
});

function productionApi(): NodeJS.ProcessEnv {
  return {
    NODE_ENV: "production", DATABASE_URL: "postgresql://user:example@db.example/drains",
    IMAGE_STORAGE: "cloudinary", CLOUDINARY_CLOUD_NAME: "fictional-cloud",
    CLOUDINARY_API_KEY: randomBytes(24).toString("hex"), CLOUDINARY_API_SECRET: randomBytes(24).toString("hex"),
    GEMINI_API_KEY: randomBytes(24).toString("hex"), MODERATOR_TOKEN: randomBytes(32).toString("hex"),
    WORKER_TOKEN: randomBytes(32).toString("hex"), PUBLIC_APP_URL: "https://app.example.invalid",
    CLIENT_ORIGIN: "https://app.example.invalid, https://preview.example.invalid", PORT: "8080",
  };
}

test("production API accepts complete cloud config without Spectrum worker credentials", () => {
  const env = productionApi();
  const before = { ...env };
  validateProductionConfig(env, "api");
  delete env.IMAGE_STORAGE; // Cloudinary is the default.
  validateProductionConfig(env, "api");
  assert.deepEqual({ ...env, IMAGE_STORAGE: "cloudinary" }, before);
});

test("production API fails before startup for missing cloud integrations and local image storage", () => {
  for (const name of ["DATABASE_URL", "CLOUDINARY_CLOUD_NAME", "CLOUDINARY_API_KEY", "CLOUDINARY_API_SECRET", "GEMINI_API_KEY", "CLIENT_ORIGIN"]) {
    const env = productionApi();
    delete env[name];
    assert.throws(() => validateProductionConfig(env, "api"), ProductionConfigurationError);
  }
  for (const mode of ["local", "unknown"]) assert.throws(() => validateProductionConfig({ ...productionApi(), IMAGE_STORAGE: mode }, "api"), /IMAGE_STORAGE=cloudinary/);
});

test("production secrets must be independent and production errors never echo supplied URL or credentials", () => {
  const env = productionApi();
  assert.throws(() => validateProductionConfig({ ...env, MODERATOR_TOKEN: env.WORKER_TOKEN }, "api"), /different MODERATOR_TOKEN/);
  assert.throws(() => validateProductionConfig({ ...env, WORKER_TOKEN: "short" }, "api"), /at least 32/);
  assert.throws(() => validateProductionConfig({ ...env, MODERATOR_TOKEN: "short" }, "api"), /at least 32/);
  const privateValue = randomBytes(32).toString("hex");
  assert.throws(() => validateProductionConfig({ ...env, PUBLIC_APP_URL: `https://user:${privateValue}@app.example.invalid` }, "api"), error => error instanceof ProductionConfigurationError && !error.message.includes(privateValue) && !error.message.includes("app.example.invalid"));
});

test("production public URLs, allowed origins and port reject broken confirmation and browser settings", () => {
  for (const name of ["PUBLIC_APP_URL", "PUBLIC_API_URL", "CLIENT_ORIGIN"]) {
    for (const value of ["http://app.example.invalid", "https://localhost", "https://127.0.0.1", "https://[::1]", "https://app.example.invalid/path", "https://app.example.invalid?token=fictional", "https://app.example.invalid#fragment", "not-a-url"]) {
      assert.throws(() => validateProductionConfig({ ...productionApi(), [name]: value }, "api"), /public HTTPS origin/);
    }
  }
  for (const port of ["NaN", "0", "65536", "1.5"]) assert.throws(() => validateProductionConfig({ ...productionApi(), PORT: port }, "api"), /valid PORT/);
});

test("production worker requires only its credentials and secure API origin, accepting Photon aliases", () => {
  const env = { NODE_ENV: "production", WORKER_TOKEN: randomBytes(32).toString("hex"), SPECTRUM_PROJECT_ID: "fictional-project", SPECTRUM_PROJECT_SECRET: randomBytes(32).toString("hex"), API_URL: "https://api.example.invalid" };
  validateProductionConfig(env, "worker");
  validateProductionConfig({ ...env, SPECTRUM_PROJECT_ID: "", SPECTRUM_PROJECT_SECRET: "", PHOTON_PROJECT_ID: env.SPECTRUM_PROJECT_ID, PHOTON_PROJECT_SECRET: env.SPECTRUM_PROJECT_SECRET }, "worker");
  assert.throws(() => validateProductionConfig({ ...env, API_URL: undefined }, "worker"), /API_URL/);
  assert.throws(() => validateProductionConfig({ ...env, API_URL: "http://localhost:3001" }, "worker"), /API_URL/);
  assert.throws(() => validateProductionConfig({ ...env, SPECTRUM_PROJECT_SECRET: "" }, "worker"), /SPECTRUM_PROJECT_ID/);
});

test("offline development keeps optional sponsor settings and local URLs", () => {
  validateProductionConfig({ NODE_ENV: "development", IMAGE_STORAGE: "local", PUBLIC_APP_URL: "http://localhost:5173" }, "api");
  validateProductionConfig({}, "worker");
});
