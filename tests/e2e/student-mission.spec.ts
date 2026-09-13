/**
 * Student mission flow e2e tests (FLOW-04/05, PILOT-01).
 *
 * Drives the happy path: reach the mission flow for a seeded assigned
 * student, complete the full per-turn cycle (answer -> improved sentence
 * -> repeat -> next question -> complete), and assert "Mission complete!"
 * then return to homework.
 *
 * Runs through test:e2e:local, which provides a reset local Supabase instance.
 */

import { expect, test } from "@playwright/test";
import type { SupabaseClient } from "@supabase/supabase-js";

test.use({
  launchOptions: {
    args: [
      "--use-fake-device-for-media-stream",
      "--use-fake-ui-for-media-stream",
    ],
  },
});
test.describe.configure({ timeout: 60_000 });

async function submitVoiceRecording(page: import("@playwright/test").Page) {
  await page.getByRole("button", { name: "Record", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Stop recording" }),
  ).toBeVisible();
  await page.waitForTimeout(200);
  await page.getByRole("button", { name: "Stop recording" }).click();
}

async function revealHint(
  page: import("@playwright/test").Page,
  hintText: string,
) {
  await expect(async () => {
    await page.getByRole("button", { name: "💡 Hint" }).click();
    await expect(page.getByText(hintText)).toBeVisible({ timeout: 500 });
  }).toPass();
}

async function installFakeRecorder(page: import("@playwright/test").Page) {
  await page.addInitScript(() => {
    class FakeMediaRecorder {
      state = "inactive";
      mimeType = "audio/webm";
      ondataavailable: ((event: { data: Blob }) => void) | null = null;
      onstop: (() => void) | null = null;
      onerror: (() => void) | null = null;

      static isTypeSupported() {
        return true;
      }

      constructor(_stream: MediaStream, options?: { mimeType?: string }) {
        this.mimeType = options?.mimeType ?? "audio/webm";
      }

      start() {
        this.state = "recording";
      }

      stop() {
        if (this.state === "inactive") return;
        this.state = "inactive";
        this.ondataavailable?.({
          data: new Blob(["fake-audio"], { type: this.mimeType }),
        });
        this.onstop?.();
      }
    }

    Object.defineProperty(window, "MediaRecorder", {
      configurable: true,
      value: FakeMediaRecorder,
    });
  });
}

type MockAudioResponse = {
  turnOrder: number;
  clipKind: "original_answer" | "repeat_attempt";
  displayTranscript: string;
  evaluation:
    | {
        kind: "original";
        outcome: "needs_correction" | "accepted_original";
        improvedSentence: string | null;
      }
    | { kind: "repeat"; outcome: "accepted_repeat" };
};

async function mockAudioResponses(
  page: import("@playwright/test").Page,
  admin: SupabaseClient,
  assignmentStudentId: string,
  responses: MockAudioResponse[],
) {
  await page.route("**/student/missions/**/audio", async (route) => {
    const response = responses.shift();
    if (!response) {
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ ok: false, error: "unexpected_audio_call" }),
      });
      return;
    }

    const { data: attempt } = await admin
      .from("attempts")
      .select("id")
      .eq("assignment_student_id", assignmentStudentId)
      .eq("status", "in_progress")
      .single();
    if (!attempt) {
      await route.fulfill({ status: 500, body: "mock_attempt_missing" });
      return;
    }

    const evaluation = {
      version: "ai-eval-v1",
      outcome: response.evaluation.outcome,
      requireRepeat:
        response.evaluation.kind === "original" &&
        response.evaluation.outcome === "needs_correction",
    };
    const mutation =
      response.clipKind === "original_answer"
        ? admin.from("attempt_turns").upsert({
            attempt_id: attempt.id,
            turn_order: response.turnOrder,
            original_transcript: response.displayTranscript,
            improved_sentence:
              response.evaluation.kind === "original"
                ? response.evaluation.improvedSentence
                : null,
            evaluation,
          })
        : admin
            .from("attempt_turns")
            .update({
              repeat_transcript: response.displayTranscript,
              repeat_accepted: true,
              evaluation,
            })
            .eq("attempt_id", attempt.id)
            .eq("turn_order", response.turnOrder);
    const { error } = await mutation;
    if (error) {
      await route.fulfill({ status: 500, body: "mock_persistence_failed" });
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true, ...response }),
    });
  });
}

