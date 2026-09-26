/**
 * Shared seeding and student-driving helpers for mission e2e specs.
 *
 * Seeds straight into the local Supabase instance that test:e2e:local resets,
 * so each spec owns its data and cleans it up through the teacher profile
 * cascade.
 */

import { expect, type Page } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { randomBytes, scryptSync } from "node:crypto";

export function createAdmin(): SupabaseClient {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: { persistSession: false, autoRefreshToken: false },
      // supabase-js builds a RealtimeClient eagerly; these specs only query.
      realtime: {
        transport: class {
          constructor() {}
          close() {}
        } as unknown as never,
      },
    },
  );
}

const JOIN_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

function generateJoinCode() {
  return Array.from(
    { length: 6 },
    () => JOIN_ALPHABET[Math.floor(Math.random() * JOIN_ALPHABET.length)],
  ).join("");
}

// Byte-compatible with src/domain/classroom/pin.ts; the live unlock action
// verifies it, so drift fails the unlock step.
function hashPin(pin: string) {
  const pepper = process.env.PIN_HASH_PEPPER!;
  const saltHex = randomBytes(16).toString("hex");
  const keyHex = scryptSync(`${pin}${pepper}`, saltHex, 32).toString("hex");
  return `s1:${saltHex}:${keyHex}`;
}

export type SeededStudent = { id: string; name: string; pin: string };

export type SeededClassroom = {
  teacherId: string;
  classId: string;
  className: string;
  joinCode: string;
  students: SeededStudent[];
  /** Set when the classroom was seeded with a teacher login. */
  teacherLogin: { email: string; password: string; userId: string } | null;
};

export async function seedClassroom(
  admin: SupabaseClient,
  {
    label,
    studentNames,
    withTeacherLogin = false,
  }: { label: string; studentNames: string[]; withTeacherLogin?: boolean },
): Promise<SeededClassroom> {
  const stamp = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
  let teacherLogin: SeededClassroom["teacherLogin"] = null;

  if (withTeacherLogin) {
    const email = `${label.toLowerCase().replace(/\W+/g, "-")}-${stamp}@example.test`;
    // Throwaway local-only password for a user this spec creates and deletes.
    const password = `E2e-${stamp}-pw!`;
    const user = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    expect(user.error).toBeNull();
    teacherLogin = { email, password, userId: user.data.user!.id };
  }

  const teacher = await admin
    .from("teacher_profiles")
    .insert({
      display_name: `${label} Teacher ${stamp}`,
      auth_user_id: teacherLogin?.userId ?? null,
    })
    .select("id")
    .single();
  expect(teacher.error).toBeNull();

  const className = `${label} Class ${stamp}`;
  const joinCode = generateJoinCode();
  const klass = await admin
    .from("classes")
    .insert({
      teacher_id: teacher.data!.id,
      name: className,
      join_code: joinCode,
      data_mode: "real",
    })
    .select("id")
    .single();
  expect(klass.error).toBeNull();

  const students: SeededStudent[] = [];
  for (const [index, baseName] of studentNames.entries()) {
    const name = `${baseName} ${stamp}`;
    const pin = String(1000 + index * 1111).slice(0, 4);
    const student = await admin
      .from("students")
      .insert({
        class_id: klass.data!.id,
        display_name: name.trim().replace(/\s+/g, " ").toLowerCase(),
        pin_hash: hashPin(pin),
      })
      .select("id")
      .single();
    expect(student.error).toBeNull();
    students.push({ id: student.data!.id, name, pin });
  }

  return {
    teacherId: teacher.data!.id,
    classId: klass.data!.id,
    className,
    joinCode,
    students,
    teacherLogin,
  };
}

export async function cleanupClassroom(
  admin: SupabaseClient,
  classroom: SeededClassroom,
) {
  await admin.from("teacher_profiles").delete().eq("id", classroom.teacherId);
  if (classroom.teacherLogin) {
    await admin.auth.admin.deleteUser(classroom.teacherLogin.userId);
  }
}

export type SeedTurn = {
  prompt: string;
  targetPattern: string;
  targetExample: string;
  tier1: string;
};

