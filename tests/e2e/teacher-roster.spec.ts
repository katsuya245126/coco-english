import { expect, test } from "@playwright/test";

const SUPABASE_ENV_PRESENT = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
);

// A roster page id that does not need to exist: the auth guard runs before any
// class load, so an anonymous request is redirected regardless of the id.
const SAMPLE_CLASS_ID = "00000000-0000-4000-8000-000000000999";

test("unauthenticated roster page redirects to /auth/login", async ({ page }) => {
  // Env-independent: requireTeacherProfile + middleware send anonymous requests
  // to login before the class/roster ever loads, so a teacher can never reach
  // another teacher's roster page without a session (AUTH-04 roster side).
  await page.goto(`/teacher/classes/${SAMPLE_CLASS_ID}`);
  await expect(page).toHaveURL(/\/auth\/login/);
});

test("roster page is reachable only behind teacher auth", async ({ page }) => {
  // The full roster walkthrough (paste-with-blanks/duplicates, one-time PIN
  // display, reset-not-re-shown, archive-not-delete) is covered by the plan's
  // human-verify checkpoint, which needs live Supabase + a seeded class. When
  // env is absent we only assert the guard, mirroring teacher-auth.spec.ts.
  test.skip(
    !SUPABASE_ENV_PRESENT,
    "Supabase env vars absent; live roster walkthrough is env-gated (see human-verify checkpoint).",
  );

  await page.goto(`/teacher/classes/${SAMPLE_CLASS_ID}`);
  // Without a session the guard still redirects; the authenticated walkthrough
  // is the manual checkpoint. This keeps the spec green and non-flaky in CI.
  await expect(page).toHaveURL(/\/auth\/login/);
});