test("multi-pattern preset: wrong pattern repeats and active pattern completes", async ({
  page,
}) => {
  const { createClient } = await import("@supabase/supabase-js");
  const { randomBytes, scryptSync } = await import("node:crypto");
  await installFakeRecorder(page);
  const audioResponses: MockAudioResponse[] = [
    {
      turnOrder: 1,
      clipKind: "original_answer",
      displayTranscript: "Apples are yellow.",
      evaluation: {
        kind: "original",
        outcome: "needs_correction",
        improvedSentence: "I like bananas.",
      },
    },
    {
      turnOrder: 1,
      clipKind: "repeat_attempt",
      displayTranscript: "I like bananas.",
      evaluation: { kind: "repeat", outcome: "accepted_repeat" },
    },
    {
      turnOrder: 2,
      clipKind: "original_answer",
      displayTranscript: "Apples are red.",
      evaluation: {
        kind: "original",
        outcome: "accepted_original",
        improvedSentence: null,
      },
    },
  ];

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
      target_pattern: null,
      required_turns: 2,
      character_id: "default-buddy",
      conversation_mode: false,
    })
    .select("id")
    .single();
  expect(mission.error).toBeNull();

  const missionSnapshot = {
    missionId: mission.data!.id,
    title: `E2E Mission ${stamp}`,
    level: "beginner",
    characterId: "default-buddy",
    requiredTurns: 2,
    conversationMode: false,
    requireCompleteSentenceAnswers: true,
    turns: [
      {
        turnOrder: 1,
        prompt: "What fruit do you like?",
        targetPattern: "I like ___.",
        targetExample: "I like bananas.",
        hintLadder: {
          tier1: "Start with: I like",
          tier2: "apples, bananas, oranges",
          tier3: "I like bananas.",
        },
        answerShape: "open",
      },
      {
        turnOrder: 2,
        prompt: "What color are apples?",
        targetPattern: "Apples are ___.",
        targetExample: "Apples are red.",
        hintLadder: {
          tier1: "Start with: Apples are",
          tier2: "red, green, delicious",
          tier3: "Apples are red.",
        },
        answerShape: "open",
      },
    ],
  };

  // Create assignment + assignment_students row
  const assignment = await admin
    .from("assignments")
    .insert({
      mission_id: mission.data!.id,
      class_id: klass.data!.id,
      title: `E2E Mission ${stamp}`,
      mission_snapshot: missionSnapshot,
      data_mode: "real",
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
  await mockAudioResponses(
    page,
    admin,
    assignmentStudent.data!.id,
    audioResponses,
  );

  try {
    // Unlock the student
    await page.goto("/join");
    await page.getByLabel(/class code/i).fill(joinCode);
    await page.getByRole("button", { name: "Join" }).click();
    await page.getByLabel(/name/i).fill(studentName);
    await page.getByLabel("4-digit PIN").fill(pin);
    await page.getByRole("button", { name: "Unlock homework" }).click();

    // Should see the assignment in the homework list
    await expect(page.getByText(`E2E Mission ${stamp}`)).toBeVisible();

    // Navigate to the mission
    await page.getByText("Start").click();

    // Step 1: Buddy question card visible
    await expect(page.getByText("Coco asks:")).toHaveCount(0);
    await expect(
      page.getByText("What fruit do you like?"),
    ).toBeVisible();
    await expect(page.getByText("Start with: I like")).toBeHidden();
    await revealHint(page, "Start with: I like");

    // Submit a voice answer
    await submitVoiceRecording(page);

    await expect(page.getByText("I like bananas.")).toBeVisible();
    await page.getByRole("button", { name: "Try again" }).click();
    await submitVoiceRecording(page);
    await expect(page.getByText("Good repeat.")).toBeVisible();
    await page.getByRole("button", { name: "Continue mission" }).click();

    // Turn 2 opens immediately after continuing the completed turn.
    await expect(
      page.getByText("Good job! Ready for the next one?"),
    ).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Next turn" })).toHaveCount(0);
    await expect(
      page.getByText("What color are apples?"),
    ).toBeVisible();
    await expect(page.getByText("Start with: Apples are")).toBeHidden();
    await revealHint(page, "Start with: Apples are");
    await submitVoiceRecording(page);

    await expect(page.getByText("Nice answer!")).toBeVisible();
    await page.getByRole("button", { name: "Continue practice" }).click();
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
  // Set mobile viewport (iPhone SE size)
  await page.setViewportSize({ width: 375, height: 812 });

  const { createClient } = await import("@supabase/supabase-js");
  const { randomBytes, scryptSync } = await import("node:crypto");
  await installFakeRecorder(page);
  const audioResponses: MockAudioResponse[] = [
    {
      turnOrder: 1,
      clipKind: "original_answer",
      displayTranscript: "I have a cat",
      evaluation: {
        kind: "original",
        outcome: "needs_correction",
        improvedSentence: "I have a cat at home.",
      },
    },
    {
      turnOrder: 1,
      clipKind: "repeat_attempt",
      displayTranscript: "I have a cat at home",
      evaluation: { kind: "repeat", outcome: "accepted_repeat" },
    },
  ];

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

  const mission = await admin
    .from("missions")
    .insert({
      teacher_id: teacher.data!.id,
      title: `Mobile Mission ${stamp}`,
      level: "beginner",
      topic: "animals",
      target_pattern: "I have a cat",
      required_turns: 1,
      character_id: "default-buddy",
    })
    .select("id")
    .single();
  expect(mission.error).toBeNull();

  const assignment = await admin
    .from("assignments")
    .insert({
      mission_id: mission.data!.id,
      class_id: klass.data!.id,
      title: `Mobile Mission ${stamp}`,
      data_mode: "real",
      mission_snapshot: {
        missionId: mission.data!.id,
        title: `Mobile Mission ${stamp}`,
        level: "beginner",
        targetPattern: "I have a cat",
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
  await mockAudioResponses(
    page,
    admin,
    assignmentStudent.data!.id,
    audioResponses,
  );

  try {
    // Unlock
    await page.goto("/join");
    await page.getByLabel(/class code/i).fill(joinCode);
    await page.getByRole("button", { name: "Join" }).click();
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

    await revealHint(page, "I have a ___");

    // Primary action is reachable
    await expect(
      page.getByRole("button", { name: "Record", exact: true }),
    ).toBeVisible();

    // Complete the single turn
    await submitVoiceRecording(page);
    await expect(page.getByText("I have a cat at home.")).toBeVisible();
    await page.getByRole("button", { name: "Try again" }).click();
    await submitVoiceRecording(page);
    await expect(page.getByText("Good repeat.")).toBeVisible();
    await page.getByRole("button", { name: "Continue mission" }).click();

    // Mission complete on mobile
    await expect(page.getByText("Mission complete!")).toBeVisible();
  } finally {
    await admin
      .from("teacher_profiles")
      .delete()
      .eq("id", teacher.data!.id);
  }
});
