import { config as loadEnv } from "dotenv";
import { fileURLToPath } from "node:url";
import type { PoolConfig } from "pg";
loadEnv({
  path: fileURLToPath(new URL("../../.env", import.meta.url)),
  quiet: true,
});

export function resolveSpectrumCredentials(env: NodeJS.ProcessEnv) {
  const credential = (primary?: string, alias?: string) => primary?.trim() ? primary : alias;
  return {
    projectId: credential(env.SPECTRUM_PROJECT_ID, env.PHOTON_PROJECT_ID),
    projectSecret: credential(env.SPECTRUM_PROJECT_SECRET, env.PHOTON_PROJECT_SECRET),
  };
}

function configurationError(message: string): never {
  throw Object.assign(new Error(message), { code: "DATABASE_CONFIGURATION" });
}

/** Resolve credentials without logging them or changing the supplied environment. */
export function resolveDatabaseConfig(env: NodeJS.ProcessEnv): PoolConfig | undefined {
  const connectionString = env.DATABASE_URL;
  if (connectionString) {
    let url: URL;
    try { url = new URL(connectionString); }
    catch { return configurationError("DATABASE_URL must be a valid PostgreSQL connection URL."); }
    if (!["postgres:", "postgresql:"].includes(url.protocol) || !url.hostname)
      return configurationError("DATABASE_URL must identify a PostgreSQL server.");
    const host = url.searchParams.get("host") || url.hostname;
    const local = ["localhost", "127.0.0.1", "[::1]", "::1"].includes(host);
    const sslMode = url.searchParams.get("sslmode");
    if (!local && (["0", "false"].includes(url.searchParams.get("ssl") || "") || sslMode === "disable" || sslMode === "no-verify" ||
      (url.searchParams.get("uselibpqcompat") === "true" && ["require", "prefer", "verify-ca"].includes(sslMode || "prefer"))))
      return configurationError("Remote PostgreSQL requires verified TLS; use sslmode=verify-full.");
    // URL SSL options override pg's ssl object. Pin verified semantics even as pg changes defaults.
    if (!local) url.searchParams.set("sslmode", "verify-full");
    return { connectionString: local ? connectionString : url.toString(), ssl: local ? undefined : { rejectUnauthorized: true } };
  }
  const host = env.PGHOST || env.TIGER_DATA_HOST || env.TIGERDATA_HOST;
  if (!host) return undefined;
  const user = env.PGUSER || env.TIGER_DATA_USER || env.TIGERDATA_USER;
  const password = env.PGPASSWORD || env.TIGER_DATA_PASSWORD || env.TIGERDATA_PASSWORD;
  const database = env.PGDATABASE || env.TIGER_DATA_DATABASE || env.TIGERDATA_DATABASE;
  const port = Number(env.PGPORT || env.TIGER_DATA_PORT || env.TIGERDATA_PORT || "5432");
  if (!user || !password || !database || !Number.isInteger(port) || port < 1 || port > 65535)
    return configurationError("PostgreSQL host credentials require user, password, database, and a valid port.");
  const local = ["localhost", "127.0.0.1", "::1"].includes(host);
  if (!local && env.PGSSLMODE && env.PGSSLMODE !== "verify-full" && env.PGSSLMODE !== "require")
    return configurationError("Remote PostgreSQL requires verified TLS; use PGSSLMODE=verify-full.");
  return { host, user, password, database, port, ssl: local ? undefined : { rejectUnauthorized: true } };
}

export class ProductionConfigurationError extends Error {}

/** Validate each service before opening a database or authenticating a provider. Errors contain names only. */
export function validateProductionConfig(env: NodeJS.ProcessEnv, role: "api" | "worker"): void {
  if (env.NODE_ENV !== "production") return;
  const fail = (requirement: string): never => {
    throw new ProductionConfigurationError(`Production configuration requires ${requirement}.`);
  };
  const required = (name: string) => {
    if (!env[name]?.trim()) fail(name);
  };
  const httpsOrigin = (value: string | undefined, name: string) => {
    let url: URL;
    try { url = new URL(value || ""); }
    catch { return fail(`a public HTTPS origin in ${name}`); }
    if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash || url.pathname !== "/" ||
      ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname))
      fail(`a public HTTPS origin in ${name}`);
  };
  if (!env.WORKER_TOKEN || env.WORKER_TOKEN.length < 32) fail("WORKER_TOKEN with at least 32 characters");
  if (role === "worker") {
    const credentials = resolveSpectrumCredentials(env);
    if (!credentials.projectId?.trim() || !credentials.projectSecret?.trim())
      fail("SPECTRUM_PROJECT_ID and SPECTRUM_PROJECT_SECRET (legacy PHOTON names are accepted)");
    httpsOrigin(env.API_URL, "API_URL");
    return;
  }
  if (!resolveDatabaseConfig(env)) fail("DATABASE_URL or complete PostgreSQL host credentials");
  if ((env.IMAGE_STORAGE ?? "cloudinary") !== "cloudinary") fail("IMAGE_STORAGE=cloudinary");
  for (const name of ["CLOUDINARY_CLOUD_NAME", "CLOUDINARY_API_KEY", "CLOUDINARY_API_SECRET", "GEMINI_API_KEY"])
    required(name);
  if (!env.MODERATOR_TOKEN || env.MODERATOR_TOKEN.length < 32) fail("MODERATOR_TOKEN with at least 32 characters");
  if (env.MODERATOR_TOKEN === env.WORKER_TOKEN) fail("different MODERATOR_TOKEN and WORKER_TOKEN values");
  httpsOrigin(env.PUBLIC_APP_URL, "PUBLIC_APP_URL");
  if (env.PUBLIC_API_URL) httpsOrigin(env.PUBLIC_API_URL, "PUBLIC_API_URL");
  required("CLIENT_ORIGIN");
  for (const origin of env.CLIENT_ORIGIN!.split(",")) httpsOrigin(origin.trim(), "CLIENT_ORIGIN");
  const port = Number(env.PORT || 3001);
  if (!Number.isInteger(port) || port < 1 || port > 65535) fail("a valid PORT");
}

const spectrum = resolveSpectrumCredentials(process.env);
export const config = {
  spectrumProjectId: spectrum.projectId,
  spectrumProjectSecret: spectrum.projectSecret,
};
