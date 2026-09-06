import { randomBytes } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import type { PronunciationPracticeSnapshot } from "@/domain/pronunciation/practice";
import type { Database } from "@/lib/db/types";
import { buildStudentAudioObjectKey, getStudentAudioBucketId } from "@/server/student-access/audio-storage";
import {
  completePronunciationAttempt,
  getPronunciationPracticePage,
  startOrResumePronunciationAttempt,
} from "@/server/student-access/pronunciation-flow";
import {
  uploadPronunciationTry,
  type PronunciationUploadDeps,
} from "@/server/student-access/pronunciation-upload";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const canRunLocally =
  /^(https?:\/\/)?(127\.0\.0\.1|localhost)(:\d+)?(?:\/|$)/.test(url) &&
  Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY &&
      process.env.SUPABASE_SERVICE_ROLE_KEY,
  );

const noRealtime = {
  realtime: {
    transport: class {
      constructor() {}
      close() {}
    } as unknown as never,
  },
};

type AdminClient = SupabaseClient<Database>;

type Fixture = {
  admin: AdminClient;
  teacherId: string;
  classId: string;
  ownerStudentId: string;
  otherStudentId: string;
  assignmentId: string;
  assignmentStudentId: string;
  snapshot: PronunciationPracticeSnapshot;
};

async function createAdminClient(): Promise<AdminClient> {
  const { createClient } = await import("@supabase/supabase-js");
  return createClient<Database>(url, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
    ...noRealtime,
  });
}

function requireId(result: { data: { id: string } | null; error: unknown }) {
  if (result.error || !result.data) throw new Error("fixture insert failed");
  return result.data.id;
}

function practiceSnapshot(): PronunciationPracticeSnapshot {
  const words = ["fan", "fish", "fox", "fun", "five"];
  return {
    kind: "pronunciation",
    version: 1,
    soundId: "f",
    difficulty: "easy",
    requiredWords: 5,
    soundClipVersion: "v1",
    words: words.map((text, index) => ({
      order: (index + 1) as 1 | 2 | 3 | 4 | 5,
      text,
      highlightStart: 0,
      highlightLength: 1,
      source: "verified",
      pronunciation: {
        phones: ["F", "AE1", "N"],
        targetPhoneIndex: 0,
        cmuVariant: 1,
      },
      wordAudio: {
        schemaVersion: 1,
        contentHash: `integration-${text}`,
        voice: "en-US-AvaNeural",
        format: "audio-24khz-48kbitrate-mono-mp3",
      },
    })),
  };
}

async function createFixture(): Promise<Fixture> {
  const admin = await createAdminClient();
  const suffix = randomBytes(12).toString("hex");
  let teacherId: string | null = null;
  try {
    const teacher = await admin
      .from("teacher_profiles")
      .insert({ display_name: `Pronunciation integration ${suffix}` })
      .select("id")
      .single();
    teacherId = teacher.data?.id ?? null;
    const ownerTeacherId = requireId(teacher);
    const classId = requireId(
      await admin
        .from("classes")
        .insert({
          teacher_id: ownerTeacherId,
          name: `Pronunciation integration class ${suffix}`,
          join_code: `P${suffix}`.slice(0, 12),
          data_mode: "real",
        })
        .select("id")
        .single(),
    );
    const students = await admin
      .from("students")
      .insert([
        { class_id: classId, display_name: `Owner ${suffix}` },
        { class_id: classId, display_name: `Other ${suffix}` },
      ])
      .select("id");
    if (students.error || !students.data || students.data.length !== 2) {
      throw new Error("student fixture insert failed");
    }
    const snapshot = practiceSnapshot();
    const assignmentId = requireId(
      await admin
        .from("assignments")
        .insert({
          class_id: classId,
          mission_id: null,
          assignment_kind: "pronunciation",
          title: `F Sound Practice ${suffix}`,
          mission_snapshot: snapshot,
          data_mode: "real",
        })
        .select("id")
        .single(),
    );
    const assignmentStudentId = requireId(
      await admin
        .from("assignment_students")
        .insert({
          assignment_id: assignmentId,
          student_id: students.data[0].id,
          status: "assigned",
        })
        .select("id")
        .single(),
    );

    return {
      admin,
      teacherId: ownerTeacherId,
      classId,
      ownerStudentId: students.data[0].id,
      otherStudentId: students.data[1].id,
      assignmentId,
      assignmentStudentId,
      snapshot,
    };
  } catch (error) {
    if (teacherId) {
      await admin.from("teacher_profiles").delete().eq("id", teacherId);
    }
    throw error;
  }
}

