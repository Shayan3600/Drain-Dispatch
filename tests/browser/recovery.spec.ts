import {test,expect} from "./fixtures";
import type {Incident} from "../../client/src/types";

const incident: Incident = {
  id:"00000000-0000-4000-8000-000000000801",latitude:35.9132,longitude:-79.0558,
  description:"Synthetic independent-read recovery report",issueType:"blocked_drain",status:"pending_review",isDemo:false,
  observationCount:1,createdAt:"2026-10-11T12:00:00Z",updatedAt:"2026-10-11T12:00:00Z",
  observations:[{id:"synthetic-recovery-evidence",source:"imessage",createdAt:"2026-10-11T12:00:00Z",description:"Synthetic image evidence remains usable",photoUrl:"/uploads/synthetic-detail.svg"}],
};
const stats={totalIncidents:1,activeIncidents:1,closedIncidents:0,observationCount:1,byCategory:[],overTime:[],repeatedLocations:[]};
const svg='<svg xmlns="http://www.w3.org/2000/svg" width="400" height="200"><rect width="400" height="200" fill="#bbddd1"/></svg>';

test("a pending analytics request does not delay available dashboard reports or map markers",async({page})=>{
  let releaseStats:(()=>Promise<void>)|undefined;
  await page.route("**/api/**",route=>{
    const path=new URL(route.request().url()).pathname;
    if(path==="/api/stats") {releaseStats=()=>route.fulfill({json:stats});return;}
    return route.fulfill({json:path==="/api/incidents"?[incident]:{alerts:[]}});
  });
  try {
    await page.goto("/");
    await expect.poll(()=>Boolean(releaseStats)).toBe(true);
    await expect(page.locator(".incident-card")).toContainText(incident.description);
    await expect(page.locator(".leaflet-marker-icon")).toHaveCount(1);
    await expect(page.getByRole("button",{name:"Refresh",exact:true})).toBeEnabled();
  } finally {await releaseStats?.();}
});

test("history failure does not suppress loaded photo evidence and retries separately",async({page})=>{
  let failHistory=true;
  let detailReads=0;
  await page.route("**/uploads/**",route=>route.fulfill({contentType:"image/svg+xml",body:svg}));
  await page.route("**/api/**",route=>{
    const path=new URL(route.request().url()).pathname;
    if(path.endsWith("/history")) return failHistory
      ? route.fulfill({status:503,json:{error:{message:"Synthetic history temporarily unavailable"}}})
      : route.fulfill({json:[{eventType:"incident_created",createdAt:incident.createdAt}]});
    if(path===`/api/incidents/${incident.id}`)detailReads++;
    return route.fulfill({json:path==="/api/incidents"?[incident]:path==="/api/stats"?stats:path==="/api/weather"?{alerts:[]}:incident});
  });
  await page.goto("/");
  await page.locator(".incident-card").click();
  const dialog=page.getByRole("dialog",{name:"Incident & observations"});
  await expect(dialog.getByText("Synthetic image evidence remains usable",{exact:true})).toBeVisible();
  const image=dialog.getByRole("img",{name:"Submitted report photo",exact:true});
  await image.scrollIntoViewIfNeeded();
  await expect.poll(()=>image.evaluate(element=>(element as HTMLImageElement).naturalWidth)).toBe(400);
  await expect(dialog.getByRole("button",{name:"Retry history",exact:true})).toBeVisible();
  const beforeRetry=detailReads;
  failHistory=false;
  await dialog.getByRole("button",{name:"Retry history",exact:true}).click();
  await expect(dialog.locator(".history")).toContainText("Incident created");
  await expect(dialog.getByRole("button",{name:"Retry history",exact:true})).toHaveCount(0);
  expect(detailReads).toBe(beforeRetry);
});

test("temporary draft errors retry existing evidence while preserving edited reporting fields",async({page})=>{
  const draftToken="synthetic-transient-recovery-draft";
  let draftReads=0;
  let failDraft=true;
  let writes=0;
  page.on("request",request=>{if(new URL(request.url()).pathname.startsWith("/api/") && request.method()!=="GET")writes++;});
  await page.route("**/uploads/**",route=>route.fulfill({contentType:"image/svg+xml",body:svg}));
  await page.route("**/api/**",route=>{
    const path=new URL(route.request().url()).pathname;
    if(path===`/api/report-drafts/${draftToken}`) {
      draftReads++;
      return failDraft ? route.fulfill({status:503,json:{error:{message:"Synthetic temporary draft outage"}}})
        : route.fulfill({json:{description:"Original synthetic message description",issueType:"blocked_drain",isDemo:false,photoId:"synthetic-draft-photo",photoUrl:"/uploads/synthetic-detail.svg"}});
    }
    return route.fulfill({json:path==="/api/incidents"?[]:path==="/api/stats"?stats:{alerts:[]}});
  });
  await page.goto(`/confirm/${draftToken}`);
  const dialog=page.getByRole("dialog");
  await expect(dialog.getByRole("button",{name:"Retry loading",exact:true})).toBeVisible();
  const description=dialog.getByLabel("Describe what you noticed");
  await description.fill("Synthetic owner correction preserved during retry");
  await dialog.getByLabel("Type of concern").selectOption("standing_water");
  const initialReads=draftReads;
  failDraft=false;
  await dialog.getByRole("button",{name:"Retry loading",exact:true}).click();
  await expect(dialog.getByRole("img",{name:"Uploaded drainage evidence",exact:true})).toBeVisible();
  await expect(description).toHaveValue("Synthetic owner correction preserved during retry");
  await expect(dialog.getByLabel("Type of concern")).toHaveValue("standing_water");
  await expect(dialog.getByRole("button",{name:"Continue",exact:true})).toBeEnabled();
  expect(draftReads).toBe(initialReads+1);
  expect(writes).toBe(0);
});
