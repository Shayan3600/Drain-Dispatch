import { resolveDatabaseConfig } from "../config.js";
import { PGlite } from "@electric-sql/pglite";
import pg from "pg";
import path from "node:path";
import { readFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";

export type Row = Record<string, any>;
export interface Connection {
  query<T extends Row = Row>(
    sql: string,
    params?: any[],
  ): Promise<{ rows: T[] }>;
}
export interface Database extends Connection {
  transaction<T>(fn: (c: Connection) => Promise<T>): Promise<T>;
  close(): Promise<void>;
  mode: string;
  timescale: boolean;
}
const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);
export const projectRoot = root;
export async function openDatabase(localPath?: string): Promise<Database> {
  const postgres = localPath ? undefined : resolveDatabaseConfig(process.env);
  if (postgres) {
    const pool = new pg.Pool({
      ...postgres,
      max: 10,
      connectionTimeoutMillis: 10000,
    });
    const db: Database = {
      mode: "postgresql",
      timescale: false,
      query: async (s, p) => pool.query(s, p),
      close: () => pool.end(),
      transaction: async (fn) => {
        const c = await pool.connect();
        try {
          await c.query("BEGIN");
          const result = await fn(c);
          await c.query("COMMIT");
          return result;
        } catch (e) {
          await c.query("ROLLBACK");
          throw e;
        } finally {
          c.release();
        }
      },
    };
    try {
      db.timescale = await migrate(db, true);
      return db;
    } catch {
      await pool.end();
      throw Object.assign(new Error("PostgreSQL initialization failed. Verify credentials, verified TLS, connectivity, and migration permissions."), { code: "DATABASE_INITIALIZATION_FAILED" });
    }
  }
  if (
    process.env.NODE_ENV === "production" ||
    (!localPath && process.env.DATABASE_MODE !== "local")
  )
    throw new Error(
      "Set DATABASE_URL or PostgreSQL host credentials, or explicitly set DATABASE_MODE=local for development.",
    );
  const dataPath =
    localPath ??
    path.resolve(root, process.env.LOCAL_DATABASE_PATH || ".data/postgres");
  await mkdir(dataPath, { recursive: true });
  const engine = new PGlite(dataPath);
  const db: Database = {
    mode: "local-postgresql",
    timescale: false,
    query: async (s, p) => (await engine.query(s, p)) as any,
    close: () => engine.close(),
    transaction: (fn) =>
      engine.transaction((tx) =>
        fn({ query: async (s, p) => (await tx.query(s, p)) as any }),
      ),
  };
  try {
    await migrate(db);
    return db;
  } catch (error) {
    await engine.close();
    throw error;
  }
}
async function migrate(db: Database, postgres = false): Promise<boolean> {
  const migrations = await Promise.all(["001_init.sql", "002_legacy_columns.sql"].map(file =>
    readFile(path.join(root, "server/sql", file), "utf8")));
  return db.transaction(async (connection) => {
    // Serialize migrations across API/worker starts without removing or replacing existing data.
    if (postgres) await connection.query("SELECT pg_advisory_xact_lock(172934, 1)");
    for (const sql of migrations)
      for (const statement of sql.split(";").filter((s) => s.trim()))
        await connection.query(statement);
    const legacy = await connection.query("SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='observations' AND column_name='source_event_id'");
    if (legacy.rows.length)
      await connection.query("UPDATE observations SET source_message_id=source_event_id WHERE source_message_id IS NULL AND source_event_id IS NOT NULL");
    const eventKey = await connection.query("SELECT 1 FROM pg_constraint WHERE conrelid='incident_events'::regclass AND contype='p'");
    if (!eventKey.rows.length)
      await connection.query("ALTER TABLE incident_events ADD PRIMARY KEY(id,occurred_at)");
    const eventReference = await connection.query("SELECT 1 FROM pg_constraint WHERE conrelid='incident_events'::regclass AND contype='f' AND confrelid='incidents'::regclass");
    if (!eventReference.rows.length)
      await connection.query("ALTER TABLE incident_events ADD CONSTRAINT incident_events_incident_id_fkey FOREIGN KEY(incident_id) REFERENCES incidents(id) NOT VALID");
    if (!postgres) return false;
    const result = await connection.query("SELECT 1 FROM pg_extension WHERE extname='timescaledb'");
    if (!result.rows.length) return false;
    // Timescale recommends locking referenced tables while migrating an existing foreign-key table.
    await connection.query("LOCK TABLE incidents IN SHARE ROW EXCLUSIVE MODE");
    await connection.query("SELECT create_hypertable('incident_events', by_range('occurred_at'), if_not_exists => TRUE, migrate_data => TRUE)");
    return true;
  });
}
