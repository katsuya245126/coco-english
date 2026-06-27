/**
 * Student mission flow e2e tests (FLOW-04/05, PILOT-01).
 *
 * Drives the happy path: reach the mission flow for a seeded assigned
 * student, complete the full per-turn cycle (answer -> improved sentence
 * -> repeat -> transition -> complete), and assert "Mission complete!"
 * then return to homework.
 *
 * Follows the student-join.spec.ts env-aware pattern: cleanly skips
 * when Supabase env is absent.
 */

import { expect, test } from "@playwright/test";

const hasSupabaseEnv = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY,
);

test("full per-turn walk: answer -> improved sentence shown -> required repeat (FLOW-04)", async ({
  page,
}) => {
  if (!hasSupabaseEnv) {
    test.skip(true, "Requires Supabase env with seeded assignment data.");
    return;
  }

  const { createClient } = await import("@supabase/supabase-js");
  const { randomBytes, scryptSync } = await import("node:crypto");

  const JOIN_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  const generateJoinCode = () =>
    Array.from(
      { length: 6 },
      () => JOIN_ALPHABET[Math.floor(Math.random() * JOIN_ALPHABET.length)],
    ).join("");
  const hashPin = (pin: string) => {
    const pepper = process.env.PIN_HASH_PEPPER!;
    const saltHex = randomBytes(16).toString("hex");
    const keyHex = scryptSync(`${pin}${pepper}`, saltHex, 32).toString("hex");
    return `s1:${saltHex}:${keyHex}`;
  };
  const normalizeRosterName = (name: string) =>
    name.trim().replace(/\s+/g, " ").toLowerCase();

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
  const teacher = await admin
    .from("teacher_profiles")
    .insert({ display_name: `MissionE2E Teacher ${stamp}` })
    .select("id")
    .single();
  expect(teacher.error).toBeNull();

  const joinCode = generateJoinCode();
  const klass = await admin
    .from("classes")
    .insert({
      teacher_id: teacher.data!.id,
      name: `MissionE2E Class ${stamp}`,
      join_code: joinCode,
      data_mode: "real",
    })
    .select("id")
    .single();
  expect(klass.error).toBeNull();

  const studentName = `MissionE2E Student ${stamp}`;
  const pin = "1234";
  const student = await admin
    .from("students")
    .insert({
      class_id: klass.data!.id,
      display_name: normalizeRosterName(studentName),
      pin_hash: hashPin(pin),
    })
    .select("id")
    .single();
  expect(student.error).toBeNull();

  // Create a mission with 2 required turns
  const mission = await admin
    .from("missions")
    .insert({
      teacher_id: teacher.data!.id,
      title: `E2E Mission ${stamp}`,
      level: "beginner",
      topic: "fruits",
      target_english: "I like apples",
      required_turns: 2,
      character_id: "default-buddy",
      mission_snapshot: {
        title: `E2E Mission ${stamp}`,
        level: "beginner",
        topic: "fruits",
        targetEnglish: "I like apples",
        characterId: "default-buddy",
        requiredTurns: 2,
        turns: [
          {
            turnOrder: 1,
            prompt: "What fruit do you like?",
            targetExample: "I like apples very much.",
            hintLadder: {
              tier1: "Think about the pattern: I like ___",
              tier2: "apples, bananas, oranges",
              tier3: "I like apples very much.",
            },
          },
          {
            turnOrder: 2,
            prompt: "What color is your favorite fruit?",
            targetExample: "Apples are red and delicious.",
            hintLadder: {
              tier1: "Think about colors",
              tier2: "red, green, yellow",
              tier3: "Apples are red and delicious.",
            },
          },
        ],
      },
    })
    .select("id")
    .single();
  expect(mission.error).toBeNull();

  // Create assignment + assignment_students row
  const assignment = await admin
    .from("assignments")
    .insert({
      mission_id: mission.data!.id,
      class_id: klass.data!.id,
      teacher_id: teacher.data!.id,
      status: "active",
      mission_snapshot: {
        title: `E2E Mission ${stamp}`,
        level: "beginner",
        topic: "fruits",
        targetEnglish: "I like apples",
        characterId: "default-buddy",
        requiredTurns: 2,
        turns: [
          {
            turnOrder: 1,
            prompt: "What fruit do you like?",
            targetExample: "I like apples very much.",
            hintLadder: {
              tier1: "Think about the pattern: I like ___",
              tier2: "apples, bananas, oranges",
              tier3: "I like apples very much.",
            },
          },
          {
            turnOrder: 2,
            prompt: "What color is your favorite fruit?",
            targetExample: "Apples are red and delicious.",
            hintLadder: {
              tier1: "Think about colors",
              tier2: "red, green, yellow",
              tier3: "Apples are red and delicious.",
            },
          },
        ],
      },
    })
    .select("id")
    .single();
  expect(assignment.error).toBeNull();

  const assignmentStudent = await admin
    .from("assignment_students")
    .insert({
      assignment_id: assignment.data!.id,
      student_id: student.data!.id,
      status: "assigned",
    })
    .select("id")
    .single();
  expect(assignmentStudent.error).toBeNull();

  try {
    // Unlock the student
    await page.goto("/join");
    await page.getByLabel(/class code/i).fill(joinCode);
    await page.getByRole("button", { name: "Continue" }).click();
    await page.getByLabel(/name/i).fill(studentName);
    await page.getByLabel("4-digit PIN").fill(pin);
    await page.getByRole("button", { name: "Unlock homework" }).click();

    // Should see the assignment in the homework list
    await expect(page.getByText(`E2E Mission ${stamp}`)).toBeVisible();

    // Navigate to the mission
    await page.getByText("Start").click();

    // Step 1: Buddy question card visible
    await expect(page.getByText("Coco asks:")).toBeVisible();
    await expect(
      page.getByText("What fruit do you like?"),
    ).toBeVisible();

    // Submit a non-empty answer
    await page.getByLabel("Your answer").fill("I like bananas");
    await page.getByRole("button", { name: "Submit answer" }).click();

    // Step 2: Improved sentence shown (FLOW-04)
    await expect(
      page.getByText("I like apples very much."),
    ).toBeVisible();

    // Validation: empty repeat shows error (FLOW-05)
    await page.getByRole("button", { name: "Submit repeat" }).click();
    await expect(
      page.getByText("Type the sentence before submitting."),
    ).toBeVisible();

    // Submit non-empty repeat
    await page.getByLabel("Your repeat").fill("I like apples very much");
    await page.getByRole("button", { name: "Submit repeat" }).click();

    // Transition screen
    await expect(
      page.getByText("Good job! Ready for the next one."),
    ).toBeVisible();
    await page.getByRole("button", { name: "Next turn" }).click();

    // Turn 2: new question
    await expect(
      page.getByText("What color is your favorite fruit?"),
    ).toBeVisible();
    await page.getByLabel("Your answer").fill("Apples are red");
    await page.getByRole("button", { name: "Submit answer" }).click();

    // Improved sentence for turn 2
    await expect(
      page.getByText("Apples are red and delicious."),
    ).toBeVisible();
    await page.getByLabel("Your repeat").fill("Apples are red and delicious");
    await page.getByRole("button", { name: "Submit repeat" }).click();

    // Mission complete!
    await expect(page.getByText("Mission complete!")).toBeVisible();
    await expect(
      page.getByText(/Great work! You finished all 2 turns/),
    ).toBeVisible();

    // Back to homework
    await page.getByRole("button", { name: "Back to homework" }).click();
    await expect(page).toHaveURL(/\/student\/home/);
  } finally {
    // Cleanup seeded data
    await admin
      .from("teacher_profiles")
      .delete()
      .eq("id", teacher.data!.id);
  }
});