function providerDoubles(snapshot: PronunciationPracticeSnapshot) {
  const calls = { transcription: 0, scoring: 0 };
  const deps: PronunciationUploadDeps = {
    consumeRequestBudget: async () => ({ allowed: true }),
    transcribeAudioFile: async () => {
      const word = snapshot.words[calls.transcription];
      if (!word) throw new Error("unexpected transcription call");
      calls.transcription += 1;
      return {
        ok: true,
        text: word.text,
        koreanSpans: [],
        model: "integration-double",
        confidence: { minLogprob: -0.01, tokenCount: 1 },
      };
    },
    scorePronunciation: async ({ referenceText }) => {
      calls.scoring += 1;
      return {
        ok: true,
        score: {
          accuracyScore: 90,
          fluencyScore: 90,
          completenessScore: 90,
          pronunciationScore: 90,
          starBand: 3,
          referenceText,
          wordScores: [
            {
              word: referenceText,
              accuracyScore: 90,
              errorType: "None",
              phonemes: [{ phoneme: "f", accuracyScore: 90 }],
            },
          ],
        },
      };
    },
  };
  return { calls, deps };
}

async function cleanupFixture(
  fixture: Fixture,
  objectKeys: string[],
  attemptId: string | null,
) {
  const allObjectKeys = new Set(objectKeys);
  if (attemptId) {
    const turns = await fixture.admin
      .from("attempt_turns")
      .select("id, turn_order")
      .eq("attempt_id", attemptId);
    expect.soft(turns.error).toBeNull();
    const turnOrders = new Map(
      (turns.data ?? []).map((turn) => [turn.id, turn.turn_order]),
    );
    if (turnOrders.size > 0) {
      const clips = await fixture.admin
        .from("audio_clips")
        .select("id, attempt_turn_id, clip_kind, object_key, mime_type")
        .in("attempt_turn_id", [...turnOrders.keys()]);
      expect.soft(clips.error).toBeNull();
      for (const clip of clips.data ?? []) {
        if (clip.object_key) {
          allObjectKeys.add(clip.object_key);
          continue;
        }
        const turnOrder = turnOrders.get(clip.attempt_turn_id);
        if (turnOrder) {
          allObjectKeys.add(
            buildStudentAudioObjectKey({
              assignmentStudentId: fixture.assignmentStudentId,
              attemptId,
              turnOrder,
              clipKind: clip.clip_kind,
              audioClipId: clip.id,
              mimeType: clip.mime_type ?? "audio/webm",
            }),
          );
        }
      }
    }
  }
  if (allObjectKeys.size > 0) {
    const removed = await fixture.admin
      .storage
      .from(getStudentAudioBucketId())
      .remove([...allObjectKeys]);
    expect.soft(removed.error).toBeNull();
  }
  const removed = await fixture.admin
    .from("teacher_profiles")
    .delete()
    .eq("id", fixture.teacherId);
  expect.soft(removed.error).toBeNull();
}

