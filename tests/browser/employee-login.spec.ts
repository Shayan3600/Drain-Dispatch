import { test, expect } from "./fixtures";

test.use({ employeeDemoSession: false });

test("community entry clearly explains demo access and opens the separate employee workspace", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  const protectedRequests: string[] = [];
  let loginApiCalls = 0;
  page.on("request", request => {
    const url = new URL(request.url());
    if (/\/api\/(?:worker|moderator|admin|auth|login)(?:\/|$)/.test(url.pathname)) protectedRequests.push(url.pathname);
    if (new URL(page.url()).pathname === "/employee/login" && url.pathname.startsWith("/api/")) loginApiCalls++;
  });
  await page.goto("/");
  // The footer exposes the entry even while the mobile navigation is collapsed.
  const link = page.getByRole("link", { name: "Employee login", exact: true }).last();
  await expect(link).toHaveAttribute("href", "/employee/login");
  await link.click();
  await expect(page).toHaveURL(/\/employee\/login$/);
  await expect(page.getByRole("heading", { name: "Review reports.", exact: true })).toBeVisible();
  await expect(page.getByText("Demo access only", { exact: true })).toBeVisible();
  await expect(page.getByText("Demonstration only. No government account or admin access.", { exact: true })).toBeVisible();
  await expect(page.locator('input[type="password"], input[type="email"]')).toHaveCount(0);
  await expect(page.getByRole("button")).toHaveCount(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBeTruthy();
  await page.getByRole("button", { name: "Continue to demo", exact: true }).click();
  await expect(page).toHaveURL(/\/employee$/);
  await expect(page.getByRole("heading", { name: "Drain reports.", exact: true })).toBeVisible();
  expect(await page.evaluate(() => sessionStorage.getItem("clearflow-employee-demo"))).toBe("true");
  expect(loginApiCalls).toBe(0);
  expect(protectedRequests).toHaveLength(0);
});

test("direct employee entry is guarded and sign out clears only the demonstration preference", async ({ page, request }) => {
  await page.goto("/employee");
  await expect(page).toHaveURL(/\/employee\/login$/);
  await page.getByRole("button", { name: "Continue to demo", exact: true }).click();
  await expect(page).toHaveURL(/\/employee$/);
  await page.reload();
  await expect(page.getByRole("heading", { name: "Drain reports.", exact: true })).toBeVisible();
  // A presentation preference does not replace the server's protected authorization.
  expect((await request.get("http://localhost:3002/api/worker/followups")).status()).toBe(401);
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page).toHaveURL(/\/employee\/login$/);
  expect(await page.evaluate(() => sessionStorage.getItem("clearflow-employee-demo"))).toBeNull();
  await page.goto("/city");
  await expect(page).toHaveURL(/\/employee\/login$/);
});
