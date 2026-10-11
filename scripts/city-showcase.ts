import { createServer } from "node:http";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import path from "node:path";
import express from "express";
import { openDatabase, projectRoot } from "../server/src/db/database.js";
import { seedCityShowcase, showcaseIllustration } from "../server/src/db/cityShowcase.js";
import { createApp } from "../server/src/app.js";

// Own a new localhost-only listener and fresh on-disk DB. Never reopen the running DB.
if (process.env.NODE_ENV==="production") throw new Error("Showcase is local development only.");
process.env.NODE_ENV="development";
process.env.IMAGE_STORAGE="local";
const app = express();
app.use((_req,res,next)=>{res.setHeader("X-DrainDispatch-Data","synthetic-city-showcase-v1");next();});
let ready = false;
app.use((_req,res,next)=>ready ? next() : res.status(503).json({error:{message:"Local DEMO database is being prepared."}}));
const server = createServer(app);
await new Promise<void>((resolve,reject)=>{server.once("error",reject);server.listen(0,"127.0.0.1",resolve);});
const address = server.address();
if (!address || typeof address==="string") throw new Error("Local port was not allocated.");
const origin = `http://127.0.0.1:${address.port}`;
await mkdir(path.join(projectRoot,".data"),{recursive:true});
const databasePath = await mkdtemp(path.join(projectRoot,".data/city-showcase-v1-"));
const uploadsPath = path.join(databasePath,"illustrations");
process.env.LOCAL_UPLOAD_PATH=uploadsPath;
process.env.CLIENT_ORIGIN=origin;
// Explicit path bypasses remote configuration in openDatabase; local-only seeder checks mode again.
const db = await openDatabase(databasePath);
try {
  const result = await seedCityShowcase(db);
  await mkdir(uploadsPath,{recursive:true});
  for (const photo of result.photos) await writeFile(path.join(uploadsPath,photo.filename),showcaseIllustration(photo));
  app.use(createApp(db));
  const clientDist = path.join(projectRoot,"client/dist");
  app.use(express.static(clientDist));
  app.get("/{*path}",(_req,res)=>res.sendFile(path.join(clientDist,"index.html")));
  ready = true;
  const summary = { url:`${origin}/city`, apiOrigin:origin, databasePath, pid:process.pid, reports:result.reports, observations:result.observations, photos:result.photos.length, historyEvents:result.historyEvents, statusChanges:result.statusChanges, synthetic:true };
  await writeFile(path.join(projectRoot,".data/city-showcase-active.json"),JSON.stringify(summary,null,2));
  console.log(JSON.stringify(summary,null,2));
  console.log("Clearflow: saved database reports load automatically. Choose All statuses to see all 48. No cloud integrations or notifications were invoked.");
} catch (error) {
  server.close(); await db.close(); throw error;
}
for (const signal of ["SIGINT","SIGTERM"] as const) process.on(signal,()=>server.close(()=>void db.close().then(()=>process.exit(0))));
