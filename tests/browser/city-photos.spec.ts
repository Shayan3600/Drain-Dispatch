import {test,expect} from "./fixtures";
import {readFile} from "node:fs/promises";
import path from "node:path";
import {PGlite} from "@electric-sql/pglite";
import type {Database} from "../../server/src/db/database";
import {seedCityShowcase} from "../../server/src/db/cityShowcase";
import {cityReferencePhotos} from "../../server/src/db/cityReferencePhotos";
import {Reporting} from "../../server/src/services/reporting";
import {setupCityBrowser} from "./city-browser.setup";
import {chooseCityFilter} from "./city-ui-helpers";
setupCityBrowser();

test("all uploaded reference photos appear in matching report evidence and retain full-size links",async({page})=>{
  test.setTimeout(60000);
  const engine = new PGlite();
  const db:Database={mode:"local-postgresql",timescale:false,query:async(s,p)=>await engine.query(s,p) as any,transaction:fn=>engine.transaction(tx=>fn({query:async(s,p)=>await tx.query(s,p) as any})),close:()=>engine.close()};
  await engine.exec(await readFile("server/sql/001_init.sql","utf8"));
  await seedCityShowcase(db,new Date("2026-10-11T12:00:00Z"),{referencePhotos:true});
  const reporting = new Reporting(db);
  const reports = await reporting.list({demo:true});
  const details = await Promise.all(reports.filter(report=>report.hasPhoto&&report.issueType!=="other").map(report=>reporting.detail(report.id)));
  const loaded = new Set<string>();
  let failPhoto = false;
  const writes:string[] = [];
  page.on("request",request=>{if(new URL(request.url()).pathname.startsWith("/api/")&&request.method()!=="GET")writes.push(request.method());});
  await page.route("**/api/**",async route=>{
    const parts = new URL(route.request().url()).pathname.split("/");
    if(parts.length===3)return route.fulfill({json:reports});
    if(parts[4]==="history")return route.fulfill({json:await reporting.history(parts[3])});
    const detail = await reporting.detail(parts[3]);
    // Use a new URL to test failure rather than the browser's decoded-image cache.
    if(failPhoto)detail.observations.forEach(observation=>{if(observation.photoUrl)observation.photoUrl+="?simulate-missing=1";});
    return route.fulfill({json:detail});
  });
  await page.route("**/uploads/**",async route=>{
    const filename = new URL(route.request().url()).pathname.split("/").at(-1)!;
    if(failPhoto)return route.fulfill({status:404});
    if(!cityReferencePhotos.some(photo=>photo.filename===filename))return route.fulfill({status:404});
    const body = await readFile(path.join("server/demo-assets/city",filename));
    loaded.add(filename);
    return route.fulfill({contentType:"image/png",body});
  });
  try {
    await page.setViewportSize({width:1440,height:1100});
    await page.goto("/city");
    await chooseCityFilter(page,"Community status","All statuses");
    await page.getByLabel("Photo evidence only").check();
    await expect(page.locator(".cr-card")).toHaveCount(24);
    const seen = new Set<string>();
    for(const reference of cityReferencePhotos) {
      if(seen.has(reference.filename))continue;
      const detail = details.find(report=>report.observations.some(observation=>observation.photoUrl===`/uploads/${reference.filename}`))!;
      await page.locator(".cr-card").filter({hasText:detail.description}).click();
      await expect(page.locator(".cr-reference")).toContainText(detail.id);
      for(const observation of detail.observations.filter(observation=>observation.photoUrl)) {
        const filename = observation.photoUrl!.split("/").at(-1)!;
        const image = page.locator(`.cr-observation img[src$="/${filename}"]`).first();
        await image.scrollIntoViewIfNeeded();
        await expect.poll(()=>image.evaluate(element=>(element as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
        expect(await image.evaluate(element=>getComputedStyle(element).objectFit)).toBe("contain");
        const figure = page.locator(".cr-evidence-photo").filter({has:page.locator(`img[src$="/${filename}"]`)}).first();
        await expect(figure).toContainText("location and capture date unverified");
        await expect(figure.getByRole("link",{name:"Open full-size image",exact:false})).toHaveAttribute("href",new RegExp(`/${filename}$`));
        seen.add(filename);
      }
    }
    expect(seen.size).toBe(10);
    expect(loaded.size).toBe(10);
    for(const width of [390,320]) {
      await page.setViewportSize({width,height:844});
      expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
    }
    // A different selection resets the image state and gives a readable broken-photo fallback.
    failPhoto = true;
    await page.getByRole("button",{name:"Clear selection",exact:true}).click();
    await page.locator(".cr-card").filter({hasText:details[0].description}).click();
    const failedPhotos = page.locator(".cr-evidence-photo");
    await expect(failedPhotos).toHaveCount(details[0].observations.filter(observation=>observation.photoUrl).length);
    for(const figure of await failedPhotos.all()) {
      await figure.scrollIntoViewIfNeeded();
      await expect(figure).toContainText("Photo could not be loaded.");
    }
    await expect(page.locator(".cr-evidence-photo img")).toHaveCount(0);
    expect(writes).toEqual([]);
  } finally {await db.close();}
});
