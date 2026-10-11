import { test, expect } from "@playwright/test";
import { readFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import type { Database } from "../../server/src/db/database";
import { seedCityShowcase, showcaseIllustration } from "../../server/src/db/cityShowcase";
import { Reporting } from "../../server/src/services/reporting";
import { setupCityBrowser } from "./city-browser.setup";
setupCityBrowser();
import { chooseCityFilter } from "./city-ui-helpers";

// Typography baseline measured from Clearflow Website v5's style.css/theme-v2.css.
// Keep role checks portable: CI needs neither the uploaded archive nor its scripts.
function referenceTypography() {
  const entry=(family:string,size:number,weight:string,line=size*1.5,spacing=0)=>({family,size,weight,line,spacing});
  const display="Not Just Groovy";
  const body="Segoe UI";
  return {
    desktop:{brand:entry(display,26,"400"),display:entry(display,77,"400",88.55,-1),lead:entry(body,14,"400"),panel:entry(body,22,"500"),cardPanel:entry(body,19,"550"),label:entry(body,11,"600"),field:entry(body,12,"400"),button:entry(body,12,"650"),eyebrow:entry(body,9,"750"),footer:entry(display,22,"400")},
    mobile:{brand:entry(display,21,"400"),display:entry(display,45.63,"400"),lead:entry(body,12,"400"),eyebrow:entry(body,8,"750")},
  };
}

test("Simplified ClearFlow workspace keeps city functionality and responsive layout",async({page})=>{
  // Render the actual app with the actual local showcase schema/data. Public map tiles
  // are intentionally blocked by the offline harness; this is not live-site evidence.
  const engine=new PGlite();
  const db:Database={mode:"local-postgresql",timescale:false,query:async(s,p)=>await engine.query(s,p) as any,transaction:fn=>engine.transaction(tx=>fn({query:async(s,p)=>await tx.query(s,p) as any})),close:()=>engine.close()};
  await engine.exec(await readFile("server/sql/001_init.sql","utf8"));
  const seeded=await seedCityShowcase(db,new Date("2026-10-11T03:00:00Z"));
  const reporting=new Reporting(db);
  const writes:string[]=[];
  const errors:string[]=[];
  const soundRequests:string[]=[];
  page.on("pageerror",error=>errors.push(error.message));
  page.on("request",request=>{
    if(new URL(request.url()).pathname.startsWith("/api/")&&request.method()!=="GET")writes.push(request.method());
    if(/\.(wav|mp3|ogg|m4a)(\?|$)/i.test(request.url()))soundRequests.push(request.url());
  });
  await page.route("**/api/**",async route=>{
    const url=new URL(route.request().url());
    const parts=url.pathname.split("/");
    if(url.pathname==="/api/incidents")return route.fulfill({json:await reporting.list({demo:url.searchParams.has("demo") ? url.searchParams.get("demo")==="true" : undefined,sort:"updated"})});
    return route.fulfill({json:parts[4]==="history" ? await reporting.history(parts[3]) : await reporting.detail(parts[3])});
  });
  await page.route("**/uploads/**",async route=>{
    const filename=new URL(route.request().url()).pathname.split("/").at(-1);
    const photo=seeded.photos.find(item=>item.filename===filename);
    return photo ? route.fulfill({contentType:"image/svg+xml",body:showcaseIllustration(photo)}) : route.fulfill({status:404});
  });
  try {
    const reference=referenceTypography();
    await page.setViewportSize({width:1440,height:1100});
    await page.goto("/city");
    await expect(page.locator(".cr-atmosphere, .aero-bubble, audio, video")).toHaveCount(0);
    await expect(page.getByRole("heading",{level:1})).toHaveText("Drain reports.");
    await expect(page.locator(".cr-overview, .cr-workflow, .cr-source")).toHaveCount(0);
    await expect(page.getByRole("button",{name:"Refresh reports",exact:true})).toBeVisible();
    // Desktop opens on the real workspace, not a stack of introductory panels.
    expect((await page.getByRole("region",{name:"Report locations"}).boundingBox())!.y).toBeLessThan(600);
    await expect(page.getByRole("navigation",{name:"City workspace navigation"})).toBeVisible();
    await chooseCityFilter(page,"Community status","All statuses");
    await expect(page.locator(".cr-card")).toHaveCount(48);
    await expect(page.locator(".cr-summary")).toContainText("48 loaded");
    await chooseCityFilter(page,"Concern type","Standing water");
    await page.getByLabel("Photo evidence only").check();
    await expect(page.locator(".cr-card")).toHaveCount(6);
    await page.getByRole("button",{name:"Reset filters",exact:true}).click();
    await expect(page.getByRole("button",{name:"Live API",exact:true})).toHaveCount(0);
    await expect(page.getByRole("combobox")).toHaveCount(3);
    await expect(page.locator(".cr-brand")).toHaveText("ClearFlow");
    await expect(page.getByRole("combobox",{name:"Community status",exact:true})).toContainText("Active reports");
    await expect(page.locator(".cr-card")).toHaveCount(32);
    await chooseCityFilter(page,"Community status","All statuses");
    await page.locator(".cr-card").filter({hasText:"CITY DEMO 01 —"}).click();
    await expect(page.locator(".cr-observation img")).toHaveCount(1);
    await expect.poll(()=>page.locator(".cr-observation img").first().evaluate(element=>(element as HTMLImageElement).naturalWidth)).toBe(800);
    await expect(page.getByRole("textbox",{name:"Report packet preview"})).toHaveValue(/DEMO \/ TEST REPORT/);
    await page.evaluate(()=>document.fonts.ready);
    expect(await page.evaluate(()=>document.fonts.check('42px "Not Just Groovy"'))).toBe(true);
    for(const selector of [".cr-brand",".cr-intro h1",".cr-footer strong"]) {
      expect(await page.locator(selector).first().evaluate(element=>getComputedStyle(element).fontFamily)).toContain("Not Just Groovy");
    }
    async function typography(selector:string) {
      return page.locator(selector).first().evaluate(element=>{
        const style=getComputedStyle(element);
        return {family:style.fontFamily,size:parseFloat(style.fontSize),weight:style.fontWeight,line:parseFloat(style.lineHeight),spacing:parseFloat(style.letterSpacing)||0};
      });
    }
    for(const [selector,expected] of [
      [".cr-brand",reference.desktop.brand],[".cr-intro h1",reference.desktop.display],
      [".cr-intro p",reference.desktop.lead],[".cr-section-heading h2",reference.desktop.panel],
      [".cr-map-heading h2",reference.desktop.panel],[".cr-evidence>.cr-panel-heading h2",reference.desktop.panel],
      [".cr-queue>.cr-panel-heading h2",reference.desktop.cardPanel],[".cr-select-label",reference.desktop.label],
      [".cr-select-trigger",reference.desktop.field],[".cr-header>.cr-button",reference.desktop.button],
      [".cr-eyebrow",reference.desktop.eyebrow],[".cr-footer strong",reference.desktop.footer],
    ] as const) {
      const actual=await typography(selector);
      expect(actual.family.split(",")[0].replaceAll('"',""),selector).toBe(expected.family.split(",")[0].replaceAll('"',""));
      expect(actual.size,selector).toBeCloseTo(expected.size,1);
      expect(actual.weight,selector).toBe(expected.weight);
    }
    expect((await typography(".cr-intro h1")).line).toBeCloseTo(reference.desktop.display.line,1);
    expect((await typography(".cr-intro h1")).spacing).toBe(reference.desktop.display.spacing);
    for(const selector of [".cr-section-heading h2",".cr-panel-heading h2",".cr-map-heading h2",".cr-select-trigger",".cr-card-top strong",".cr-evidence h3"]) {
      expect((await typography(selector)).family).toContain("Segoe UI");
    }
    expect((await typography(".cr-intro h1")).size).toBeGreaterThan((await typography(".cr-map-heading h2")).size);
    expect((await typography(".cr-map-heading h2")).size).toBeGreaterThan((await typography(".cr-card-top strong")).size);
    expect((await typography(".cr-report-title")).size).toBeGreaterThan((await typography(".cr-packet h3")).size);
    expect((await typography(".cr-report-title")).size).toBe(reference.desktop.panel.size);
    const licenseLink=page.getByRole("link",{name:"CC BY-NC-ND 3.0 · Noncommercial",exact:true});
    await expect(licenseLink).toHaveAttribute("href",/Not-Just-Groovy-LICENSE/);
    expect(await page.evaluate(async url=>(await fetch(url)).text(),(await licenseLink.getAttribute("href"))!)).toContain("Noncommercial");
    expect(await page.locator(".cr-queue-items").evaluate(element=>element.scrollHeight>element.clientHeight)).toBe(true);
    await page.getByRole("button",{name:"Fit filtered reports",exact:true}).click();
    await page.evaluate(()=>window.scrollTo({top:0,behavior:"instant"}));
    await page.locator(".cr-queue-items").evaluate(element=>{element.scrollTop=0;});
    await expect.poll(()=>page.evaluate(()=>window.scrollY)).toBe(0);
    const artifacts=process.env.CITY_UI_ARTIFACTS_DIR;
    const artifactTag=process.env.CITY_UI_ARTIFACT_TAG ?? String(Date.now());
    if(artifacts) {
      await mkdir(artifacts,{recursive:true});
      await page.screenshot({path:path.join(artifacts,`city_clearflow_desktop_${artifactTag}.png`),fullPage:true});
      await page.screenshot({path:path.join(artifacts,`city_clearflow_workspace_${artifactTag}.png`)});
      await page.getByRole("combobox",{name:"Concern type",exact:true}).click();
      const panel=await page.getByRole("region",{name:"Review filters"}).boundingBox();
      const popup=await page.getByRole("listbox",{name:"Concern type",exact:true}).boundingBox();
      const top=Math.max(0,Math.min(panel!.y,popup!.y)-8);
      const bottom=Math.max(panel!.y+panel!.height,popup!.y+popup!.height)+8;
      await page.screenshot({path:path.join(artifacts,`clearflow_custom_filters_${artifactTag}.png`),clip:{x:panel!.x-8,y:top,width:panel!.width+16,height:bottom-top}});
      await page.getByRole("combobox",{name:"Concern type",exact:true}).press("Escape");
    }
    for(const width of [900,768,680,390,320]) {
      await page.setViewportSize({width,height:844});
      expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`overflow at ${width}px`).toBe(true);
    }
    await page.setViewportSize({width:390,height:844});
    for(const [selector,expected] of [[".cr-brand",reference.mobile.brand],[".cr-intro h1",reference.mobile.display],[".cr-intro p",reference.mobile.lead],[".cr-eyebrow",reference.mobile.eyebrow]] as const) {
      expect((await typography(selector)).size,`mobile ${selector}`).toBeCloseTo(expected.size,1);
    }
    await page.getByRole("navigation",{name:"City workspace navigation"}).getByRole("link",{name:"Map",exact:true}).click();
    await expect(page).toHaveURL(/#city-map$/);
    await expect.poll(()=>page.evaluate(()=>{
      const element=document.getElementById("city-map")!;
      const intended=parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop)+parseFloat(getComputedStyle(element).scrollMarginTop);
      return Math.abs(element.getBoundingClientRect().top-intended)<2;
    })).toBe(true);
    if(artifacts) await page.screenshot({path:path.join(artifacts,`city_clearflow_mobile_map_${artifactTag}.png`)});
    await page.getByRole("button",{name:"Focus selected report",exact:true}).click();
    await expect(page.locator(".cr-map .map-pin.chosen")).toHaveCount(1);
    expect(writes).toEqual([]);
    expect(soundRequests).toEqual([]);
    expect(errors).toEqual([]);
  } finally { await db.close(); }
});
