import { expect, test } from "@playwright/test";

const SUPABASE_ENV_PRESENT = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
);

test("manual mission authoring path is env-aware and excludes later-phase features", async ({
  page,
}) => {
  if (!SUPABASE_ENV_PRESENT) {
    await page.goto("/teacher/missions/new");
    await expect(page).toHaveURL(/\/auth\/login/);
    return;
  }

  test.skip(
    !process.env.E2E_TEACHER_EMAIL || !process.env.E2E_TEACHER_PASSWORD,
    "Logged-in teacher fixture not provisioned; live mission authoring path is env-gated.",
  );

  await page.goto("/teacher/missions/new");
  await expect(page.getByRole("heading", { name: "New mission" })).toBeVisible();

  await page.getByLabel("Mission title").fill(`Mission ${Date.now()}`);
  await page.getByLabel("Target pattern").fill("I like ___ing.");
  await page.getByLabel("Topic").fill("After school");
  await page.getByLabel("Level").selectOption("elementary");
  await page.getByLabel("Buddy question").fill("What do you like doing?");
  await page
    .getByLabel("Target-form example")
    .fill("I like playing soccer.");
  await page.getByLabel("Hint 1: Target pattern").fill("I like ___ing.");
  await page.getByLabel("Hint 2: Word bank").fill("like, play, soccer");
  await page.getByLabel("Hint 3: Full example").fill("I like playing soccer.");
  await page.getByRole("button", { name: "Save mission" }).click();

  await expect(page).toHaveURL(/\/teacher\/missions\/.+/);
  await expect(page.getByRole("heading", { name: "Edit mission" })).toBeVisible();
  await expect(page.getByText(/AI/i)).toHaveCount(0);
  await expect(page.getByText(/Audio/i)).toHaveCount(0);
  await expect(page.getByText(/Review/i)).toHaveCount(0);
});
