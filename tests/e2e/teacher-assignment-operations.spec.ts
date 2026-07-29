import { expect, test } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

test("teacher switches review policy in both directions while All activity stays complete", async ({ page }) => {
  test.setTimeout(60_000);
  const hasLiveDatabase = Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.SUPABASE_SERVICE_ROLE_KEY,
  );
  test.skip(!hasLiveDatabase, "Requires Supabase service-role test setup.");

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
  const email = `review-policy-${stamp}@example.test`;
  const password = "Review-P0licy-Test!";
  const className = `Review Policy Class ${stamp}`;
  const ordinaryName = `Ordinary Student ${stamp}`;
  const flaggedName = `Flagged Student ${stamp}`;
  let createdUserId: string | null = null;
  let createdProfileId: string | null = null;

  const user = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  expect(user.error).toBeNull();
  createdUserId = user.data.user!.id;

  try {
    const profile = await admin
      .from("teacher_profiles")
      .insert({
        auth_user_id: createdUserId,
        display_name: `Review Policy Teacher ${stamp}`,
      })
      .select("id")
      .single();
    expect(profile.error).toBeNull();
    createdProfileId = profile.data!.id;

    const klass = await admin
      .from("classes")
      .insert({
        teacher_id: profile.data!.id,
        name: className,
        join_code: `RP${stamp}`.slice(-12),
        data_mode: "real",
        review_policy: "every_submission",
      })
      .select("id")
      .single();
    expect(klass.error).toBeNull();

    const students = await admin
      .from("students")
      .insert([
        { class_id: klass.data!.id, display_name: ordinaryName },
        { class_id: klass.data!.id, display_name: flaggedName },
      ])
      .select("id, display_name");
    expect(students.error).toBeNull();

    const mission = await admin
      .from("missions")
      .insert({
        teacher_id: profile.data!.id,
        title: `Policy Mission ${stamp}`,
        target_pattern: "I like ___.",
        topic: "favorites",
        level: "elementary",
        required_turns: 1,
        character_id: "default-buddy",
      })
      .select("id")
      .single();
    expect(mission.error).toBeNull();

    const assignment = await admin
      .from("assignments")
      .insert({
        class_id: klass.data!.id,
        mission_id: mission.data!.id,
        title: `Policy Mission ${stamp}`,
        mission_snapshot: { requiredTurns: 1 },
        data_mode: "real",
      })
      .select("id")
      .single();
    expect(assignment.error).toBeNull();

    const completedAt = new Date().toISOString();
    const assignmentStudents = await admin
      .from("assignment_students")
      .insert(
        students.data!.map((student) => ({
          assignment_id: assignment.data!.id,
          student_id: student.id,
          status: "completed" as const,
          submitted_at: completedAt,
        })),
      )
      .select("id, student_id");
    expect(assignmentStudents.error).toBeNull();

    const ordinaryStudent = students.data!.find(
      (student) => student.display_name === ordinaryName,
    )!;
    const attempts = await admin
      .from("attempts")
      .insert(
        assignmentStudents.data!.map((row) => ({
          assignment_student_id: row.id,
          status: "completed" as const,
          completed_at: completedAt,
          needs_review_reason:
            row.student_id === ordinaryStudent.id ? null : "low_confidence",
        })),
      )
      .select("id, assignment_student_id");
    expect(attempts.error).toBeNull();

    for (const attempt of attempts.data!) {
      const latest = await admin
        .from("assignment_students")
        .update({ latest_attempt_id: attempt.id })
        .eq("id", attempt.assignment_student_id);
      expect(latest.error).toBeNull();
    }

    await page.goto("/auth/login");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill(password);
    await page.getByRole("button", { name: "Log in" }).click();
    await expect(page).toHaveURL(/\/teacher$/);

    await page.goto(`/teacher/classes/${klass.data!.id}`);
    const policy = page.getByLabel("Class review policy");
    await expect(policy).toHaveValue("every_submission");
    await expect(page.getByText(ordinaryName, { exact: true })).toBeVisible();
    await expect(page.getByText(flaggedName, { exact: true })).toBeVisible();

    await policy.selectOption("flagged_only");
    await expect(page.getByRole("status")).toHaveText("Review setting updated.");
    await expect(policy).toHaveValue("flagged_only");
    await expect(page.getByText(ordinaryName, { exact: true })).toHaveCount(0);
    await expect(page.getByText(flaggedName, { exact: true })).toBeVisible();

    await page.goto(`/teacher/activity?class=${encodeURIComponent(className)}`);
    await expect(page.getByText(ordinaryName, { exact: true })).toBeVisible();
    await expect(page.getByText(flaggedName, { exact: true })).toBeVisible();

    await page.goto(`/teacher/classes/${klass.data!.id}`);
    const restoredPolicy = page.getByLabel("Class review policy");
    await restoredPolicy.selectOption("every_submission");
    await expect(page.getByRole("status")).toHaveText("Review setting updated.");
    await expect(restoredPolicy).toHaveValue("every_submission");
    await expect(page.getByText(ordinaryName, { exact: true })).toBeVisible();
    await expect(page.getByText(flaggedName, { exact: true })).toBeVisible();
  } finally {
    if (createdProfileId) {
      const profileCleanup = await admin
        .from("teacher_profiles")
        .delete()
        .eq("id", createdProfileId);
      expect.soft(
        profileCleanup.error,
        `cleanup teacher profile ${createdProfileId}`,
      ).toBeNull();
    }
    if (createdUserId) {
      const userCleanup = await admin.auth.admin.deleteUser(createdUserId);
      expect.soft(
        userCleanup.error,
        `cleanup auth user ${createdUserId}`,
      ).toBeNull();
    }
  }
});
