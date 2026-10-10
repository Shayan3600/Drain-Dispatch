import { test, expect } from "@playwright/test";
import sharp from "sharp";
test("browser creates a report, reloads it, and adds follow-up evidence", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Community drainage map" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Share an observation", exact: true })
    .click();
  await page
    .getByLabel("Describe what you noticed")
    .fill("Browser test: leaf cover visible across a curb drain grate.");
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByLabel("Latitude", { exact: true }).fill("35.9132");
  await page.getByLabel("Longitude", { exact: true }).fill("-79.0558");
  await page
    .getByLabel("I confirm the pin marks the physical location I observed.")
    .check();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page
    .getByRole("button", { name: "Submit observation", exact: true })
    .click();
  await expect(
    page.getByText("A clearer picture, thanks to you."),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Back to the dashboard", exact: true })
    .click();
  await page.reload();
  const card = page
    .getByRole("button")
    .filter({ hasText: "Browser test: leaf cover visible" });
  await expect(card).toBeVisible();
  await card.click();
  await expect(
    page.getByRole("heading", { name: "Community evidence" }),
  ).toBeVisible();
  await page
    .getByLabel("Your observation", { exact: true })
    .fill("Browser follow-up: the same visible leaf cover remains today.");
  await page
    .getByLabel("This observation concerns the same physical location.")
    .check();
  await page
    .getByRole("button", { name: "Add observation", exact: true })
    .click();
  await expect(page.getByText("Your observation was saved.")).toBeVisible();
  await expect(page.getByText("2 observations", { exact: true })).toBeVisible();
});
test("mobile dashboard fits viewport and opens accessible report dialog", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Community drainage map" }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBeTruthy();
  await page
    .getByRole("button", { name: "Share an observation", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Continue", exact: true }),
  ).toBeDisabled();
  await page.screenshot({
    path: "docs/screenshots/mobile-report.png",
    fullPage: true,
  });
});
test("nearby duplicate choice adds an observation to the same incident", async ({
  page,
  request,
}) => {
  const before = await (
    await request.get("http://localhost:3002/api/stats")
  ).json();
  await page.goto("/");
  await page
    .getByRole("button", { name: "Share an observation", exact: true })
    .click();
  await page
    .getByLabel("Describe what you noticed")
    .fill(
      "Browser duplicate: a second observer sees the same leaf-covered grate.",
    );
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByLabel("Latitude", { exact: true }).fill("35.91321");
  await page.getByLabel("Longitude", { exact: true }).fill("-79.0558");
  await expect(
    page.getByText("Could this be the same location?"),
  ).toBeVisible();
  await page.locator('input[name="duplicate"]').first().check();
  await page
    .getByLabel("I confirm the pin marks the physical location I observed.")
    .check();
  await expect(
    page.getByRole("button", { name: "Continue", exact: true }),
  ).toBeDisabled();
  await page
    .getByLabel(
      "I confirm this existing report concerns the same physical location.",
    )
    .check();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page
    .getByRole("button", { name: "Submit observation", exact: true })
    .click();
  await expect(
    page.getByText("A clearer picture, thanks to you."),
  ).toBeVisible();
  const after = await (
    await request.get("http://localhost:3002/api/stats")
  ).json();
  expect(after.totalIncidents).toBe(before.totalIncidents);
  expect(after.observationCount).toBe(before.observationCount + 1);
});
test("simulated message draft confirms in the browser and replay does not duplicate it", async ({
  page,
  request,
}) => {
  const provider = await request.post(
    "http://localhost:3002/api/worker/messages",
    {
      headers: { Authorization: "Bearer isolated-browser-test-worker-secret" },
      data: {
        id: "browser-message-event",
        senderId: "private-test-sender",
        text: "REPORT Browser messaging test: water visibly pools beside a walkway.",
      },
    },
  );
  expect(provider.ok()).toBeTruthy();
  const { responseText } = await provider.json();
  const token = responseText.match(/\/confirm\/([a-z0-9_-]+)/i)[1];
  await page.goto(`/confirm/${token}`);
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByLabel("Latitude", { exact: true }).fill("35.918");
  await page.getByLabel("Longitude", { exact: true }).fill("-79.06");
  await page
    .getByLabel("I confirm the pin marks the physical location I observed.")
    .check();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page
    .getByRole("button", { name: "Submit observation", exact: true })
    .click();
  await expect(
    page.getByText("A clearer picture, thanks to you."),
  ).toBeVisible();
  const incidents = await (
    await request.get("http://localhost:3002/api/incidents")
  ).json();
  expect(
    incidents.filter((i: { description: string }) =>
      i.description.includes("Browser messaging test"),
    ),
  ).toHaveLength(1);
  const replay = await request.post(
    "http://localhost:3002/api/worker/messages",
    {
      headers: { Authorization: "Bearer isolated-browser-test-worker-secret" },
      data: {
        id: "browser-message-event",
        senderId: "private-test-sender",
        text: "REPORT Browser messaging test: water visibly pools beside a walkway.",
      },
    },
  );
  expect((await replay.json()).responseText).toBe(responseText);
});
test("uploaded photo persists and mocked AI suggestions can be corrected before submission", async ({
  page,
  request,
}) => {
  const photo = await sharp({
    create: { width: 30, height: 30, channels: 3, background: "#2b8476" },
  })
    .png()
    .toBuffer();
  await page.route("**/api/analyze", (route) =>
    route.fulfill({
      json: {
        drainVisible: false,
        suggestedCategory: "other",
        visibleEvidence: "Mock AI evidence for an unrelated test image.",
        humanReviewRecommended: true,
        uncertainty: "high",
      },
    }),
  );
  await page.goto("/");
  await page
    .getByRole("button", { name: "Share an observation", exact: true })
    .click();
  await page
    .locator("input[type=file]")
    .setInputFiles({ name: "test.png", mimeType: "image/png", buffer: photo });
  await page
    .getByRole("button", { name: "Review photo with Gemini", exact: true })
    .click();
  await expect(page.getByLabel("Describe what you noticed")).toHaveValue(
    "Mock AI evidence for an unrelated test image.",
  );
  await page
    .getByLabel("Describe what you noticed")
    .fill("Browser corrected observation: visible standing water only.");
  await page.getByLabel("Type of concern").selectOption("standing_water");
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByLabel("Latitude", { exact: true }).fill("35.92");
  await page.getByLabel("Longitude", { exact: true }).fill("-79.065");
  await page
    .getByLabel("I confirm the pin marks the physical location I observed.")
    .check();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page
    .getByRole("button", { name: "Submit observation", exact: true })
    .click();
  await expect(
    page.getByText("A clearer picture, thanks to you."),
  ).toBeVisible();
  const incidents = await (
    await request.get("http://localhost:3002/api/incidents")
  ).json();
  const incident = incidents.find((i: { description: string }) =>
    i.description.startsWith("Browser corrected"),
  );
  expect(incident.issueType).toBe("standing_water");
  const detail = await (
    await request.get(`http://localhost:3002/api/incidents/${incident.id}`)
  ).json();
  expect(detail.observations[0].photoUrl).toContain("/uploads/");
  const persistedPhoto = await request.get(detail.observations[0].photoUrl);
  expect(persistedPhoto.ok()).toBeTruthy();
  expect(persistedPhoto.headers()["content-type"]).toContain("image/jpeg");
});