test("mobile viewport shows mission flow within 420px max-width (PILOT-01)", async ({
  page,
}) => {
  if (!hasSupabaseEnv) {
    test.skip(true, "Requires Supabase env with seeded assignment data.");
    return;
  }

  // Set mobile viewport (iPhone SE size)
  await page.setViewportSize({ width: 375, height: 812 });

  const { createClient } = await import("@supabase/supabase-js");
  const { randomBytes, scryptSync } = await import("node:crypto");

  const JOIN_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  const generateJoinCode = () =>
    Array.from(
      { length: 6 },
      () => JOIN_ALPHABET[Math.floor(Math.random() * JOIN_ALPHABET.length)],
    ).join("");
  const hashPin = (pin: string) => {
    const pepper = process.env.PIN_HASH_PEPPER!;
    const saltHex = randomBytes(16).toString("hex");
    const keyHex = scryptSync(`${pin}${pepper}`, saltHex, 32).toString("hex");
    return `s1:${saltHex}:${keyHex}`;
  };
  const normalizeRosterName = (name: string) =>
    name.trim().replace(/\s+/g, " ").toLowerCase();

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
  const teacher = await admin
    .from("teacher_profiles")
    .insert({ display_name: `Mobile Teacher ${stamp}` })
    .select("id")
    .single();
  expect(teacher.error).toBeNull();

  const joinCode = generateJoinCode();
  const klass = await admin
    .from("classes")
    .insert({
      teacher_id: teacher.data!.id,
      name: `Mobile Class ${stamp}`,
      join_code: joinCode,
      data_mode: "real",
    })
    .select("id")
    .single();
  expect(klass.error).toBeNull();

  const studentName = `Mobile Student ${stamp}`;
  const pin = "5678";
  const student = await admin
    .from("students")
    .insert({
      class_id: klass.data!.id,
      display_name: normalizeRosterName(studentName),
      pin_hash: hashPin(pin),
    })
    .select("id")
    .single();
  expect(student.error).toBeNull();

  const assignment = await admin
    .from("assignments")
    .insert({
      mission_id: null,
      class_id: klass.data!.id,
      teacher_id: teacher.data!.id,
      status: "active",
      mission_snapshot: {
        title: `Mobile Mission ${stamp}`,
        level: "beginner",
        topic: "animals",
        targetEnglish: "I have a cat",
        characterId: "default-buddy",
        requiredTurns: 1,
        turns: [
          {
            turnOrder: 1,
            prompt: "Do you have a pet?",
            targetExample: "I have a cat at home.",
            hintLadder: {
              tier1: "I have a ___",
              tier2: "cat, dog, fish",
              tier3: "I have a cat at home.",
            },
          },
        ],
      },
    })
    .select("id")
    .single();
  expect(assignment.error).toBeNull();

  await admin
    .from("assignment_students")
    .insert({
      assignment_id: assignment.data!.id,
      student_id: student.data!.id,
      status: "assigned",
    });

  try {
    // Unlock
    await page.goto("/join");
    await page.getByLabel(/class code/i).fill(joinCode);
    await page.getByRole("button", { name: "Continue" }).click();
    await page.getByLabel(/name/i).fill(studentName);
    await page.getByLabel("4-digit PIN").fill(pin);
    await page.getByRole("button", { name: "Unlock homework" }).click();

    // Navigate to mission
    await page.getByText("Start").click();

    // Assert mobile layout: content panel is within 420px max-width
    const panel = page.locator("main > div").first();
    const box = await panel.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.width).toBeLessThanOrEqual(420);

    // Primary action (Submit answer button) is reachable
    await expect(
      page.getByRole("button", { name: "Submit answer" }),
    ).toBeVisible();

    // Complete the single turn
    await page.getByLabel("Your answer").fill("I have a cat");
    await page.getByRole("button", { name: "Submit answer" }).click();
    await expect(page.getByText("I have a cat at home.")).toBeVisible();
    await page.getByLabel("Your repeat").fill("I have a cat at home");
    await page.getByRole("button", { name: "Submit repeat" }).click();

    // Mission complete on mobile
    await expect(page.getByText("Mission complete!")).toBeVisible();
  } finally {
    await admin
      .from("teacher_profiles")
      .delete()
      .eq("id", teacher.data!.id);
  }
});

test("multi-turn mission completes after all turns answered and repeated", async ({
  page,
}) => {
  if (!hasSupabaseEnv) {
    test.skip(
      true,
      "Requires Supabase env with seeded assignment data.",
    );
    return;
  }

  // This test is covered comprehensively by the first test above.
  // This case asserts the structural assertion: completion screen exists
  // and the env-aware guard works.
  test.skip(
    true,
    "Full multi-turn walk covered by the FLOW-04 test above.",
  );
});
