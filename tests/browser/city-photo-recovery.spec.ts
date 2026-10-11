import { test, expect } from "./fixtures";
import type { Page } from "@playwright/test";
import type { Incident } from "../../client/src/types";

const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="200"><rect width="400" height="200" fill="#a4d7c7"/><text x="20" y="100">Synthetic QA evidence</text></svg>';
const record: Incident = {
  id: "00000000-0000-4000-8000-000000000701", latitude: 35.9132, longitude: -79.0558,
  description: "Synthetic photo recovery report", issueType: "blocked_drain", status: "pending_review",
  isDemo: true, observationCount: 1, hasPhoto: true, createdAt: "2026-10-11T12:00:00Z", updatedAt: "2026-10-11T12:00:00Z",
  observations: [{id:"synthetic-photo-observation",source:"imessage",description:"Synthetic submitted photo",createdAt:"2026-10-11T12:00:00Z",photoUrl:"/uploads/synthetic-recovery.svg"}],
};
async function mockReports(page: Page, records: Incident[]) {
  await page.route("**/api/**", route => {
    const pathname = new URL(route.request().url()).pathname;
    return route.fulfill({json:pathname === "/api/incidents" ? records : pathname.endsWith("/history") ? [] : records.find(item => pathname.endsWith(item.id))});
  });
}

test("the same failed evidence URL can be retried without reloading the report or writing data", async ({page}) => {
  let imageReads = 0;
  let writes = 0;
  const paths: string[] = [];
  page.on("request", request => {if(new URL(request.url()).pathname.startsWith("/api/") && request.method() !== "GET") writes++;});
  await mockReports(page, [record]);
  await page.route("**/uploads/**", route => {
    paths.push(new URL(route.request().url()).pathname);
    return ++imageReads === 1 ? route.fulfill({status:503}) : route.fulfill({contentType:"image/svg+xml",body:svg});
  });
  await page.goto("/employee");
  await page.locator(".cr-card").click();
  const figure = page.locator(".cr-evidence-photo");
  await figure.scrollIntoViewIfNeeded();
  await expect(figure).toContainText("Photo could not be loaded.");
  await figure.getByRole("button", {name:"Retry photo",exact:true}).click();
  const image = figure.locator("img");
  await expect.poll(() => image.evaluate(element => (element as HTMLImageElement).naturalWidth)).toBe(400);
  await expect(figure.getByRole("button", {name:"Retry photo",exact:true})).toHaveCount(0);
  await expect(image).toHaveAttribute("alt", "Submitted drainage observation");
  expect(paths).toEqual(["/uploads/synthetic-recovery.svg", "/uploads/synthetic-recovery.svg"]);
  expect(writes).toBe(0);
});

test("illustrative demo labels depend on photo source and full-size links do not expose the opener", async ({page,context}) => {
  const mixed = structuredClone(record);
  mixed.observations!.push({...mixed.observations![0],id:"synthetic-reference-observation",source:"demo",description:"Synthetic illustrative reference",photoUrl:"/uploads/synthetic-reference.svg"});
  mixed.observationCount = 2;
  await mockReports(page, [mixed]);
  await context.route("**/uploads/**", route => route.fulfill({contentType:"image/svg+xml",body:svg}));
  await page.goto("/employee");
  await page.locator(".cr-card").click();
  const figures = page.locator(".cr-evidence-photo");
  await expect(figures).toHaveCount(2);
  await expect(figures.first()).not.toContainText("Illustrative demo image");
  await expect(figures.first()).toContainText("Photo submitted with a labeled demo report.");
  await expect(figures.first().locator("img")).toHaveAttribute("alt","Submitted drainage observation");
  await expect(figures.last()).toContainText("Illustrative demo image · location and capture date unverified.");
  await expect(figures.last().locator("img")).toHaveAttribute("alt","Drainage reference image for an illustrative demo scenario");
  const fullSize = figures.first().getByRole("link",{name:"Open full-size evidence image",exact:true});
  await expect(fullSize).toHaveAttribute("rel",/noreferrer/);
  await expect(fullSize).toHaveAttribute("target","_blank");
  const [photoPage] = await Promise.all([context.waitForEvent("page"),fullSize.click()]);
  await photoPage.waitForLoadState();
  expect(await photoPage.evaluate(() => window.opener === null)).toBe(true);
  expect(await photoPage.evaluate(() => document.referrer)).toBe("");
  await photoPage.close();
});

test("unsafe photo schemes and credential-bearing URLs are neither rendered nor requested", async ({page}) => {
  const unsafe = structuredClone(record);
  // These are clearly fictional values used only to exercise URL validation.
  const urls = ["javascript:alert('synthetic')", "data:image/svg+xml,<svg/>", "https://synthetic-user:synthetic-password@example.invalid/qa.svg"];
  unsafe.observations = urls.map((photoUrl,index) => ({...record.observations![0],id:`synthetic-invalid-${index}`,photoUrl}));
  let unexpectedPhotos = 0;
  await mockReports(page,[unsafe]);
  await page.route("https://example.invalid/**", route => {unexpectedPhotos++;return route.abort();});
  await page.goto("/employee");
  await page.locator(".cr-card").click();
  await expect(page.getByText("No displayable photo attached.", {exact:true})).toHaveCount(3);
  await expect(page.locator(".cr-evidence-photo")).toHaveCount(0);
  expect(unexpectedPhotos).toBe(0);
});

test("switching reports removes the old photo while the next report evidence is pending", async ({page}) => {
  const second: Incident = {...record,id:"00000000-0000-4000-8000-000000000702",description:"Synthetic report without attached photo",hasPhoto:false,observations:[]};
  let releaseDetail:(()=>Promise<void>)|undefined;
  await mockReports(page,[record,second]);
  await page.route(`**/api/incidents/${second.id}`,route=>{releaseDetail=()=>route.fulfill({json:second});});
  await page.route("**/uploads/**",route=>route.fulfill({contentType:"image/svg+xml",body:svg}));
  await page.goto("/employee");
  await page.locator(".cr-card").filter({hasText:record.description}).click();
  await expect(page.locator(".cr-evidence-photo")).toHaveCount(1);
  await page.locator(".cr-card").filter({hasText:second.description}).click();
  try {
    await expect.poll(()=>Boolean(releaseDetail)).toBe(true);
    await expect(page.locator(".cr-reference")).toContainText(second.id);
    await expect(page.locator(".cr-evidence-photo")).toHaveCount(0);
    await expect(page.getByText("Loading evidence…",{exact:true})).toBeVisible();
  } finally {await releaseDetail?.();}
  await expect(page.getByText("No observation evidence available.",{exact:true})).toBeVisible();
  await expect(page.locator(".cr-evidence-photo")).toHaveCount(0);
});
