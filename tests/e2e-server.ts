import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { openDatabase } from "../server/src/db/database.js";
import { createApp } from "../server/src/app.js";
const directory = await mkdtemp(
  path.join(os.tmpdir(), "draindispatch-browser-"),
);
process.env.IMAGE_STORAGE = "local";
process.env.LOCAL_UPLOAD_PATH = path.join(directory, "uploads");
process.env.PUBLIC_API_URL = "http://localhost:3002";
delete process.env.DATABASE_URL;
delete process.env.GEMINI_API_KEY;
process.env.WORKER_TOKEN = "isolated-browser-test-worker-secret";
const db = await openDatabase(path.join(directory, "db"));
const server = createApp(db).listen(3002, () =>
  console.log("Isolated browser-test API ready"),
);
for (const signal of ["SIGINT", "SIGTERM"] as const)
  process.on(signal, () =>
    server.close(() => {
      void db
        .close()
        .then(() => rm(directory, { recursive: true, force: true }))
        .then(() => process.exit(0));
    }),
  );
