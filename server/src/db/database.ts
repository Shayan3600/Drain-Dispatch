import "../config.js";
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
  let timescale = false;
  const url = process.env.DATABASE_URL;
  if (url && !localPath) {
    const pool = new pg.Pool({
      connectionString: url,
      max: 10,
      connectionTimeoutMillis: 10000,
    });
    const db: Database = {
      mode: "postgresql",
      timescale,
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
    await migrate(db);
    const result = await db.query(
      "SELECT 1 FROM pg_extension WHERE extname='timescaledb'",
    );
    if (result.rows.length) {
      await db.query(
        "SELECT create_hypertable('incident_events', by_range('occurred_at'), if_not_exists => TRUE, migrate_data => TRUE)",
      );
      db.timescale = true;
    }
    return db;
  }
  if (
    process.env.NODE_ENV === "production" ||
    (!localPath && process.env.DATABASE_MODE !== "local")
  )
    throw new Error(
      "Set DATABASE_URL, or explicitly set DATABASE_MODE=local for development.",
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
  await migrate(db);
  return db;
}
async function migrate(db: Database) {
  const sql = await readFile(
    path.join(root, "server/sql/001_init.sql"),
    "utf8",
  );
  for (const statement of sql.split(";").filter((s) => s.trim()))
    await db.query(statement);
}
