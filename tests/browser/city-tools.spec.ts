import { test, expect } from "@playwright/test";
import { setupCityBrowser } from "./city-browser.setup";
setupCityBrowser();
import { chooseCityFilter, mockCityApi } from "./city-ui-helpers";
import { cityIssueColors, cityMarkerStyle, colorLuminance, countForeground } from "../../client/src/cityMapStyle";

const report = {id:"00000000-0000-4000-8000-000000000301",latitude:35.9132,longitude:-79.0558,description:"City tools fixture report",issueType:"blocked_drain",status:"pending_review",isDemo:false,createdAt:"2026-10-10T12:00:00Z",updatedAt:"2026-10-10T12:00:00Z",latestObservationAt:"2026-10-10T12:00:00Z",hasPhoto:true,observationCount:1};

test("category palettes darken monotonically, cap at 5+, and keep count text readable",()=>{
  const entries=Object.entries(cityIssueColors);
  for (let band=0;band<5;band++) expect(new Set(entries.map(([,palette])=>palette[band])).size).toBe(4);
  for (const [category,palette] of entries) {
    for (let index=0;index<palette.length;index++) {
      if(index) expect(colorLuminance(palette[index])).toBeLessThan(colorLuminance(palette[index-1]));
      const luminances=[colorLuminance(palette[index]),colorLuminance(countForeground(palette[index]))].sort((a,b)=>b-a);
      expect((luminances[0]+0.05)/(luminances[1]+0.05)).toBeGreaterThanOrEqual(4.5);
    }
    const item={issueType:category as keyof typeof cityIssueColors,observationCount:5};
    expect(cityMarkerStyle({...item,observationCount:8}).color).toBe(cityMarkerStyle(item).color);
    expect(cityMarkerStyle({...item,observationCount:8}).count).toBe(8);
    expect(cityMarkerStyle({...item,observationCount:0}).band).toBe(1);
    expect(cityMarkerStyle({...item,observationCount:NaN}).band).toBe(1);
  }
});

test("city markers and queue accents encode category and count, including closed 5+ reports",async({page})=>{
  const categories=Object.keys(cityIssueColors) as (keyof typeof cityIssueColors)[];
  const items=categories.flatMap((issueType,categoryIndex)=>[1,2,3,4,5,8].map(observationCount=>({...report,issueType,observationCount,
    id:`00000000-0000-4000-8000-${String(categoryIndex*10+observationCount).padStart(12,"0")}`,
    description:`${issueType} ${observationCount}-submission colour fixture`,status:observationCount===8 ? "closed" : "pending_review",
    latitude:report.latitude+categoryIndex*0.002,longitude:report.longitude+observationCount*0.002})));
  await page.route("**/api/**",route=>{
    const path=new URL(route.request().url()).pathname;
    return route.fulfill({json:path.endsWith("/history") ? [] : path==="/api/incidents" ? items : items.find(item=>path.endsWith(item.id))});
  });
  await page.goto("/city");
  await chooseCityFilter(page,"Community status","All statuses");
  await expect(page.locator(".cr-map .map-pin")).toHaveCount(24);
  await expect(page.locator('.cr-map .map-pin[data-band="5"]')).toHaveCount(8);
  await expect(page.locator(".cr-map .cr-pin-closed")).toHaveCount(4);
  for (const item of items) {
    const card=page.locator(".cr-card").filter({hasText:item.description});
    await card.click();
    const chosen=page.locator(".cr-map .map-pin.chosen");
    await expect(chosen).toHaveAttribute("data-submissions",String(item.observationCount));
    await expect(chosen).toHaveAttribute("data-band",String(Math.min(5,item.observationCount)));
    const expected=cityMarkerStyle(item);
    expect(await chosen.evaluate(element=>(element as HTMLElement).style.getPropertyValue("--pin"))).toBe(expected.color);
    expect(await card.evaluate(element=>(element as HTMLElement).style.getPropertyValue("--cr-report-color"))).toBe(expected.color);
    await expect(chosen.locator("span")).toHaveText(String(item.observationCount));
  }
  await expect(page.getByText(/Darker = more submissions, not severity/)).toBeVisible();
  await page.setViewportSize({width:390,height:844});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
});

