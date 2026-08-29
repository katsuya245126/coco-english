import { expect, test } from "@playwright/test";

test("unauthenticated /teacher redirects to /auth/login", async ({ page }) => {
  // This assertion must hold regardless of Supabase env / dashboard config:
  // the middleware + requireTeacherProfile guard send anonymous requests to login.
  await page.goto("/teacher");
  await expect(page).toHaveURL(/\/auth\/login/);
});
