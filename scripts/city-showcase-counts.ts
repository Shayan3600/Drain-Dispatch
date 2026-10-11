import { readFile, writeFile } from "node:fs/promises";

const manifestPath = ".data/city-showcase-active.json";
const active = JSON.parse(await readFile(manifestPath,"utf8"));
const origin = new URL(active.apiOrigin);
if (origin.protocol!=="http:" || origin.hostname!=="127.0.0.1" || origin.username || origin.password || origin.pathname!=="/" || origin.search || origin.hash || active.synthetic!==true) throw new Error("Refusing a non-local showcase target.");
const health = await fetch(new URL("/api/health",origin),{signal:AbortSignal.timeout(5000)});
if (!health.ok || health.headers.get("x-draindispatch-data")!=="synthetic-city-showcase-v1" || (await health.json()).databaseMode!=="local-postgresql") throw new Error("Expected the isolated local showcase API.");
async function reports() {
  const result=await fetch(new URL("/api/incidents?demo=true&sort=updated",origin),{signal:AbortSignal.timeout(5000)});
  if(!result.ok) throw new Error(`Local demo read failed (${result.status}).`);
  return await result.json() as {id:string;isDemo:boolean;description:string;issueType:string;observationCount:number}[];
}
const before=await reports();
const targets = [8,11,12].flatMap((offset)=>[0,1,2,3].map(category=>({reference:`CITY DEMO ${String(category*12+offset).padStart(2,"0")} —`,count:offset===8 ? 5 : offset===11 ? 6 : 8,category:["blocked_drain","standing_water","damaged_drain","other"][category]})));
let added=0;
for(const target of targets) {
  const incident=before.find(item=>item.description.startsWith(target.reference));
  if(!incident || !incident.isDemo || incident.issueType!==target.category) throw new Error("Expected seeded DEMO record missing; refusing to change unrelated data.");
  for(let count=incident.observationCount+1;count<=target.count;count++) {
    const result=await fetch(new URL(`/api/incidents/${incident.id}/observations`,origin),{
      method:"POST",headers:{"Content-Type":"application/json"},signal:AbortSignal.timeout(10000),
      body:JSON.stringify({description:`${target.reference} SYNTHETIC colour-scale follow-up ${count}: count-only demonstration, not a new complaint, unique person, verified hazard, inspection, or repair.`,sameLocationConfirmed:true,idempotencyKey:`city-shading-demo-v1:${incident.id}:${count}`}),
    });
    if(!result.ok) throw new Error(`Demo follow-up failed (${result.status}); rerun safely after checking the local server.`);
    added++;
  }
}
const after=await reports();
const bands=[1,2,3,4,5].map(band=>({band:band===5 ? "5+" : String(band),reports:after.filter(item=>Math.min(5,item.observationCount)===band).length}));
const summary={reports:after.length,observations:after.reduce((sum,item)=>sum+item.observationCount,0),added,bands};
await writeFile(manifestPath,JSON.stringify({...active,observations:summary.observations,historyEvents:active.historyEvents+added},null,2));
console.log(JSON.stringify(summary,null,2));
