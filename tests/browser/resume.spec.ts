import { test, expect } from "./fixtures";

test("confirmed RESUME shows the saved demo report without posting confirmation again", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const incident = {
    id: "00000000-0000-4000-8000-000000000010", latitude: 40.7128, longitude: -74.006,
    description: "Synthetic RESUME example: saved demo evidence.", issueType: "blocked_drain",
    status: "closed", isDemo: true, observationCount: 1,
    createdAt: "2026-10-10T12:00:00Z", updatedAt: "2026-10-10T12:00:00Z",
  };
  const token = "synthetic-confirmed-resume-token-for-browser-test";
  let confirmationPosts = 0;
  let releaseDraft: (() => void) | undefined;
  const draftReady = new Promise<void>(resolve => { releaseDraft = resolve; });
  await page.route("**/api/**", async route => {
    const path = new URL(route.request().url()).pathname;
    if (route.request().method() === "POST") {
      confirmationPosts++;
      await route.fulfill({ status: 500, json: { error: "Unexpected confirmation" } });
      return;
    }
    if (path === `/api/report-drafts/${token}`) {
      await draftReady;
      await route.fulfill({ json: { confirmedIncidentId: incident.id, description: incident.description, issueType: incident.issueType } });
      return;
    }
    const body = path === "/api/incidents" ? [incident] : path === `/api/incidents/${incident.id}` ? incident : path === "/api/stats" ? { totalIncidents: 0, activeIncidents: 0, closedIncidents: 0, observationCount: 0, demoIncidents: 1, byCategory: [], overTime: [], repeatedLocations: [] } : path === "/api/weather" ? { alerts: [] } : [];
    await route.fulfill({ json: body });
  });
  await page.goto(`/?draft=${token}`);
  // Keep unrelated filters while the saved draft lookup is pending, then verify reveal resets them.
  await page.getByLabel("Filter by issue type").selectOption("damaged_drain");
  await page.getByLabel("Search incident descriptions").fill("unrelated filter");
  await expect(page.getByLabel("Include labeled demo reports")).not.toBeChecked();
  await expect(page.getByLabel("Filter by incident status")).toHaveValue("active");
  releaseDraft?.();
  await expect(page.getByRole("heading", { name: "Your report is already on the map." })).toBeVisible();
  await expect(page.getByRole("button", { name: "Submit observation", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Back to the dashboard", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByLabel("Include labeled demo reports")).toBeChecked();
  await expect(page.getByLabel("Filter by incident status")).toHaveValue("all");
  await expect(page.getByLabel("Filter by issue type")).toHaveValue("all");
  await expect(page.getByLabel("Search incident descriptions")).toHaveValue("");
  await expect(page.locator(".incident-card")).toHaveCount(1);
  await expect(page.locator(".leaflet-marker-icon .chosen")).toHaveCount(1);
  await expect(page.locator(".demo-preview-notice")).toContainText("1 demo reports shown · 0 active · 1 closed");
  await expect(page.locator(".metric-card strong")).toHaveText(["0", "0", "0", "0"]);
  expect(await page.locator(".dashboard-map").evaluate(map => {
    const rect = map.getBoundingClientRect(), marker = map.querySelector(".leaflet-marker-icon")?.getBoundingClientRect();
    return !!marker && marker.left < rect.right && marker.right > rect.left && marker.top < rect.bottom && marker.bottom > rect.top;
  })).toBeTruthy();
  expect(confirmationPosts).toBe(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBeTruthy();
});
