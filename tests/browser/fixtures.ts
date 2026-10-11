import { test as base, expect } from "@playwright/test";
import { createHash } from "node:crypto";

// CI exercises map behavior with synthetic tiles. OSM forbids bots loading
// many viewports; real-service acceptance is a separate, limited human smoke test.
export const syntheticTile = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAADUlEQVQImWN4+e7pfwAJPAO8vOrxFwAAAABJRU5ErkJggg==", "base64");
export const test = base.extend<{ employeeDemoSession: boolean }>({
  // City behavior tests exercise the review tools after demo entry. Dedicated
  // entry/guard tests opt out so they must navigate through the visible UI.
  employeeDemoSession: [true, { option: true }],
  page: async ({ page, employeeDemoSession }, use, testInfo) => {
    // Each independent test represents a different synthetic client. Preserve
    // production limits while avoiding aggregate localhost traffic exhausting
    // one rate-limit bucket in the shared, temporary e2e API.
    const identity = createHash("sha256").update(testInfo.testId).digest();
    await page.setExtraHTTPHeaders({
      "x-forwarded-for": `10.${identity[0]}.${identity[1]}.${identity[2]}`,
    });
    if (employeeDemoSession) await page.addInitScript(() => {
      sessionStorage.setItem("clearflow-employee-demo", "true");
    });
    await page.route("https://tile.openstreetmap.org/**", route => route.fulfill({
      status: 200, contentType: "image/png", body: syntheticTile,
      headers: { "cache-control": "public, max-age=604800" },
    }));
    await use(page);
  },
});
export { expect };
