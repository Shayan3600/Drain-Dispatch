import { test, expect } from "./fixtures";

test("city fixture review stays read-only and highlights one incident marker on mobile", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  let mutations = 0;
  page.on("request", request => {
    if (new URL(request.url()).pathname.startsWith("/api/") && request.method() !== "GET") mutations++;
  });
  await page.goto("/city");
  await page.getByRole("button", { name: "Use sample reports", exact: true }).click();
  await expect(page.getByText("Synthetic development data — not live reports", { exact: true })).toBeVisible();
  await expect(page.locator(".cr-card")).toHaveCount(2);
  await page.locator(".cr-card").filter({ hasText: "leaves covering a drain grate" }).click();
  await expect(page.locator(".cr-evidence h3").first()).toContainText("SYNTHETIC DEMO");
  await expect(page.locator(".cr-observation")).toHaveCount(2);
  await expect(page.locator(".cr-map .leaflet-marker-icon")).toHaveCount(2);
  await expect(page.locator(".cr-map .map-pin.chosen")).toHaveCount(1);
  const packet = page.getByRole("textbox", { name: "Report packet preview" });
  await expect(packet).toHaveValue(/Observation submissions: 2 \(not unique people\)/);
  await expect(packet).toHaveValue(/Photo links: excluded by default/);
  await page.getByLabel("Include eligible public photo links").check();
  await expect(packet).toHaveValue(/Photo link omitted: embedded, credentialed or non-public link format/);
  expect(await packet.inputValue()).not.toContain("data:image");
  await page.getByLabel("Community status").selectOption("all");
  await expect(page.locator(".cr-card")).toHaveCount(3);
  await page.getByLabel("Multiple submissions").check();
  await expect(page.locator(".cr-card")).toHaveCount(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBeTruthy();
  expect(mutations).toBe(0);
});

test("city live review filters demos and does not call real test evidence synthetic", async ({ page }) => {
  const real = {
    id: "00000000-0000-4000-8000-000000000201", latitude: 35.9132, longitude: -79.0558,
    description: "Synthetic browser API fixture: ordinary report.", issueType: "standing_water",
    status: "pending_review", isDemo: false, observationCount: 1,
    createdAt: "2026-10-10T12:00:00Z", updatedAt: "2026-10-10T12:00:00Z",
  };
  const demo = { ...real, id: "00000000-0000-4000-8000-000000000202", isDemo: true,
    description: "Synthetic browser API fixture: approved test photograph report.",
    observations: [{ id: "00000000-0000-4000-8000-000000000203", source: "imessage",
      description: "Synthetic browser observation.", createdAt: real.createdAt,
      privateSenderIdentifier: "synthetic-private-field-not-for-export" }],
  };
  let mutations = 0;
  await page.route("**/api/**", async route => {
    const url = new URL(route.request().url());
    if (route.request().method() !== "GET") { mutations++; await route.fulfill({ status: 500, json: {} }); return; }
    const body = url.pathname === "/api/incidents" ? (url.searchParams.get("demo") === "false" ? [real] : [real, demo])
      : url.pathname === `/api/incidents/${demo.id}` ? demo
      : url.pathname.endsWith("/history") ? [] : real;
    await route.fulfill({ json: body });
  });
  await page.goto("/city/");
  await expect(page.locator(".cr-card")).toHaveCount(1);
  await expect(page.getByLabel("Include demo reports")).not.toBeChecked();
  await page.getByLabel("Include demo reports").check();
  await expect(page.locator(".cr-card")).toHaveCount(2);
  await page.locator(".cr-card").filter({ hasText: "approved test photograph report" }).click();
  await expect(page.locator(".cr-evidence h3").first()).toContainText("DEMO / TEST");
  await expect(page.locator(".cr-evidence")).not.toContainText("SYNTHETIC DEMO");
  const packet = page.getByRole("textbox", { name: "Report packet preview" });
  await expect(packet).toHaveValue(/DEMO \/ TEST REPORT — excluded from real community metrics/);
  expect(await packet.inputValue()).not.toContain("synthetic-private-field-not-for-export");
  expect(mutations).toBe(0);
});

test("city packet copy uses the visible preview and provides manual fallback", async ({ page }) => {
  await page.addInitScript(() => {
    const state = window as unknown as { copiedPacket?: string; rejectCopy?: boolean };
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: {
      async writeText(text: string) {
        if (state.rejectCopy) throw new Error("Synthetic clipboard failure");
        state.copiedPacket = text;
      },
    } });
  });
  await page.goto("/city");
  await page.getByRole("button", { name: "Use sample reports", exact: true }).click();
  await page.locator(".cr-card").first().click();
  const packet = page.getByRole("textbox", { name: "Report packet preview" });
  await expect(packet).toBeVisible();
  await page.getByRole("button", { name: "Copy report", exact: true }).click();
  await expect(page.getByText("Report copied. Nothing has been submitted to the Town.", { exact: true })).toBeVisible();
  expect(await page.evaluate(() => (window as unknown as { copiedPacket?: string }).copiedPacket)).toBe(await packet.inputValue());
  await page.evaluate(() => { (window as unknown as { rejectCopy?: boolean }).rejectCopy = true; });
  await page.getByRole("button", { name: "Copy report", exact: true }).click();
  await expect(page.getByText("Automatic copy is unavailable.", { exact: false })).toBeVisible();
  expect(await packet.evaluate(element => {
    const input = element as HTMLTextAreaElement;
    return input.selectionStart === 0 && input.selectionEnd === input.value.length && document.activeElement === input;
  })).toBeTruthy();
});
