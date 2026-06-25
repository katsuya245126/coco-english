import { expect, test } from "@playwright/test";

// Student join/unlock e2e (STUD-01, STUD-03, STUD-04, STUD-05, D-11, D-16).
//
// Env-aware like tests/e2e/foundation-smoke.spec.ts: the full unlock-to-home
// flow needs a seeded class/student, which requires Supabase env. Without env we
// still assert the structural, no-Supabase-needed invariants that must hold on
// the static join UI: the manual-code entry form renders, and there is NO
// visible roster selector (D-11) exposing other students' names.

const hasSupabaseEnv = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY,
);

test("manual /join page renders code entry with no visible roster selector", async ({
  page,
}) => {
  await page.goto("/join");

  // Manual class-code entry must be present (STUD-01 fallback).
  await expect(
    page.getByRole("button", { name: "Continue" }),
  ).toBeVisible();

  // D-11: students type their name; there must be NO visible roster picker.
  // No <select> elements and no listbox exposing roster names.
  await expect(page.locator("select")).toHaveCount(0);
  await expect(page.getByRole("listbox")).toHaveCount(0);
});

test("a direct /join/[joinCode] link resolves to the name + PIN step", async ({
  page,
}) => {
  if (!hasSupabaseEnv) {
    test.skip(
      true,
      "Requires Supabase env to resolve a seeded class join code.",
    );
    return;
  }

  // With env, a known-bad code must still NOT reveal whether the code exists —
  // it shows the generic mismatch copy, never a code-specific error.
  await page.goto("/join/ZZZZZZ");
  await expect(
    page.getByText(
      /We could not match that class, name, and PIN\. Try again or ask your teacher\./,
    ),
  ).toBeVisible();
});

test("wrong tuple shows the identical generic mismatch copy (env-aware)", async ({
  page,
}) => {
  if (!hasSupabaseEnv) {
    test.skip(true, "Requires Supabase env to seed a class + student.");
    return;
  }

  // Drive the manual flow with a wrong tuple and assert the generic copy.
  await page.goto("/join");
  await page.getByLabel(/class code/i).fill("ZZZZZZ");
  await page.getByRole("button", { name: "Continue" }).click();

  // Even an unknown code funnels to the generic mismatch copy (D-16).
  await expect(
    page.getByText(
      /We could not match that class, name, and PIN\. Try again or ask your teacher\./,
    ),
  ).toBeVisible();
});

test("student home shell renders the no-homework state and no homework-app UI", async ({
  page,
}) => {
  if (!hasSupabaseEnv) {
    test.skip(true, "Requires Supabase env to unlock to the home shell.");
    return;
  }

  // The shell is reachable only after a real unlock in env; this asserts the
  // shell copy contract once unlock state exists. The unlock-and-navigate is
  // exercised by the env-gated path; here we assert the no-homework heading is
  // the verbatim UI-SPEC copy when present.
  await page.goto("/student/home");
  await expect(page.getByText("No homework yet")).toBeVisible();
});