/** Assigns a new mission to the given students; returns their assigned-homework ids in order. */
export async function seedAssignment(
  admin: SupabaseClient,
  classroom: SeededClassroom,
  {
    title,
    studentIds,
    turns,
    conversation,
  }: {
    title: string;
    studentIds: string[];
    turns: SeedTurn[];
    /** Conversation mission: turns[0] is the opener, repeated for requiredTurns. */
    conversation?: { contextPattern: string; requiredTurns: number };
  },
): Promise<string[]> {
  const requiredTurns = conversation?.requiredTurns ?? turns.length;
  const mission = await admin
    .from("missions")
    .insert({
      teacher_id: classroom.teacherId,
      title,
      level: "beginner",
      topic: "e2e",
      target_pattern: conversation?.contextPattern ?? null,
      required_turns: requiredTurns,
      character_id: "default-buddy",
      conversation_mode: Boolean(conversation),
    })
    .select("id")
    .single();
  expect(mission.error).toBeNull();

  const snapshotTurns = turns.map((turn, index) => ({
    turnOrder: index + 1,
    prompt: turn.prompt,
    ...(conversation ? {} : { targetPattern: turn.targetPattern }),
    targetExample: turn.targetExample,
    hintLadder: {
      tier1: turn.tier1,
      tier2: "words, words, words",
      tier3: turn.targetExample,
    },
    answerShape: "open",
  }));

  const assignment = await admin
    .from("assignments")
    .insert({
      mission_id: mission.data!.id,
      class_id: classroom.classId,
      title,
      data_mode: "real",
      mission_snapshot: {
        missionId: mission.data!.id,
        title,
        level: "beginner",
        characterId: "default-buddy",
        requiredTurns,
        conversationMode: Boolean(conversation),
        ...(conversation ? { targetPattern: conversation.contextPattern } : {}),
        requireCompleteSentenceAnswers: true,
        turns: snapshotTurns,
      },
    })
    .select("id")
    .single();
  expect(assignment.error).toBeNull();

  const rows = await admin
    .from("assignment_students")
    .insert(
      studentIds.map((studentId) => ({
        assignment_id: assignment.data!.id,
        student_id: studentId,
        status: "assigned",
      })),
    )
    .select("id, student_id");
  expect(rows.error).toBeNull();
  return studentIds.map(
    (studentId) => rows.data!.find((row) => row.student_id === studentId)!.id,
  );
}

export async function unlockStudent(
  page: Page,
  classroom: SeededClassroom,
  student: SeededStudent,
) {
  await page.goto("/join");
  await page.getByLabel(/class code/i).fill(classroom.joinCode);
  await page.getByRole("button", { name: "Join" }).click();
  await page.getByLabel(/name/i).fill(student.name);
  await page.getByLabel("4-digit PIN").fill(student.pin);
  await page.getByRole("button", { name: "Unlock homework" }).click();
  await expect(page).toHaveURL(/\/student\/home/);
}

export async function installFakeRecorder(page: Page) {
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

export async function submitVoiceRecording(page: Page) {
  const stop = page.getByRole("button", { name: "Stop recording" });
  const record = page.getByRole("button", { name: "Record", exact: true });
  // On a cold dev server the first click can land before hydration and do
  // nothing, so retry until recording actually starts (same as revealHint).
  // Record and Stop are one toggling button that is disabled while the mic
  // starts; only re-click while it is enabled, or a late retry lands on Stop
  // and submits an extra answer.
  await expect(async () => {
    if (!(await stop.isVisible()) && (await record.isEnabled({ timeout: 1_000 }))) {
      await record.click({ timeout: 1_000 });
    }
    await expect(stop).toBeVisible({ timeout: 1_000 });
  }).toPass();
  await page.waitForTimeout(200);
  await stop.click();
}

export type MockAudioResponse = {
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
  /** Conversation missions: Coco's generated follow-up or closing line. */
  cocoLine?: string;
};

/**
 * Stands in for the audio route (transcription + AI evaluation) with scripted
 * answers, persisting each turn as the server would so resume, TTS, and
 * completion read real rows.
 */
export async function mockAudioResponses(
  page: Page,
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

    // Shape read back by src/domain/ai/stored-evaluation.ts; without `kind`
    // resume cannot tell an accepted turn is finished.
    const evaluation = {
      kind: response.evaluation.kind,
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
            ...(response.cocoLine ? { coco_line: response.cocoLine } : {}),
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
