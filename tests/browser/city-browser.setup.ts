import { test } from "./fixtures";

// Shared by the city-only tests. App assets still come from the normal Vite
// server. Public map tiles are never requested by headless test automation.
export function setupCityBrowser() {
  test.beforeEach(async ({page})=>{
    await page.route("**/api/**",route=>route.fulfill({status:503,json:{error:{message:"Test API unavailable"}}}));
    await page.route("**/tile.openstreetmap.org/**",route=>route.abort());
  });
}
