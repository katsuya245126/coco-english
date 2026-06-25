import { expect, test } from "@playwright/test";

const SUPABASE_ENV_PRESENT = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
);

test("unauthenticated /teacher redirects to /auth/login", async ({ page }) => {
  // This assertion must hold regardless of Supabase env / dashboard config:
  // the middleware + requireTeacherProfile guard send anonymous requests to login.
  await page.goto("/teacher");
  await expect(page).toHaveURL(/\/auth\/login/);
});

test("teacher signup reaches the email-verification-pending state", async ({
  page,
}) => {
  // The live signup -> verification path depends on Supabase env being present.
  // When env is absent (e.g. CI without secrets) this branch is skipped, mirroring
  // tests/e2e/foundation-smoke.spec.ts.
  test.skip(
    !SUPABASE_ENV_PRESENT,
    "Supabase env vars absent; live signup verification path is env-gated.",
  );

  const unique = Date.now();
  await page.goto("/auth/signup");

  await page.getByLabel("Display name").fill(`Teacher ${unique}`);
  await page.getByLabel("Email").fill(`teacher+${unique}@example.com`);
  await page.getByLabel("Password", { exact: true }).fill("Sup3r-Secret-Pw!");

  await page
    .getByRole("button", { name: "Create teacher account" })
    .click();

  // Verbatim UI-SPEC email-verification-pending copy.
  await expect(
    page.getByText("Check your email to verify your teacher account."),
  ).toBeVisible();
});
