/**
 * Student mission flow e2e tests (FLOW-04, PILOT-01).
 *
 * Wave 0 RED scaffold — these tests are marked with test.fixme()
 * until the mission flow UI is built (plan 04/05). Goes GREEN
 * in plan 05 when the full per-turn UI exists.
 *
 * Follows the student-join.spec.ts env-aware pattern.
 */

import { expect, test } from "@playwright/test";

const hasSupabaseEnv = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY,
);

test.fixme(
  "full per-turn walk: answer -> improved sentence shown -> required repeat (FLOW-04)",
  async ({ page }) => {
    if (!hasSupabaseEnv) {
      test.skip(true, "Requires Supabase env with seeded assignment data.");
      return;
    }

    // Scaffold: navigate to a seeded mission flow, complete one turn cycle
    // 1. Submit a non-empty answer
    // 2. Verify improved target-form sentence is displayed
    // 3. Submit the required repeat
    // 4. Verify turn transition or completion
    await page.goto("/student/home");
    await expect(page.getByText("Your homework")).toBeVisible();
  },
);

test.fixme(
  "mobile viewport shows mission flow within 420px max-width (PILOT-01)",
  async ({ page }) => {
    if (!hasSupabaseEnv) {
      test.skip(true, "Requires Supabase env with seeded assignment data.");
      return;
    }

    // Scaffold: verify mission flow renders within mobile constraints
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/student/home");
    await expect(page.locator("body")).toBeVisible();
  },
);

test.fixme(
  "multi-turn mission completes after all turns answered and repeated",
  async ({ page }) => {
    if (!hasSupabaseEnv) {
      test.skip(true, "Requires Supabase env with seeded assignment data.");
      return;
    }

    // Scaffold: complete all turns, verify completion screen
    await page.goto("/student/home");
    await expect(page.getByText("Mission complete!")).toBeVisible();
  },
);
