import { test, expect } from "./fixtures";

test("Clearflow preview keeps supplied identity and routes into the working community tools", async ({ page, request }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await expect(page).toHaveTitle("Clearflow — Community stormwater reporting");
  const header = page.locator("header").first();
  const brand = header.getByRole("link", { name: "Clearflow home", exact: true });
  await expect(brand).toBeVisible();
  const logo = brand.locator("img.brand-logo");
  await expect(logo).toHaveAttribute("src", "/clearflow/assets/drop-logo.png");
  await expect.poll(() => logo.evaluate(image => (image as HTMLImageElement).complete && (image as HTMLImageElement).naturalWidth > 0)).toBeTruthy();
  const favicon = await page.locator('link[rel="icon"]').getAttribute("href");
  expect(favicon).toBe("/clearflow/assets/drop-logo.png");
  expect((await request.get(favicon!)).ok()).toBeTruthy();
  const navigation = page.getByRole("navigation", { name: "Main navigation" });
  await expect(navigation.getByRole("link", { name: "Live map", exact: true })).toHaveAttribute("href", "#dashboard");
  await expect(navigation.getByRole("link", { name: "City review", exact: true })).toHaveAttribute("href", "/city");
  await navigation.getByRole("link", { name: "Live map", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Community drainage map" })).toBeInViewport();
  await header.getByRole("button", { name: "Report a blockage", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog.getByLabel("Describe what you noticed")).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Continue", exact: true })).toBeDisabled();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await navigation.getByRole("link", { name: "City review", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Drain reports.", exact: true })).toBeVisible();
  await expect(page.locator(".cr-brand")).toContainText("Clearflow");
});

test("performance preference persists while report access stays usable on mobile", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  const opener = page.getByRole("button", { name: "Open performance settings", exact: true });
  await opener.click();
  const panel = page.getByRole("region", { name: "Performance settings", exact: true });
  await expect(panel).toBeVisible();
  await expect(opener).toHaveAttribute("aria-expanded", "true");
  const mode = page.getByRole("switch", { name: "Performance mode", exact: true });
  await mode.check();
  await expect(page.locator("body")).toHaveClass(/clearflow-performance/);
  expect(await page.evaluate(() => localStorage.getItem("clearflow-performance"))).toBe("true");
  await page.keyboard.press("Escape");
  await expect(panel).not.toBeVisible();
  await expect(opener).toBeFocused();
  await page.reload();
  await expect(page.locator("body")).toHaveClass(/clearflow-performance/);
  await expect(page).toHaveTitle("Clearflow — Community stormwater reporting");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBeTruthy();
  await page.getByRole("button", { name: "Share an observation", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog.getByLabel("Describe what you noticed")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBeTruthy();
});

test("saved message confirmation returns to a clean dashboard URL without another submission", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  const token = "synthetic-preview-confirmed-draft";
  const incident = {
    id: "00000000-0000-4000-8000-000000000401", latitude: 35.9132, longitude: -79.0558,
    description: "Synthetic Clearflow preview: saved storm-drain observation.", issueType: "blocked_drain",
    status: "pending_review", isDemo: true, observationCount: 1,
    createdAt: "2026-10-10T12:00:00Z", updatedAt: "2026-10-10T12:00:00Z",
  };
  let mutations = 0;
  await page.route("**/api/**", async route => {
    if (route.request().method() !== "GET") {
      mutations++;
      await route.fulfill({ status: 500, json: { error: "Unexpected preview mutation" } });
      return;
    }
    const path = new URL(route.request().url()).pathname;
    const body = path === `/api/report-drafts/${token}`
      ? { confirmedIncidentId: incident.id, description: incident.description, issueType: incident.issueType }
      : path === "/api/incidents" ? [incident]
      : path === `/api/incidents/${incident.id}` ? incident
      : path === "/api/stats" ? { totalIncidents: 0, activeIncidents: 0, closedIncidents: 0, observationCount: 0,
        demoIncidents: 1, byCategory: [], overTime: [], repeatedLocations: [] }
      : path === "/api/weather" ? { alerts: [] } : [];
    await route.fulfill({ json: body });
  });
  await page.goto(`/confirm/${token}`);
  await expect(page.getByRole("heading", { name: "Your report is already on the map." })).toBeVisible();
  await expect(page.getByRole("button", { name: "Submit observation", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Back to the dashboard", exact: true }).click();
  await expect(page).toHaveURL(new URL("/", page.url()).href);
  await expect(page).toHaveTitle("Clearflow — Community stormwater reporting");
  await expect(page.getByLabel("Include labeled demo reports")).toBeChecked();
  await expect(page.locator(".incident-card")).toHaveCount(1);
  await expect(page.locator(".leaflet-marker-icon .chosen")).toHaveCount(1);
  expect(mutations).toBe(0);
});
