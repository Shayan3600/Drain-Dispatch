import { openDatabase } from "./database.js";
const db = await openDatabase();
console.log(`Schema ready (${db.mode}; time-series=${db.timescale})`);
await db.close();
