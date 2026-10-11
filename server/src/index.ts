import { validateProductionConfig, ProductionConfigurationError } from "./config.js";
import { openDatabase } from "./db/database.js";
import { createApp } from "./app.js";
try {
  validateProductionConfig(process.env, "api");
} catch (error) {
  console.error(error instanceof ProductionConfigurationError ? error.message : "Production database configuration is invalid; check private settings.");
  process.exit(1);
}
const db = await openDatabase().catch(() => {
  console.error("Database startup failed. Check private PostgreSQL configuration and connectivity; no credentials are logged.");
  process.exit(1);
});
const port = Number(process.env.PORT || 3001);
const server = createApp(db).listen(port, () =>
  console.log(
    `DrainDispatch API listening on http://localhost:${port} (${db.mode})`,
  ),
);
for (const signal of ["SIGINT", "SIGTERM"] as const)
  process.on(signal, () =>
    server.close(() => {
      void db.close().then(() => process.exit(0));
    }),
  );
