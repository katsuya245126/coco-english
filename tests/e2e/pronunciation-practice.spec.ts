import { expect, test, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { randomBytes, randomUUID, scryptSync } from "node:crypto";
import { PRONUNCIATION_WORD_BANK } from "../../src/domain/pronunciation/word-bank.generated";
import { buildPronunciationWordAudioSpec } from "../../src/server/audio/pronunciation-word-audio";

const SUPABASE_READY = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.SUPABASE_SERVICE_ROLE_KEY,
);
const SUPABASE_IS_LOCAL =
  /^(https?:\/\/)?(127\.0\.0\.1|localhost)(:\d+)?(?:\/|$)/.test(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
  );

test.use({
  launchOptions: {
    args: [
      "--use-fake-device-for-media-stream",
      "--use-fake-ui-for-media-stream",
    ],
  },
});

function hashPin(pin: string) {
  const pepper = process.env.PIN_HASH_PEPPER!;
  const saltHex = randomBytes(16).toString("hex");
  const keyHex = scryptSync(`${pin}${pepper}`, saltHex, 32).toString("hex");
  return `s1:${saltHex}:${keyHex}`;
}

function installFakeRecorder(page: Page) {
  return page.addInitScript(() => {
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: {
        getUserMedia: async () => ({
          getTracks: () => [{ stop: () => undefined }],
        }),
      },
    });

    class FakeMediaRecorder {
      state = "inactive";
      mimeType = "audio/webm";
      ondataavailable: ((event: { data: Blob }) => void) | null = null;
      onstop: (() => void) | null = null;
      onerror: (() => void) | null = null;

      static isTypeSupported() {
        return true;
      }

      constructor(_stream: unknown, options?: { mimeType?: string }) {
        this.mimeType = options?.mimeType ?? "audio/webm";
      }

      start() {
        this.state = "recording";
      }

      stop() {
        if (this.state === "inactive") return;
        this.state = "inactive";
        this.ondataavailable?.({
          data: new Blob(["e2e-audio"], { type: this.mimeType }),
        });
        this.onstop?.();
      }
    }

    Object.defineProperty(window, "MediaRecorder", {
      configurable: true,
      value: FakeMediaRecorder,
    });
    Object.defineProperty(window, "AudioContext", {
      configurable: true,
      value: undefined,
    });
  });
}

async function mockPronunciationProviders(
  page: Page,
  clipIds: string[],
  options: { firstAudioError?: string } = {},
) {
  let firstAudioError = options.firstAudioError;
  await page.route("**/student/pronunciation/**/word-audio", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        audioUrl: "data:audio/mpeg;base64,SUQz",
        mimeType: "audio/mpeg",
      }),
    });
  });

  await page.route("**/student/pronunciation/**/audio", async (route) => {
    if (firstAudioError) {
      const error = firstAudioError;
      firstAudioError = undefined;
      await route.fulfill({
        status: 502,
        contentType: "application/json",
        body: JSON.stringify({ ok: false, error }),
      });
      return;
    }
    const audioClipId = clipIds.shift();
    if (!audioClipId) {
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ ok: false, error: "unexpected_audio_call" }),
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        audioClipId,
        tryNumber: 1,
        transcript: "practice-word",
        outcome: "passed",
        starBand: 3,
        fullWordPassed: true,
        targetSoundAccuracy: 90,
        targetSoundPassed: true,
        feedback: "Your fff was strong!",
      }),
    });
  });

  // This intercept is the OpenAI TTS test double. The pronunciation upload
  // intercept above is an HTTP upload-route double; it bypasses server
  // persistence and provider work. Word evidence is seeded below instead.
  await page.route("**/student/missions/**/tts", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        audioUrl: "data:audio/mpeg;base64,SUQz",
        mimeType: "audio/mpeg",
      }),
    });
  });
}

