import { test, expect, syntheticTile } from "./fixtures";

test("blocked tiles expose recovery while report markers and map controls remain usable", async ({ page }) => {
  let blocked = true;
  await page.route("https://tile.openstreetmap.org/**", route => route.fulfill(blocked
    ? { status: 403, contentType: "text/plain", body: "Synthetic tile-provider refusal" }
    : { status: 200, contentType: "image/png", body: syntheticTile }));
  await page.goto("/city");
  await page.getByRole("button", { name: "Use sample reports", exact: true }).click();
  await expect(page.getByText("Map background unavailable", { exact: true })).toBeVisible();
  await page.locator(".cr-card").first().click();
  await page.getByRole("button", { name: "Focus selected report", exact: true }).click();
  await expect(page.locator(".cr-map .map-pin.chosen")).toHaveCount(1);
  await expect(page.locator(".cr-evidence h3").first()).toContainText("SYNTHETIC DEMO");
  blocked = false;
  await page.getByRole("button", { name: "Retry map background", exact: true }).click();
  await expect(page.getByText("Map background unavailable", { exact: true })).toHaveCount(0);
  await expect.poll(() => page.locator(".cr-map img.leaflet-tile").evaluateAll(tiles =>
    tiles.some(tile => (tile as HTMLImageElement).naturalWidth > 0))).toBeTruthy();
});

test("tile requests send the app origin without exposing confirmation paths or query tokens", async ({ page }) => {
  const referers: string[] = [];
  await page.route("https://tile.openstreetmap.org/**", route => {
    referers.push(route.request().headers().referer ?? "");
    return route.fulfill({ status: 200, contentType: "image/png", body: syntheticTile });
  });
  // Synthetic query data mimics a sensitive entry link; no real token is used.
  await page.goto("/city?confirmation=synthetic-private-query");
  await expect.poll(() => referers.length).toBeGreaterThan(0);
  expect(referers.every(value => value === "http://localhost:5174/")).toBeTruthy();
  await expect(page.locator("img.leaflet-tile").first()).toHaveAttribute("referrerpolicy", "origin");
});

test("map recenters after a panel resize without requiring a browser-window resize", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/city");
  await page.getByRole("button", { name: "Use sample reports", exact: true }).click();
  await page.locator(".cr-card").first().click();
  await page.getByRole("button", { name: "Focus selected report", exact: true }).click();
  const map = page.locator(".cr-map .leaflet-container");
  const marker = page.locator(".cr-map .leaflet-marker-icon").filter({ has: page.locator(".map-pin.chosen") });
  const centerOffset = async () => {
    const [mapBox, markerBox] = await Promise.all([map.boundingBox(), marker.boundingBox()]);
    if (!mapBox || !markerBox) return Infinity;
    // Leaflet's marker anchor is (15,34), so its geographic point is the map center.
    return Math.abs(markerBox.x + 15 - (mapBox.x + mapBox.width / 2));
  };
  await expect.poll(centerOffset).toBeLessThan(2);
  await map.evaluate(element => { element.style.width = "280px"; });
  await expect.poll(async () => (await map.boundingBox())?.width).toBe(280);
  await expect.poll(centerOffset).toBeLessThan(2);
  await expect(page.getByRole("button", { name: "Fit filtered reports", exact: true })).toBeEnabled();
});
