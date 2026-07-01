import { expect, test } from "@playwright/test";

test("root route shows the production front door", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "Coco English" })).toBeVisible();
  await expect(page.getByRole("link", { name: "I’m a student" })).toHaveAttribute("href", "/join");
  await expect(page.getByRole("link", { name: "I’m a teacher" })).toHaveAttribute("href", "/auth/login");
});
