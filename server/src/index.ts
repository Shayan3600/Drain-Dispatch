import "./config.js";
import { openDatabase } from "./db/database.js";
import { createApp } from "./app.js";
const db = await openDatabase();
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
