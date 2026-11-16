import { expect, test } from "@playwright/test";

test("public showcase supports timeline cutoff and evidence inspection", async ({ page }) => {
  await page.goto("./");
  await expect(page.getByRole("heading", { name: "Evidence before certainty." })).toBeVisible();
  await page.getByLabel("Historical knowledge cutoff").selectOption({ index: 1 });
  await expect(page.getByText(/Decision-time snapshot/)).toBeVisible();
  await page.getByRole("tab", { name: "evd-002" }).click();
  await expect(page.getByRole("heading", { name: "Evidence inspection" })).toBeVisible();
  await expect(page.getByText(/Batch delay caused alert lateness/)).toBeVisible();
});

test("public showcase recomputes an evidence challenge and a deterministic scenario", async ({ page }) => {
  await page.goto("./");
  await page.getByRole("tab", { name: "evd-001" }).click();
  await page.getByLabel("Evidence status action").selectOption("withdraw");
  await page.getByLabel("Evidence challenge reason").fill("Independent corroboration is unavailable for this showcase challenge.");
  await page.getByRole("button", { name: "Record change & recompute" }).click();
  await expect(page.locator(".change-result")).toContainText("evd-001 is now withdrawn");
  await page.getByLabel("Simulation seed").fill("17");
  await page.getByLabel("Simulation sensitivity").fill("900");
  await page.getByRole("button", { name: "Run deterministic comparison" }).click();
  await expect(page.getByText(/Seed 17/)).toBeVisible();
  await expect(page.getByText(/ILLUSTRATIVE ONLY/)).toBeVisible();
});

test("public showcase exposes graph guardrails and responsive layout", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("./");
  await expect(page.getByRole("heading", { name: "Graph inspection" })).toBeVisible();
  await page.getByRole("button", { name: /increased alert load/ }).click();
  await expect(page.locator(".warning-box")).toContainText("cannot establish causation");
  await expect(page.getByRole("button", { name: "Run deterministic comparison" })).toBeVisible();
  await expect(page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).resolves.toBe(true);
  await page.keyboard.press("Tab");
  await expect(page.locator(":focus")).toBeVisible();
});

test("public showcase supports hash deep links on the Pages base path", async ({ page }) => {
  await page.goto("./#simulation-heading");
  await expect(page.getByRole("heading", { name: "Counterfactual sandbox" })).toBeVisible();
});
