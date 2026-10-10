import { test } from "node:test";
import assert from "node:assert/strict";
import pg from "pg";
import { resolveDatabaseConfig, resolveSpectrumCredentials } from "../config.js";

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
