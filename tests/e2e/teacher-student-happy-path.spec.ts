import { expect, test } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { generateJoinCode } from "@/domain/classroom/join-code";
import { logInTeacher } from "./teacher-auth";

const LIVE_E2E_ENV_PRESENT = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY &&
    process.env.SUPABASE_SERVICE_ROLE_KEY &&
    process.env.PIN_HASH_PEPPER &&
    process.env.STUDENT_ACCESS_SECRET,
);

test("teacher assignment reaches the student's homework list through public UI", async ({
  page,
  browser,
}) => {
  test.setTimeout(120_000);
  test.skip(
    !LIVE_E2E_ENV_PRESENT,
    "Requires local Supabase and student secrets for isolated teacher/student E2E setup.",
  );

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: { persistSession: false, autoRefreshToken: false },
      realtime: {
        transport: class {
          constructor() {}
          close() {}
        } as unknown as never,
      },
    },
  );

  const stamp = Date.now();
  const className = `Playwright UI Class ${stamp}`;
  const studentName = `Playwright UI Student ${stamp}`;
  const missionTitle = `Playwright UI Mission ${stamp}`;
  const joinCode = generateJoinCode();
  let classId: string | null = null;
  let missionId: string | null = null;
  let teacherProfileId: string | null = null;
  let teacherUserId: string | null = null;
  let studentContext: Awaited<ReturnType<typeof browser.newContext>> | null = null;
  const teacherEmail = `playwright-teacher-${stamp}@example.test`;
  const teacherPassword = "Playwright-T3acher-Test!";

  try {
    const teacherUser = await admin.auth.admin.createUser({
      email: teacherEmail,
      password: teacherPassword,
      email_confirm: true,
    });
    expect(teacherUser.error).toBeNull();
    if (!teacherUser.data.user) {
      throw new Error("Unable to create isolated E2E teacher auth user.");
    }
    teacherUserId = teacherUser.data.user.id;

    const teacher = await admin
      .from("teacher_profiles")
      .insert({
        auth_user_id: teacherUserId,
        display_name: `Playwright Teacher ${stamp}`,
      })
      .select("id")
      .single();
    expect(teacher.error).toBeNull();
    if (!teacher.data) {
      throw new Error("Unable to create isolated E2E teacher profile.");
    }
    teacherProfileId = teacher.data.id;

    // The shell links to /teacher/classes, but that route/create affordance is
    // absent. Seed only this missing prerequisite; the remaining class,
    // mission, assignment, and student actions stay on the public UI.
    const klass = await admin
      .from("classes")
      .insert({
        teacher_id: teacher.data.id,
        name: className,
        join_code: joinCode,
        data_mode: "real",
      })
      .select("id")
      .single();
    expect(klass.error).toBeNull();
    if (!klass.data) throw new Error("Unable to create isolated E2E class fixture.");
    classId = klass.data.id;

    await logInTeacher(page, {
      email: teacherEmail,
      password: teacherPassword,
    });

    // Add the student through the teacher UI so the one-time PIN path is
    // exercised instead of inserting a PIN fixture directly.
    await page.goto(`/teacher/classes/${classId}/manage`);
    await page.waitForLoadState("networkidle");
    await expect(
      page.getByRole("heading", { name: `${className} — Class Settings` }),
    ).toBeVisible();
    await page.getByRole("tab", { name: "Add one" }).click();
    await page.getByLabel("Student name").fill(studentName);
    await page.getByRole("button", { name: "Add students" }).click();

    const pinNotice = page.getByText(/Added .*\. PIN\s+\d{4}/);
    await expect(pinNotice).toBeVisible();
    const pin = (await pinNotice.textContent())?.match(/PIN\s+(\d{4})/)?.[1];
    if (!pin) throw new Error("Teacher UI did not expose the generated student PIN.");

    // Create the mission through the teacher authoring UI.
    await page.goto("/teacher/missions/new");
    await page.waitForLoadState("networkidle");
    await expect(page.getByRole("heading", { name: "New mission" })).toBeVisible();
    await page.getByLabel("Mission title").fill(missionTitle);
    await page.getByLabel("Level").selectOption("elementary");
    await page.getByLabel("Buddy question").fill("What fruit do you like?");
    await page.locator("#turn-0-target-pattern").fill("I like ___.");
    await page.getByLabel("Example answer").fill("I like apples.");
    await page.getByLabel("Hint 1: Target pattern").fill("Start with: I like");
    await page.getByLabel("Hint 2: Word bank").fill("apples, bananas, oranges");
    await page.getByLabel("Hint 3: Full example").fill("I like apples.");
    await page.getByRole("button", { name: "Save mission" }).click();
    await expect(page).toHaveURL(/\/teacher\/missions\?saved=1/);

    const missionRow = page.getByText(missionTitle, { exact: true }).locator("xpath=../..");
    const missionHref = await missionRow
      .getByRole("link", { name: "Edit" })
      .getAttribute("href");
    missionId = missionHref?.split("/").pop() ?? null;
    if (!missionId) throw new Error("Teacher UI did not expose the created mission id.");

    // Assign the mission through the teacher UI.
    const assignButton = missionRow.getByRole("button", {
      name: "Assign to class",
    });
    await page.waitForLoadState("networkidle");
    await assignButton.click();
    const dialog = page.getByRole("dialog", { name: "Assign mission" });
    await expect(dialog).toBeVisible();
    await dialog.getByLabel("Class").selectOption(classId);
    await dialog.getByRole("button", { name: "Assign homework" }).click();
    await expect(
      page.getByText(
        `Homework assigned to ${className}. 1 student(s) will see it on their next visit.`,
      ),
    ).toBeVisible();

    // Switch roles in a fresh browser context and verify the assignment.
    studentContext = await browser.newContext();
    const studentPage = await studentContext.newPage();
    await studentPage.goto("/join");
    await studentPage.waitForLoadState("networkidle");
    await studentPage.getByLabel("Class code").fill(joinCode);
    await studentPage.getByRole("button", { name: "Join" }).click();
    await studentPage.getByLabel("Your name").fill(studentName);
    await studentPage.getByLabel("4-digit PIN").fill(pin);
    await studentPage.getByRole("button", { name: "Unlock homework" }).click();
    await expect(studentPage.getByText(missionTitle, { exact: true })).toBeVisible();
    await expect(
      studentPage.getByRole("link", { name: /Start mission/ }),
    ).toBeVisible();
  } finally {
    await studentContext?.close();
    if (classId) {
      const classCleanup = await admin.from("classes").delete().eq("id", classId);
      expect.soft(classCleanup.error, `cleanup class ${classId}`).toBeNull();
    }
    if (missionId) {
      const missionCleanup = await admin.from("missions").delete().eq("id", missionId);
      expect.soft(missionCleanup.error, `cleanup mission ${missionId}`).toBeNull();
    } else if (teacherProfileId) {
      const missionCleanup = await admin
        .from("missions")
        .delete()
        .eq("teacher_id", teacherProfileId)
        .eq("title", missionTitle);
      expect.soft(missionCleanup.error, `cleanup mission ${missionTitle}`).toBeNull();
    }
    if (teacherProfileId) {
      const profileCleanup = await admin
        .from("teacher_profiles")
        .delete()
        .eq("id", teacherProfileId);
      expect.soft(
        profileCleanup.error,
        `cleanup teacher profile ${teacherProfileId}`,
      ).toBeNull();
    }
    if (teacherUserId) {
      const userCleanup = await admin.auth.admin.deleteUser(teacherUserId);
      expect.soft(userCleanup.error, `cleanup auth user ${teacherUserId}`).toBeNull();
    }
  }
});