describe("pronunciation practice server flow", () => {
  it("persists owned tries, resumes them, and completes the practice in local Supabase", async (context) => {
    if (!canRunLocally) return context.skip();

    const fixture = await createFixture();
    const providers = providerDoubles(fixture.snapshot);
    const file = new Blob(["pronunciation-integration"], { type: "audio/webm" });
    const objectKeys: string[] = [];
    const audioClipIds: string[] = [];
    let attemptId: string | null = null;

    try {
      const started = await startOrResumePronunciationAttempt({
        studentId: fixture.ownerStudentId,
        assignmentStudentId: fixture.assignmentStudentId,
      });
      expect(started).toMatchObject({ ok: true, isResume: false });
      if (!started.ok) throw new Error("attempt did not start");
      attemptId = started.attemptId;

      const turns = await fixture.admin
        .from("attempt_turns")
        .select("id, turn_order")
        .eq("attempt_id", started.attemptId)
        .order("turn_order", { ascending: true });
      expect(turns.error).toBeNull();
      expect(turns.data).toHaveLength(5);
      const firstTurn = turns.data?.[0];
      if (!firstTurn) throw new Error("first turn was not created");

      const foreignBefore = await fixture.admin
        .from("audio_clips")
        .select("id", { count: "exact", head: true })
        .eq("attempt_turn_id", firstTurn.id);
      expect(foreignBefore.error).toBeNull();
      expect(foreignBefore.count).toBe(0);

      const foreign = await uploadPronunciationTry(
        {
          studentId: fixture.otherStudentId,
          assignmentStudentId: fixture.assignmentStudentId,
          attemptId: started.attemptId,
          turnOrder: 1,
          file,
          mimeType: "audio/webm",
          durationMs: 1_000,
          byteSize: file.size,
        },
        providers.deps,
      );
      expect(foreign).toEqual({ ok: false, error: "not_found", retryable: false });
      expect(providers.calls).toEqual({ transcription: 0, scoring: 0 });
      const foreignAfter = await fixture.admin
        .from("audio_clips")
        .select("id", { count: "exact", head: true })
        .eq("attempt_turn_id", firstTurn.id);
      expect(foreignAfter.error).toBeNull();
      expect(foreignAfter.count).toBe(0);

      const firstTry = await uploadPronunciationTry(
        {
          studentId: fixture.ownerStudentId,
          assignmentStudentId: fixture.assignmentStudentId,
          attemptId: started.attemptId,
          turnOrder: 1,
          file,
          mimeType: "audio/webm",
          durationMs: 1_000,
          byteSize: file.size,
        },
        providers.deps,
      );
      expect(firstTry).toMatchObject({
        ok: true,
        tryNumber: 1,
        outcome: "passed",
        transcript: "fan",
        fullWordPassed: true,
        targetSoundPassed: true,
      });
      if (!firstTry.ok) throw new Error("first try did not persist");
      audioClipIds.push(firstTry.audioClipId);
      objectKeys.push(
        buildStudentAudioObjectKey({
          assignmentStudentId: fixture.assignmentStudentId,
          attemptId: started.attemptId,
          turnOrder: 1,
          clipKind: "original_answer",
          audioClipId: firstTry.audioClipId,
          mimeType: "audio/webm",
        }),
      );

      const resumed = await getPronunciationPracticePage({
        studentId: fixture.ownerStudentId,
        assignmentStudentId: fixture.assignmentStudentId,
      });
      expect(resumed).toMatchObject({
        ok: true,
        page: {
          attemptId: started.attemptId,
          isResume: true,
          currentWordOrder: 2,
          passedWordCount: 1,
          finishedWordCount: 1,
        },
      });
      if (!resumed.ok) throw new Error("attempt did not resume");
      expect(resumed.page.words[0]).toMatchObject({
        validTryCount: 1,
        passed: true,
        resultTry: { outcome: "passed" },
      });

      for (const word of fixture.snapshot.words.slice(1)) {
        const result = await uploadPronunciationTry(
          {
            studentId: fixture.ownerStudentId,
            assignmentStudentId: fixture.assignmentStudentId,
            attemptId: started.attemptId,
            turnOrder: word.order,
            file,
            mimeType: "audio/webm",
            durationMs: 1_000,
            byteSize: file.size,
          },
          providers.deps,
        );
        expect(result).toMatchObject({
          ok: true,
          tryNumber: 1,
          outcome: "passed",
          transcript: word.text,
        });
        if (!result.ok) throw new Error("try did not persist");
        audioClipIds.push(result.audioClipId);
        objectKeys.push(
          buildStudentAudioObjectKey({
            assignmentStudentId: fixture.assignmentStudentId,
            attemptId: started.attemptId,
            turnOrder: word.order,
            clipKind: "original_answer",
            audioClipId: result.audioClipId,
            mimeType: "audio/webm",
          }),
        );
      }

      expect(providers.calls).toEqual({ transcription: 5, scoring: 5 });
      const clips = await fixture.admin
        .from("audio_clips")
        .select("id, clip_kind, object_key, mime_type, duration_ms, byte_size, processing_status")
        .in("id", audioClipIds);
      expect(clips.error).toBeNull();
      expect(clips.data).toHaveLength(5);
      expect(clips.data?.every((clip) =>
        clip.clip_kind === "original_answer" &&
        clip.processing_status === "transcribed" &&
        clip.mime_type === "audio/webm" &&
        clip.duration_ms === 1_000 &&
        clip.byte_size === file.size &&
        typeof clip.object_key === "string" &&
        objectKeys.includes(clip.object_key),
      )).toBe(true);

      const firstObjectKey = objectKeys[0];
      if (!firstObjectKey) throw new Error("audio object was not keyed");
      const storedAudio = await fixture.admin
        .storage
        .from(getStudentAudioBucketId())
        .download(firstObjectKey);
      expect(storedAudio.error).toBeNull();
      expect(storedAudio.data).not.toBeNull();

      const tries = await fixture.admin
        .from("pronunciation_word_tries")
        .select("audio_clip_id, try_number, transcript, outcome, word_accuracy, star_band, full_word_passed, target_sound_accuracy, target_sound_passed")
        .in("audio_clip_id", audioClipIds);
      expect(tries.error).toBeNull();
      expect(tries.data).toHaveLength(5);
      expect(tries.data?.every((wordTry) =>
        wordTry.try_number === 1 &&
        wordTry.outcome === "passed" &&
        wordTry.word_accuracy === 90 &&
        wordTry.star_band === 3 &&
        wordTry.full_word_passed === true &&
        wordTry.target_sound_accuracy === 90 &&
        wordTry.target_sound_passed === true,
      )).toBe(true);
      expect(new Set(tries.data?.map((wordTry) => wordTry.transcript))).toEqual(
        new Set(fixture.snapshot.words.map((word) => word.text)),
      );

      const canceledBeforeCompletion = await fixture.admin
        .from("assignments")
        .update({ canceled_at: new Date().toISOString() })
        .eq("id", fixture.assignmentId);
      expect(canceledBeforeCompletion.error).toBeNull();

      const blockedCompletion = await fixture.admin.rpc(
        "complete_pronunciation_attempt",
        {
          p_student_id: fixture.ownerStudentId,
          p_assignment_student_id: fixture.assignmentStudentId,
          p_attempt_id: started.attemptId,
        },
      );
      expect(blockedCompletion.error).toBeNull();
      expect(blockedCompletion.data).toBe("not_found");

      const blockedState = await Promise.all([
        fixture.admin
          .from("assignment_students")
          .select("status")
          .eq("id", fixture.assignmentStudentId)
          .single(),
        fixture.admin
          .from("attempts")
          .select("status")
          .eq("id", started.attemptId)
          .single(),
      ]);
      expect(blockedState[0].data?.status).toBe("started");
      expect(blockedState[1].data?.status).toBe("in_progress");

      const uncanceled = await fixture.admin
        .from("assignments")
        .update({ canceled_at: null })
        .eq("id", fixture.assignmentId);
      expect(uncanceled.error).toBeNull();

      const cancellationClient = await createAdminClient();
      let timeoutId: ReturnType<typeof setTimeout> | undefined;
      const operations = Promise.all([
        fixture.admin.rpc("complete_pronunciation_attempt", {
          p_student_id: fixture.ownerStudentId,
          p_assignment_student_id: fixture.assignmentStudentId,
          p_attempt_id: started.attemptId,
        }),
        cancellationClient
          .from("assignments")
          .update({ canceled_at: new Date().toISOString() })
          .eq("id", fixture.assignmentId),
      ]);
      const timeout = new Promise<never>((_, reject) => {
        timeoutId = setTimeout(
          () => reject(new Error("pronunciation completion/cancellation deadlocked")),
          5_000,
        );
      });

      let raceResult: Awaited<typeof operations>;
      try {
        raceResult = await Promise.race([operations, timeout]);
      } finally {
        if (timeoutId) clearTimeout(timeoutId);
      }

      expect(raceResult[0].error).toBeNull();
      expect(["ok", "not_found"]).toContain(raceResult[0].data);
      expect(raceResult[1].error).toBeNull();

      const raceState = await Promise.all([
        fixture.admin
          .from("assignments")
          .select("canceled_at")
          .eq("id", fixture.assignmentId)
          .single(),
        fixture.admin
          .from("assignment_students")
          .select("status")
          .eq("id", fixture.assignmentStudentId)
          .single(),
        fixture.admin
          .from("attempts")
          .select("status")
          .eq("id", started.attemptId)
          .single(),
        fixture.admin
          .from("assignment_status_events")
          .select("reason_code" as never)
          .eq("assignment_student_id", fixture.assignmentStudentId)
          .order("created_at", { ascending: true }),
      ]);
      expect(raceState[0].error).toBeNull();
      expect(raceState[0].data?.canceled_at).not.toBeNull();
      expect(raceState[1].error).toBeNull();
      expect(raceState[2].error).toBeNull();
      expect(raceState[3].error).toBeNull();

      const raceEventReasons = (raceState[3].data ?? []).map(
        (event) => (event as unknown as { reason_code: string }).reason_code,
      );
      if (raceResult[0].data === "ok") {
        expect(raceState[1].data?.status).toBe("teacher_review");
        expect(raceState[2].data?.status).toBe("teacher_review");
        expect(raceEventReasons).toEqual([
          "pronunciation_practice_started",
          "pronunciation_practice_completed",
        ]);
      } else {
        expect(raceState[1].data?.status).toBe("started");
        expect(raceState[2].data?.status).toBe("in_progress");
        expect(raceEventReasons).toEqual(["pronunciation_practice_started"]);
      }

      const raceUncanceled = await fixture.admin
        .from("assignments")
        .update({ canceled_at: null })
        .eq("id", fixture.assignmentId);
      expect(raceUncanceled.error).toBeNull();

      const completed = await completePronunciationAttempt({
        studentId: fixture.ownerStudentId,
        assignmentStudentId: fixture.assignmentStudentId,
        attemptId: started.attemptId,
      });
      expect(completed).toEqual({ ok: true });

      const repeated = await completePronunciationAttempt({
        studentId: fixture.ownerStudentId,
        assignmentStudentId: fixture.assignmentStudentId,
        attemptId: started.attemptId,
      });
      expect(repeated).toEqual({ ok: true });

      const assignmentState = (await fixture.admin
        .from("assignment_students")
        .select("status, attempt_count, latest_attempt_id, submitted_at" as never)
        .eq("id", fixture.assignmentStudentId)
        .single()) as unknown as {
        data: {
          status: string;
          attempt_count: number;
          latest_attempt_id: string | null;
          submitted_at: string | null;
        } | null;
        error: unknown;
      };
      expect(assignmentState.error).toBeNull();
      expect(assignmentState.data).toMatchObject({
        status: "teacher_review",
        attempt_count: 1,
        latest_attempt_id: started.attemptId,
      });
      expect(assignmentState.data?.submitted_at).not.toBeNull();

      const attemptState = await fixture.admin
        .from("attempts")
        .select("status, needs_review_reason, completed_at")
        .eq("id", started.attemptId)
        .single();
      expect(attemptState.error).toBeNull();
      expect(attemptState.data).toMatchObject({
        status: "teacher_review",
        needs_review_reason: "pronunciation_practice",
      });
      expect(attemptState.data?.completed_at).not.toBeNull();

      const canceledAfterCompletion = await fixture.admin
        .from("assignments")
        .update({ canceled_at: new Date().toISOString() })
        .eq("id", fixture.assignmentId);
      expect(canceledAfterCompletion.error).toBeNull();

      const blockedRetry = await fixture.admin.rpc(
        "complete_pronunciation_attempt",
        {
          p_student_id: fixture.ownerStudentId,
          p_assignment_student_id: fixture.assignmentStudentId,
          p_attempt_id: started.attemptId,
        },
      );
      expect(blockedRetry.error).toBeNull();
      expect(blockedRetry.data).toBe("not_found");

      const preservedState = await Promise.all([
        fixture.admin
          .from("assignment_students")
          .select("status")
          .eq("id", fixture.assignmentStudentId)
          .single(),
        fixture.admin
          .from("attempts")
          .select("status, completed_at")
          .eq("id", started.attemptId)
          .single(),
      ]);
      expect(preservedState[0].data?.status).toBe("teacher_review");
      expect(preservedState[1].data?.status).toBe("teacher_review");
      expect(preservedState[1].data?.completed_at).not.toBeNull();

      const events = (await fixture.admin
        .from("assignment_status_events")
        .select("reason_code" as never)
        .eq("assignment_student_id", fixture.assignmentStudentId)
        .order("created_at", { ascending: true })) as unknown as {
        data: Array<{ reason_code: string }> | null;
        error: unknown;
      };
      expect(events.error).toBeNull();
      expect(events.data?.map((event) => event.reason_code)).toEqual([
        "pronunciation_practice_started",
        "pronunciation_practice_completed",
      ]);
    } finally {
      await cleanupFixture(fixture, objectKeys, attemptId);
    }
  }, 30_000);
});
