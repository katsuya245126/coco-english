import { expect, test } from "@playwright/test";
import { logInTeacher } from "./teacher-auth";

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

  test.skip(
    !process.env.E2E_TEACHER_EMAIL || !process.env.E2E_TEACHER_PASSWORD,
    "Logged-in teacher fixture not provisioned; live class-management path is env-gated.",
  );

  await logInTeacher(page);
  await page.goto("/teacher");
  await expect(page.getByRole("link", { name: /Create class/ })).toHaveAttribute(
    "href",
    "/teacher/classes",
  );
});
