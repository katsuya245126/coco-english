import { expect, test } from "@playwright/test";

const SUPABASE_ENV_PRESENT = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
);

test("class-management dashboard exposes the create-class entry point", async ({
  page,
}) => {
  // Env-aware, mirroring tests/e2e/foundation-smoke.spec.ts and
  // teacher-auth.spec.ts. When Supabase env is absent (e.g. CI without secrets)
  // the protected /teacher route still redirects anonymous requests to login,
  // so we assert the create-class affordance against the login-gated route only.
  if (!SUPABASE_ENV_PRESENT) {
    await page.goto("/teacher");
    await expect(page).toHaveURL(/\/auth\/login/);
    return;
  }

  // Live path requires a logged-in teacher session (provisioned by the human-verify
  // walkthrough / future auth fixture). This branch documents the full flow using
  // verbatim UI-SPEC copy as selectors.
  test.skip(
    !process.env.E2E_TEACHER_EMAIL || !process.env.E2E_TEACHER_PASSWORD,
    "Logged-in teacher fixture not provisioned; live class-management path is env-gated.",
  );

  await page.goto("/teacher");

  // Create a class via the dashboard "Create class" action + "Save class" form.
  await page.getByRole("button", { name: "Create class" }).click();
  const className = `Playwright Class ${Date.now()}`;
  await page.getByLabel("Class name").fill(className);
  await page.getByRole("button", { name: "Save class" }).click();

  // The new class appears in the list with a join code.
  await expect(page.getByText(className)).toBeVisible();

  // Open the share dialog and confirm the share/QR affordances (verbatim copy).
  await page.getByRole("button", { name: "Share join link" }).first().click();
  await expect(page.getByRole("button", { name: "Show QR code" })).toBeVisible();

  // Reach the reset-join-code confirmation (verbatim D-18 copy).
  await page.getByRole("button", { name: "Reset join code" }).click();
  await expect(
    page.getByText(
      "Reset join code? New students will need the new code or link. Remembered devices can still return to this class.",
    ),
  ).toBeVisible();
});
