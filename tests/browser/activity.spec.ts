import { test, expect } from "@playwright/test";

test.use({ viewport: { width: 390, height: 844 }, timezoneId: "America/Los_Angeles" });

test("activity uses exact UTC buckets and remains compatible with older stats responses", async ({ page }) => {
  const stats = {
    totalIncidents: 2, activeIncidents: 2, closedIncidents: 0, observationCount: 9,
    byCategory: [], overTime: [], repeatedLocations: [],
    activityPeriod: { bucket: "day", timeZone: "UTC", days: 30, includesCurrentDay: true, startDate: "2026-09-11T00:00:00Z", endDate: "2026-10-10T00:00:00Z" },
    activityOverTime: [
      { date: "2026-10-01T00:00:00Z", incidents: 1, observations: 5, statusChanges: 0 },
      { date: "2026-10-05T00:00:00Z", incidents: 1, observations: 3, statusChanges: 1 },
      { date: "2026-10-10T00:00:00Z", incidents: 0, observations: 1, statusChanges: 2 },
    ],
  };
  let legacy = false;
  await page.route("**/api/**", route => {
    const path = new URL(route.request().url()).pathname;
    const { activityPeriod: _period, activityOverTime: _activity, ...oldStats } = stats;
    const body = path === "/api/stats" ? (legacy ? oldStats : stats) : path === "/api/weather" ? { alerts: [] } : [];
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
  });
  await page.goto("/");
  const card = page.locator(".activity-card");
  await expect(card.locator(".activity-totals strong")).toHaveText(["9", "3"]);
  await expect(card.locator(".activity-day > small")).toHaveText(["Oct 4", "Oct 5", "Oct 6", "Oct 7", "Oct 8", "Oct 9", "Oct 10"]);
  await expect(card.locator(".activity-series > span")).toHaveText(["0", "0", "3", "1", "0", "0", "0", "0", "0", "0", "0", "0", "1", "2"]);
  expect(await card.locator(".activity-day").first().locator(".activity-series i").first().evaluate(element => element.getBoundingClientRect().height)).toBe(0);
  await card.getByText("View daily activity counts", { exact: true }).click();
  await expect(card.locator("tbody tr")).toHaveCount(30);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBeTruthy();
  legacy = true;
  await page.reload();
  await expect(page.getByText("The activity trend is unavailable right now.", { exact: true })).toBeVisible();
  await expect(card.locator(".activity-totals strong")).toHaveText(["—", "—"]);
});
