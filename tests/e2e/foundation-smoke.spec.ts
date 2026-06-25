import { expect, test } from "@playwright/test";

test("creates a foundation smoke record from the internal UI", async ({ page }) => {
  await page.goto("/");

  await page.getByRole("button", { name: "Create foundation smoke record" }).click();

  await expect(page.getByText(/Foundation Demo/)).toBeVisible();
  await expect(page.getByText(/Foundation Smoke/)).toBeVisible();
  await expect(page.getByText(/assigned/)).toBeVisible();
  await expect(page.getByText("data-mode: demo")).toBeVisible();
});
