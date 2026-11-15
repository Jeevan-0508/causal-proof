import { expect, test } from "@playwright/test";

test("investigator can challenge evidence and see recalculation", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /Evidence intelligence/ }).click();
  await page.getByRole("button", { name: /Three accounts reused one beneficiary/ }).click();
  await page.getByLabel("Challenge authenticity or interpretation").fill("The beneficiary identity needs independent verification.");
  await page.getByRole("button", { name: "Record challenge" }).click();
  await expect(page.getByText(/RECOMPUTED CONCLUSIONS/)).toBeVisible();
  await expect(page.getByText(/challenged/).first()).toBeVisible();
  await page.getByRole("button", { name: /Causal hypotheses/ }).click();
  await expect(page.getByText("UNIDENTIFIABLE").first()).toBeVisible();
});

test("investigator can run a reproducible counterfactual comparison", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /Counterfactual lab/ }).click();
  await page.getByRole("button", { name: /Run deterministic simulation/ }).click();
  await expect(page.getByText("SIMULATION COMPARISON")).toBeVisible();
  await expect(page.getByText("SIMULATED", { exact: true })).toBeVisible();
  await expect(page.getByText(/MODEL BOUNDARIES/)).toBeVisible();
});

test("investigator can replay a decision without hindsight evidence", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /Decision replay/ }).click();
  await expect(page.getByText("HISTORICAL KNOWLEDGE BOUNDARY")).toBeVisible();
  await expect(page.getByText(/EXCLUDED AS HINDSIGHT/)).toBeVisible();
  await page.getByRole("button", { name: /Run scenario/ }).first().click();
  await expect(page.getByText("SIMULATED", { exact: true }).first()).toBeVisible();
  await expect(page.getByText(/INVESTIGATION BRANCHES/)).toBeVisible();
});