function createAdmin() {
  return createClient(
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
}

function practiceEntries() {
  return PRONUNCIATION_WORD_BANK
    .filter((entry) => entry.soundId === "f" && entry.difficulty === "easy")
    .sort((a, b) => a.text.localeCompare(b.text, "en-US"))
    .slice(0, 5);
}

async function seedWordAudioCache(
  admin: ReturnType<typeof createAdmin>,
  entries: ReturnType<typeof practiceEntries>,
  stamp: number,
) {
  const rows = entries.map((entry) => {
    const spec = buildPronunciationWordAudioSpec({
      word: entry.text,
      phones: entry.phones,
    });
    return {
      content_hash: spec.contentHash,
      provider: spec.provider,
      model: spec.model,
      voice: spec.voice,
      response_format: spec.format,
      character_id: spec.characterId,
      object_key: `e2e/pronunciation/${stamp}/${entry.text}.mp3`,
      mime_type: "audio/mpeg",
      byte_size: 4,
    };
  });
  const existing = await admin
    .from("tts_audio_cache")
    .select("content_hash")
    .in("content_hash", rows.map((row) => row.content_hash));
  expect(existing.error).toBeNull();
  const existingHashes = new Set(
    (existing.data ?? []).map((row) => row.content_hash),
  );
  const missingRows = rows.filter((row) => !existingHashes.has(row.content_hash));
  if (missingRows.length > 0) {
    const result = await admin
      .from("tts_audio_cache")
      .insert(missingRows);
    expect(result.error).toBeNull();
  }
  return missingRows;
}

async function seedCompletedWordEvidence(
  admin: ReturnType<typeof createAdmin>,
  assignmentStudentId: string,
  entries: ReturnType<typeof practiceEntries>,
  stamp: number,
  audioClipIds: string[],
  indexes: number[],
) {
  const assignment = await admin
    .from("assignment_students")
    .select("latest_attempt_id")
    .eq("id", assignmentStudentId)
    .single();
  expect(assignment.error).toBeNull();
  const attemptId = assignment.data!.latest_attempt_id as string;

  const turns = await admin
    .from("attempt_turns")
    .select("id, turn_order")
    .eq("attempt_id", attemptId)
    .order("turn_order", { ascending: true });
  expect(turns.error).toBeNull();

  const clips = entries.flatMap((entry, index) => {
    if (!indexes.includes(index)) return [];
    const audioClipId = audioClipIds[index];
    const tryId = randomUUID();
    const objectKey = `e2e/pronunciation/${stamp}/${audioClipId}.webm`;
    return [{ entry, turn: turns.data![index], audioClipId, tryId, objectKey }];
  });

  const storage = admin.storage.from("student-audio");
  for (const clip of clips) {
    const upload = await storage.upload(
      clip.objectKey,
      Buffer.from("e2e-audio"),
      { contentType: "audio/webm", upsert: true },
    );
    expect(upload.error).toBeNull();
  }

  const clipInsert = await admin.from("audio_clips").insert(
    clips.map((clip) => ({
      id: clip.audioClipId,
      attempt_turn_id: clip.turn.id,
      clip_kind: "original_answer",
      object_key: clip.objectKey,
      mime_type: "audio/webm",
      duration_ms: 1000,
      byte_size: 9,
      processing_status: "transcribed",
    })),
  );
  expect(clipInsert.error).toBeNull();

  const scoresInsert = await admin.from("pronunciation_scores").insert(
    clips.map((clip) => ({
      audio_clip_id: clip.audioClipId,
      provider: "e2e-double",
      reference_text: clip.entry.text,
      accuracy_score: 90,
      fluency_score: 90,
      completeness_score: 90,
      pronunciation_score: 90,
      star_band: 3,
      word_scores: [
        {
          word: clip.entry.text,
          accuracyScore: 90,
          errorType: "None",
          phonemes: [
            { phoneme: clip.entry.targetArpabet, accuracyScore: 90 },
          ],
        },
      ],
    })),
  );
  expect(scoresInsert.error).toBeNull();

  const triesInsert = await admin.from("pronunciation_word_tries").insert(
    clips.map((clip, index) => ({
      id: clip.tryId,
      attempt_turn_id: clip.turn.id,
      audio_clip_id: clip.audioClipId,
      try_number: 1,
      transcript: clip.entry.text,
      outcome: "passed",
      word_accuracy: 90,
      star_band: 3,
      full_word_passed: true,
      target_sound_accuracy: 90,
      target_sound_passed: true,
      transcription_evidence: { model: "e2e-double" },
      created_at: new Date(Date.now() + index).toISOString(),
    })),
  );
  expect(triesInsert.error).toBeNull();

  return clips.map((clip) => clip.objectKey);
}

async function recordWord(
  page: Page,
  options: { retryMessage?: string } = {},
) {
  await expect(page.getByRole("button", { name: "Hear the word" })).toBeEnabled();
  await page.getByRole("button", { name: "Record", exact: true }).click();
  await page.getByRole("button", { name: "Stop recording" }).click();
  if (options.retryMessage) {
    await expect(page.getByTestId("pronunciation-practice-card").getByRole("alert")).toHaveText(options.retryMessage);
    await page.getByRole("button", { name: "Record again" }).click();
    await page.getByRole("button", { name: "Stop recording" }).click();
  }
  await expect(page.getByText("Your fff was strong!", { exact: true }).first()).toBeVisible();
}

test("teacher-to-student pronunciation practice path stays resumable and reviewable", async ({
  page,
}) => {
  test.setTimeout(180_000);
  if (
    process.env.E2E_PRONUNCIATION !== "true" ||
    !SUPABASE_READY ||
    !SUPABASE_IS_LOCAL
  ) {
    test.skip(
      true,
      "Set E2E_PRONUNCIATION=true with a local Supabase database that has the approved pronunciation migration.",
    );
    return;
  }

  const admin = createAdmin();
  const entries = practiceEntries();
  const stamp = Date.now();
  const email = `pronunciation-${stamp}@example.test`;
  const password = "Pronunciation-E2E!";
  const joinCode = `PR${String(stamp).slice(-4)}F`;
  const studentName = `Pronunciation Student ${stamp}`;
  const pin = "2468";
  let userId: string | null = null;
  let profileId: string | null = null;
  let assignmentStudentId: string | null = null;
  const audioObjectKeys: string[] = [];
  const cacheRows = await seedWordAudioCache(admin, entries, stamp);

  try {
    const user = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    expect(user.error).toBeNull();
    userId = user.data.user!.id;

    const profile = await admin
      .from("teacher_profiles")
      .insert({
        auth_user_id: userId,
        display_name: `Pronunciation Teacher ${stamp}`,
      })
      .select("id")
      .single();
    expect(profile.error).toBeNull();
    profileId = profile.data!.id;

    const klass = await admin
      .from("classes")
      .insert({
        teacher_id: profileId,
        name: `Pronunciation Class ${stamp}`,
        join_code: joinCode,
        data_mode: "real",
      })
      .select("id")
      .single();
    expect(klass.error).toBeNull();

    const student = await admin
      .from("students")
      .insert({
        class_id: klass.data!.id,
        display_name: studentName.toLowerCase(),
        pin_hash: hashPin(pin),
      })
      .select("id")
      .single();
    expect(student.error).toBeNull();

    const teacherPage = await page.context().newPage();
    await teacherPage.goto("/auth/login");
    await teacherPage.getByLabel("Email").fill(email);
    await teacherPage.getByLabel("Password").fill(password);
    await teacherPage.getByRole("button", { name: "Log in" }).click();
    await expect(teacherPage).toHaveURL(/\/teacher$/u);
    await teacherPage.goto(`/teacher/students/${student.data!.id}`);
    await teacherPage
      .getByRole("link", { name: "Assign pronunciation practice" })
      .click();
    await teacherPage.getByRole("button", { name: "F /f/" }).click();
    await expect(teacherPage.getByText(entries[0].text, { exact: true })).toBeVisible();
    await teacherPage.getByRole("button", { name: "Assign practice" }).click();
    await expect(teacherPage).toHaveURL(/\/teacher\/students\/[^/]+$/u);

    const assignmentStudent = await admin
      .from("assignment_students")
      .select("id")
      .eq("student_id", student.data!.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();
    expect(assignmentStudent.error).toBeNull();
    assignmentStudentId = assignmentStudent.data!.id;

    await installFakeRecorder(page);
    const clipIds = entries.map(() => randomUUID());
    await mockPronunciationProviders(page, [...clipIds], {
      firstAudioError: "scoring_failed",
    });

    await page.goto("/join");
    await page.getByLabel(/class code/i).fill(joinCode);
    await page.getByRole("button", { name: "Join" }).click();
    await page.getByLabel(/name/i).fill(studentName);
    await page.getByLabel("4-digit PIN").fill(pin);
    await page.getByRole("button", { name: "Unlock homework" }).click();
    await expect(page.getByText("F Sound Practice", { exact: true })).toBeVisible();
    await page
      .getByRole("link", { name: "Start practice" })
      .dispatchEvent("click");
    await expect(page.getByLabel("0 of 5 words completed")).toBeVisible();
    await expect(page.getByRole("button", { name: "Hear the word" })).toBeEnabled();

    // One valid try is enough to prove resume state; the remaining four are
    // completed in the same run. All provider calls are browser route doubles.
    await recordWord(page, {
      retryMessage: "We couldn't check that recording. Try again.",
    });
    audioObjectKeys.push(
      ...(await seedCompletedWordEvidence(
        admin,
        assignmentStudentId!,
        entries,
        stamp,
        clipIds,
        [0],
      )),
    );
    await page.reload();
    await expect(page.getByLabel("1 of 5 words completed")).toBeVisible();

    for (let index = 1; index < entries.length; index += 1) {
      if (index === entries.length - 1) {
        audioObjectKeys.push(
          ...(await seedCompletedWordEvidence(
            admin,
            assignmentStudentId!,
            entries,
            stamp,
            clipIds,
            [index],
          )),
        );
      }
      await recordWord(page);
      if (index < entries.length - 1) {
        audioObjectKeys.push(
          ...(await seedCompletedWordEvidence(
            admin,
            assignmentStudentId!,
            entries,
            stamp,
            clipIds,
            [index],
          )),
        );
        await page.getByRole("button", { name: "Next word" }).click();
        await expect(page.getByLabel(`${index + 1} of 5 words completed`)).toBeVisible();
      }
    }
    await page.getByRole("button", { name: "Next word" }).click();
    await expect(
      page.getByLabel("Pronunciation practice result"),
    ).toBeVisible();

    await teacherPage.goto("/teacher");
    await expect(teacherPage.getByText("5 of 5 words passed", { exact: true })).toBeVisible();
    await teacherPage.getByText("F Sound Practice", { exact: true }).click();
    await expect(teacherPage.getByRole("heading", { name: /Word 1:/ })).toBeVisible();
    await expect(teacherPage.getByText("First try audio", { exact: true })).toHaveCount(5);
    // Every word passed on its only try, so the result recording is the first
    // try and the view shows it once.
    await expect(teacherPage.getByText("Result audio", { exact: true })).toHaveCount(0);
    await expect(teacherPage.getByRole("button", { name: "Request retry" })).toBeVisible();
    await expect(teacherPage.getByRole("button", { name: "Mark as done" })).toBeVisible();
    await teacherPage.close();
  } finally {
    if (profileId) {
      const cleanup = await admin
        .from("teacher_profiles")
        .delete()
        .eq("id", profileId);
      expect.soft(cleanup.error).toBeNull();
    }
    if (userId) {
      const cleanup = await admin.auth.admin.deleteUser(userId);
      expect.soft(cleanup.error).toBeNull();
    }
    if (cacheRows.length > 0) {
      const cacheCleanup = await admin
        .from("tts_audio_cache")
        .delete()
        .in("content_hash", cacheRows.map((row) => row.content_hash));
      expect.soft(cacheCleanup.error).toBeNull();
    }
    if (audioObjectKeys.length > 0) {
      const audioCleanup = await admin.storage
        .from("student-audio")
        .remove(audioObjectKeys);
      expect.soft(audioCleanup.error).toBeNull();
    }
  }
});
