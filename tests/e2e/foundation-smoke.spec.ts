import { expect, test } from "@playwright/test";

test("creates a foundation smoke record from the internal UI", async ({ page }) => {
  await page.goto("/");

  await page.getByRole("button", { name: "Create foundation smoke record" }).click();

  if (process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
    await expect(page.getByText(/Foundation Demo/)).toBeVisible();
    await expect(page.getByText(/Foundation Smoke/)).toBeVisible();
    await expect(page.getByText(/assigned/)).toBeVisible();
    await expect(page.getByText("data-mode: demo")).toBeVisible();
    return;
  }

  await expect(page.getByText(/Internal setup state/)).toBeVisible();
});
