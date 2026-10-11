import { test, expect } from "./fixtures";

const report = {id:"00000000-0000-4000-8000-000000000301",latitude:35.9132,longitude:-79.0558,description:"City tools fixture report",issueType:"blocked_drain",status:"pending_review",isDemo:false,createdAt:"2026-10-10T12:00:00Z",updatedAt:"2026-10-10T12:00:00Z",latestObservationAt:"2026-10-10T12:00:00Z",hasPhoto:true,observationCount:1};

test("polling retains selection and packet options, refreshes evidence and warns about stale data",async({page})=>{
  await page.clock.install();
  let count=1, fail=false, listReads=0;
  const writes:string[]=[];
  page.on("request",req=>{if(new URL(req.url()).pathname.startsWith("/api/") && req.method()!=="GET")writes.push(req.method());});
  await page.route("**/api/**",async route=>{
    const url=new URL(route.request().url());
    if(url.pathname==="/api/incidents")listReads++;
    if(fail)return route.fulfill({status:503,json:{error:{message:"Synthetic refresh failure"}}});
    const current={...report,observationCount:count,observations:[{id:"obs",description:`Evidence version ${count}`,source:"web",createdAt:report.createdAt}]};
    return route.fulfill({json:url.pathname.endsWith("/history")?[]:url.pathname==="/api/incidents"?[current]:current});
  });
  await page.goto("/city");
  await page.locator(".cr-card").click();
  await expect(page.getByText("Evidence version 1",{exact:true})).toBeVisible();
  await page.getByLabel("Include eligible public photo links").check();
  count=2;
  await page.clock.fastForward(30000);
  await expect(page.getByText("Evidence version 2",{exact:true})).toBeVisible();
  await expect(page.getByLabel("Include eligible public photo links")).toBeChecked();
  await expect(page.locator(".cr-map .map-pin.chosen")).toHaveCount(1);
  fail=true;
  await page.getByRole("button",{name:"Refresh",exact:true}).click();
  await expect(page.getByRole("alert")).toContainText("Queue may be out of date");
  await expect(page.getByText("Evidence version 2",{exact:true})).toBeVisible();
  await expect(page.getByRole("textbox",{name:"Report packet preview"})).toHaveValue(/STALE SNAPSHOT/);
  fail=false;
  await page.getByRole("button",{name:"Refresh",exact:true}).click();
  await expect(page.getByRole("alert")).toHaveCount(0);
  expect(listReads).toBeGreaterThanOrEqual(4);
  expect(writes).toEqual([]);
});

test("map controls, evidence filters and mobile layout remain interactive and read-only",async({page})=>{
  await page.setViewportSize({width:390,height:844});
  await page.goto("/city");
  await page.getByRole("button",{name:"Use sample reports",exact:true}).click();
  await expect(page.locator(".cr-card")).toHaveCount(2);
  await page.getByRole("button",{name:"Fit filtered reports",exact:true}).click();
  await page.getByLabel("Only reports in map area").check();
  await expect(page.locator(".cr-card")).toHaveCount(2);
  await page.getByLabel("Photo evidence only").check();
  await expect(page.locator(".cr-card")).toHaveCount(1);
  await page.getByLabel("Multiple submissions").check();
  await page.locator(".cr-card").click();
  await page.getByRole("button",{name:"Focus selected report",exact:true}).click();
  await expect(page.locator(".cr-map .map-pin.chosen")).toHaveCount(1);
  await expect(page.locator(".cr-card")).toContainText("Photo evidence available");
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBeTruthy();
});

test("hidden tabs pause polling and visible tabs catch up",async({page})=>{
  await page.addInitScript(()=>Object.defineProperty(document,"hidden",{configurable:true,get:()=>Boolean((window as unknown as {testHidden?:boolean}).testHidden)}));
  await page.clock.install();
  let reads=0;
  await page.route("**/api/**",route=>{reads++;return route.fulfill({json:[report]});});
  await page.goto("/city");
  await expect(page.locator(".cr-card")).toHaveCount(1);
  const before=reads;
  await page.evaluate(()=>{(window as unknown as {testHidden:boolean}).testHidden=true;document.dispatchEvent(new Event("visibilitychange"));});
  await page.clock.fastForward(60000);
  expect(reads).toBe(before);
  await page.evaluate(()=>{(window as unknown as {testHidden:boolean}).testHidden=false;document.dispatchEvent(new Event("visibilitychange"));});
  await expect.poll(()=>reads).toBeGreaterThan(before);
});

test("failed evidence stays marked stale during a delayed retry until fresh detail arrives",async({page})=>{
  let phase:"good"|"failed"|"delayed"="good";
  let releaseDetail:(()=>Promise<void>)|undefined;
  await page.route("**/api/**",async route=>{
    const pathname=new URL(route.request().url()).pathname;
    if(pathname==="/api/incidents")return route.fulfill({json:[report]});
    // History resolves before the held detail request: it cannot certify freshness.
    if(pathname.endsWith("/history"))return route.fulfill({json:[]});
    if(phase==="failed")return route.fulfill({status:503,json:{error:{message:"Synthetic evidence failure"}}});
    const detail={...report,observations:[{id:"obs",description:phase==="good"?"Previously loaded evidence":"Fresh replacement evidence",source:"web",createdAt:report.createdAt}]};
    if(phase==="delayed") { releaseDetail=()=>route.fulfill({json:detail}); return; }
    return route.fulfill({json:detail});
  });
  await page.goto("/city");
  await page.locator(".cr-card").click();
  await expect(page.getByText("Previously loaded evidence",{exact:true})).toBeVisible();
  const preview=page.getByRole("textbox",{name:"Report packet preview"});
  phase="failed";
  await page.getByRole("button",{name:"Refresh",exact:true}).click();
  await expect(page.getByRole("alert")).toContainText("Synthetic evidence failure");
  await expect(preview).toHaveValue(/STALE SNAPSHOT/);
  phase="delayed";
  await page.getByRole("button",{name:"Retry evidence",exact:true}).click();
  await expect.poll(()=>Boolean(releaseDetail)).toBe(true);
  await expect(page.getByText("Loading community history…",{exact:true})).toHaveCount(0);
  await expect(page.getByText("Previously loaded evidence",{exact:true})).toBeVisible();
  await expect(preview).toHaveValue(/STALE SNAPSHOT/);
  await expect(page.locator(".cr-evidence")).toContainText(" · STALE");
  await expect(page.getByRole("button",{name:"Copy report",exact:true})).toBeEnabled();
  await releaseDetail!();
  await expect(page.getByText("Fresh replacement evidence",{exact:true})).toBeVisible();
  await expect(preview).not.toHaveValue(/STALE SNAPSHOT/);
});