test("city tiles send origin-only Referer without relaxing the page privacy policy",async({page})=>{
  const referrers:(string|null)[]=[];
  // Intercept tiles locally: tests must never load or pan through OSM's public service.
  await page.route("https://tile.openstreetmap.org/**",async route=>{
    referrers.push(await route.request().headerValue("referer"));
    await route.fulfill({contentType:"image/png",body:Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==","base64")});
  });
  await page.goto("/city?privateNote=not-for-the-tile-provider");
  await expect.poll(()=>referrers.length).toBeGreaterThan(0);
  await expect(page.locator(".cr-map .leaflet-tile").first()).toHaveAttribute("referrerpolicy","origin");
  expect(referrers.every(value=>value===`${new URL(page.url()).origin}/`)).toBe(true);
  await expect(page.locator('meta[name="referrer"]')).toHaveAttribute("content","no-referrer");
});

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
  await page.getByRole("button",{name:"Refresh reports",exact:true}).click();
  await expect(page.getByRole("alert")).toContainText("Queue may be out of date");
  await expect(page.getByText("Evidence version 2",{exact:true})).toBeVisible();
  await expect(page.getByRole("textbox",{name:"Report packet preview"})).toHaveValue(/STALE SNAPSHOT/);
  fail=false;
  await page.getByRole("button",{name:"Refresh reports",exact:true}).click();
  await expect(page.getByRole("alert")).toHaveCount(0);
  expect(listReads).toBeGreaterThanOrEqual(4);
  expect(writes).toEqual([]);
});

test("map controls, evidence filters and mobile layout remain interactive and read-only",async({page})=>{
  await page.setViewportSize({width:390,height:844});
  await mockCityApi(page);
  await page.goto("/city");
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
  await page.getByRole("button",{name:"Refresh reports",exact:true}).click();
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

test("custom filter menus support keyboard, escape, outside clicks and mobile bounds",async({page})=>{
  await mockCityApi(page);
  await page.goto("/city");
  const category=page.getByRole("combobox",{name:"Concern type",exact:true});
  await category.focus();
  await category.press("ArrowDown");
  await expect(page.getByRole("listbox",{name:"Concern type",exact:true})).toBeVisible();
  await category.press("d");
  const damage=page.getByRole("option",{name:"Damaged drain",exact:true});
  await expect(category).toHaveAttribute("aria-activedescendant",await damage.getAttribute("id") as string);
  await category.press("Escape");
  await expect(category).toContainText("All concerns");
  await expect(page.getByRole("listbox")).toHaveCount(0);
  await category.press("ArrowDown");
  await category.press("Home");
  await category.press("ArrowDown");
  await category.press("Enter");
  await expect(category).toContainText("Blocked drain");
  await expect(category).toBeFocused();
  await expect(page.locator(".cr-card")).toHaveCount(1);
  await category.click();
  await page.getByLabel("Search reports").click();
  await expect(page.getByRole("listbox")).toHaveCount(0);
  await category.focus();await category.press("ArrowDown");await category.press("Tab");
  await expect(page.getByRole("listbox")).toHaveCount(0);
  await page.getByRole("button",{name:"Reset filters",exact:true}).click();
  await expect(page.locator(".cr-card")).toHaveCount(2);
  await page.setViewportSize({width:320,height:844});
  await category.click();
  const bounds=await page.getByRole("listbox",{name:"Concern type",exact:true}).boundingBox();
  expect(bounds).not.toBeNull();
  expect(bounds!.x).toBeGreaterThanOrEqual(0);expect(bounds!.x+bounds!.width).toBeLessThanOrEqual(320);
  expect(bounds!.y).toBeGreaterThanOrEqual(0);expect(bounds!.y+bounds!.height).toBeLessThanOrEqual(844);
  await page.getByRole("option",{name:"Standing water",exact:true}).click();
  await expect(page.locator(".cr-card")).toHaveCount(1);
});

test("an unavailable database never substitutes built-in samples",async({page})=>{
  await page.goto("/city");
  await expect(page.getByRole("alert")).toContainText("Reporting API unavailable");
  await expect(page.locator(".cr-card")).toHaveCount(0);
  await expect(page.getByRole("button",{name:"Use sample reports",exact:true})).toHaveCount(0);
  await expect(page.getByLabel("Include demo reports")).toHaveCount(0);
});
