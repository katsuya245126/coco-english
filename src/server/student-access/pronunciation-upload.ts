import type { Json } from "@/lib/db/types";
import {
  ALLOWED_AUDIO_MIME_TYPES,
  MAX_AUDIO_BYTES,
} from "@/server/student-access/audio-upload";
import {
  buildStudentAudioObjectKey,
  getStudentAudioBucketId,
} from "@/server/student-access/audio-storage";
import { createSupabaseServiceClient } from "@/lib/supabase/server";
import {
  gradePronunciationTry,
  pronunciationPracticeSnapshotSchema,
  type PracticeTryOutcome,
  type PronunciationPracticeSnapshot,
} from "@/domain/pronunciation/practice";
import {
  hasEnglishTranscript,
  normalizeEnglishTranscript,
  transcribeAudioFile,
} from "@/server/audio/transcription";
import {
  scorePronunciation,
  type PronunciationScoreResult,
} from "@/server/audio/pronunciation-scorer";
import { isLowConfidenceTranscript } from "@/domain/audio/transcript-confidence";
import { consumeRequestBudget } from "@/server/security/request-budget";

export const MAX_PRONUNCIATION_DURATION_MS = 10_000;

type Client = ReturnType<typeof createSupabaseServiceClient>;

export type UploadPronunciationTryInput = {
  studentId: string;
  assignmentStudentId: string;
  attemptId: string;
  turnOrder: number;
  file: Blob;
  mimeType: string;
  durationMs: number;
  byteSize: number;
};

export type PronunciationUploadFailure = {
  ok: false;
  error:
    | "not_found"
    | "invalid_audio"
    | "out_of_order"
    | "word_finished"
    | "upload_failed"
    | "transcription_failed"
    | "unclear_transcript"
    | "scoring_failed"
    | "db_error"
    | "rate_limited";
  retryable: boolean;
  retryAfterSeconds?: number;
};

export type PronunciationUploadResult =
  | {
      ok: true;
      audioClipId: string;
      tryNumber: 1 | 2 | 3;
      transcript: string;
      outcome: PracticeTryOutcome;
      starBand: 1 | 2 | 3 | null;
      fullWordPassed: boolean;
      targetSoundAccuracy: number | null;
      targetSoundPassed: boolean;
      feedback: string;
    }
  | PronunciationUploadFailure;

export type PronunciationUploadDeps = {
  consumeRequestBudget?: typeof consumeRequestBudget;
  transcribeAudioFile?: typeof transcribeAudioFile;
  scorePronunciation?: typeof scorePronunciation;
};

type OwnedPractice = {
  turnId: string;
  turns: Array<{ id: string; turn_order: number }>;
  snapshot: PronunciationPracticeSnapshot;
  turnTries: Map<string, Array<{ try_number: number; outcome: string }>>;
};

function one(value: unknown): Record<string, unknown> {
  if (Array.isArray(value)) {
    return (value[0] as Record<string, unknown> | undefined) ?? {};
  }
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : {};
}

function normalizedWord(value: string): string {
  return value.toLocaleLowerCase("en-US").replace(/[^a-z']/g, "");
}

function transcriptWords(value: string): string[] {
  return value.toLocaleLowerCase("en-US").match(/[a-z]+(?:'[a-z]+)?/g) ?? [];
}

function isSingleDifferentWord(transcript: string, expectedWord: string): boolean {
  const words = transcriptWords(transcript);
  return words.length === 1 && words[0] !== normalizedWord(expectedWord);
}

function validInput(input: UploadPronunciationTryInput): boolean {
  const mimeType = input.mimeType.toLowerCase().split(";")[0]?.trim();
  const fileMimeType = input.file.type.toLowerCase().split(";")[0]?.trim();
  return (
    input.file instanceof Blob &&
    input.file.size > 0 &&
    Number.isInteger(input.turnOrder) &&
    input.turnOrder > 0 &&
    Number.isInteger(input.durationMs) &&
    input.durationMs >= 0 &&
    input.durationMs <= MAX_PRONUNCIATION_DURATION_MS &&
    Number.isInteger(input.byteSize) &&
    input.byteSize === input.file.size &&
    input.byteSize <= MAX_AUDIO_BYTES &&
    Boolean(mimeType) &&
    ALLOWED_AUDIO_MIME_TYPES.has(mimeType) &&
    (!fileMimeType || fileMimeType === mimeType)
  );
}

function failure(
  error: PronunciationUploadFailure["error"],
  retryable: boolean,
  retryAfterSeconds?: number,
): PronunciationUploadFailure {
  return {
    ok: false,
    error,
    retryable,
    ...(retryAfterSeconds === undefined ? {} : { retryAfterSeconds }),
  };
}

async function loadOwnedPractice(
  supabase: Client,
  input: UploadPronunciationTryInput,
): Promise<OwnedPractice | null> {
  const assignmentResult = await supabase
    .from("assignment_students")
    .select(
      `id, student_id, status,
       assignments!inner(assignment_kind, mission_snapshot, canceled_at)`,
    )
    .eq("id", input.assignmentStudentId)
    .eq("student_id", input.studentId)
    .maybeSingle();
  if (assignmentResult.error || !assignmentResult.data) return null;

  const assignment = assignmentResult.data as unknown as Record<string, unknown>;
  const assignmentDetails = one(assignment.assignments);
  if (
    assignment.status !== "started" ||
    assignmentDetails.assignment_kind !== "pronunciation" ||
    assignmentDetails.canceled_at
  ) {
    return null;
  }

  const parsedSnapshot = pronunciationPracticeSnapshotSchema.safeParse(
    assignmentDetails.mission_snapshot,
  );
  if (!parsedSnapshot.success) return null;

  const attemptResult = await supabase
    .from("attempts")
    .select("id, assignment_student_id, status, assignment_students!attempts_assignment_student_id_fkey!inner(student_id)")
    .eq("id", input.attemptId)
    .eq("assignment_student_id", input.assignmentStudentId)
    .eq("assignment_students.student_id", input.studentId)
    .maybeSingle();
  if (
    attemptResult.error ||
    !attemptResult.data ||
    (attemptResult.data as { status?: string }).status !== "in_progress"
  ) {
    return null;
  }

  const turnsResult = await supabase
    .from("attempt_turns")
    .select(
      "id, turn_order, attempts!inner(assignment_students!attempts_assignment_student_id_fkey!inner(student_id))",
    )
    .eq("attempt_id", input.attemptId)
    .eq("attempts.assignment_students.student_id", input.studentId)
    .order("turn_order", { ascending: true });
  if (turnsResult.error) return null;

  const turnRows = (turnsResult.data ?? []) as unknown as Array<{
    id: string;
    turn_order: number;
  }>;
  const turnsByOrder = new Map(turnRows.map((turn) => [turn.turn_order, turn]));
  const currentTurn = turnsByOrder.get(input.turnOrder);
  if (!currentTurn) return null;

  const triesResult = await supabase
    .from("pronunciation_word_tries")
    .select(
      "attempt_turn_id, try_number, outcome, attempt_turns!inner(attempt_id, attempts!inner(assignment_students!attempts_assignment_student_id_fkey!inner(student_id)))",
    )
    .eq("attempt_turns.attempt_id", input.attemptId)
    .eq("attempt_turns.attempts.assignment_students.student_id", input.studentId)
    .order("try_number", { ascending: true });
  if (triesResult.error) return null;

  const turnTries = new Map<
    string,
    Array<{ try_number: number; outcome: string }>
  >();
  for (const raw of (triesResult.data ?? []) as unknown as Array<{
    attempt_turn_id: string;
    try_number: number;
    outcome: string;
  }>) {
    if (![1, 2, 3].includes(raw.try_number)) continue;
    const values = turnTries.get(raw.attempt_turn_id) ?? [];
    values.push({ try_number: raw.try_number, outcome: raw.outcome });
    turnTries.set(raw.attempt_turn_id, values);
  }

  return {
    turnId: currentTurn.id,
    turns: turnRows,
    snapshot: parsedSnapshot.data,
    turnTries,
  };
}

function nextWordOrder(
  snapshot: PronunciationPracticeSnapshot,
  turns: Array<{ id: string; turn_order: number }>,
  turnTries: Map<string, Array<{ try_number: number; outcome: string }>>,
) {
  return snapshot.words.find((word) => {
    const turn = turns.find((candidate) => candidate.turn_order === word.order);
    const tries = turn ? turnTries.get(turn.id) ?? [] : [];
    return (
      !tries.some((tryRow) => tryRow.outcome === "passed") &&
      !tries.some((tryRow) => tryRow.try_number === 3)
    );
  })?.order ?? null;
}

async function updateClip(
  supabase: Client,
  input: { audioClipId: string; turnId: string; status: "failed" | "transcribed"; objectKey?: string; mimeType: string; durationMs: number; byteSize: number },
) {
  return supabase
    .from("audio_clips")
    .update({
      ...(input.objectKey ? { object_key: input.objectKey } : {}),
      mime_type: input.mimeType,
      duration_ms: input.durationMs,
      byte_size: input.byteSize,
      processing_status: input.status,
    })
    .eq("id", input.audioClipId)
    .eq("attempt_turn_id", input.turnId);
}

function scoreWordForExpected(
  result: Extract<PronunciationScoreResult, { ok: true }>,
  expectedWord: string,
) {
  const expected = normalizedWord(expectedWord);
  return result.score.wordScores.find(
    (word) => normalizedWord(word.word) === expected,
  ) ?? result.score.wordScores[0] ?? null;
}

export async function uploadPronunciationTry(
  input: UploadPronunciationTryInput,
  deps: PronunciationUploadDeps = {},
): Promise<PronunciationUploadResult> {
  if (!validInput(input)) return failure("invalid_audio", false);

  try {
    const supabase = createSupabaseServiceClient();
    const owned = await loadOwnedPractice(supabase, input);
    if (!owned) return failure("not_found", false);

    const nextOrder = nextWordOrder(
      owned.snapshot,
      owned.turns,
      owned.turnTries,
    );
    const currentTries = owned.turnTries.get(owned.turnId) ?? [];
    const word = owned.snapshot.words.find((candidate) => candidate.order === input.turnOrder);
    if (!word) return failure("not_found", false);
    if (nextOrder !== input.turnOrder) {
      return failure(
        nextOrder === null || input.turnOrder < nextOrder
          ? "word_finished"
          : "out_of_order",
        false,
      );
    }
    if (
      currentTries.some((tryRow) => tryRow.outcome === "passed") ||
      currentTries.some((tryRow) => tryRow.try_number === 3) ||
      currentTries.length >= 3
    ) {
      return failure("word_finished", false);
    }
    const tryNumber = (currentTries.length + 1) as 1 | 2 | 3;
    const clipKind = tryNumber === 1 ? "original_answer" : "repeat_attempt";

    const budget = await (deps.consumeRequestBudget ?? consumeRequestBudget)({
      actorId: input.studentId,
      operation: "student_audio",
    });
    if (!budget.allowed) {
      return failure("rate_limited", true, budget.retryAfterSeconds);
    }

    const { data: audioClip, error: audioClipError } = await supabase
      .from("audio_clips")
      .insert({
        attempt_turn_id: owned.turnId,
        clip_kind: clipKind,
        processing_status: "pending_upload",
      })
      .select("id")
      .single();
    if (audioClipError || !audioClip) return failure("db_error", true);

    const audioClipId = String((audioClip as { id: string }).id);
    const ownedAudioClip = await supabase
      .from("audio_clips")
      .select(
        "id, attempt_turn_id, attempt_turns!inner(attempt_id, attempts!inner(assignment_students!attempts_assignment_student_id_fkey!inner(student_id)))",
      )
      .eq("id", audioClipId)
      .eq("attempt_turn_id", owned.turnId)
      .eq("attempt_turns.attempts.assignment_students.student_id", input.studentId)
      .maybeSingle();
    if (ownedAudioClip.error || !ownedAudioClip.data) {
      return failure("not_found", false);
    }

    const objectKey = buildStudentAudioObjectKey({
      assignmentStudentId: input.assignmentStudentId,
      attemptId: input.attemptId,
      turnOrder: input.turnOrder,
      clipKind,
      audioClipId,
      mimeType: input.mimeType,
    });
    const audioBlob = input.file;
    const transcribe = deps.transcribeAudioFile ?? transcribeAudioFile;
    const [storageResult, transcription] = await Promise.all([
      supabase.storage
        .from(getStudentAudioBucketId())
        .upload(objectKey, audioBlob, {
          contentType: input.mimeType,
          upsert: false,
        })
        .catch(() => ({ error: new Error("storage upload failed") })),
      Promise.resolve().then(() =>
        transcribe({ file: audioBlob, mimeType: input.mimeType }),
      ).catch(() => ({ ok: false as const, error: "transcription_failed" as const })),
    ]);

    if (storageResult.error) {
      await updateClip(supabase, {
        audioClipId,
        turnId: owned.turnId,
        status: "failed",
        mimeType: input.mimeType,
        durationMs: input.durationMs,
        byteSize: input.byteSize,
      });
      return failure("upload_failed", true);
    }

    if (!transcription.ok) {
      await updateClip(supabase, {
        audioClipId,
        turnId: owned.turnId,
        status: "failed",
        objectKey,
        mimeType: input.mimeType,
        durationMs: input.durationMs,
        byteSize: input.byteSize,
      });
      return failure("transcription_failed", true);
    }

    const normalized = normalizeEnglishTranscript(transcription.text);
    if (!normalized.text || !hasEnglishTranscript(normalized.text)) {
      await updateClip(supabase, {
        audioClipId,
        turnId: owned.turnId,
        status: "failed",
        objectKey,
        mimeType: input.mimeType,
        durationMs: input.durationMs,
        byteSize: input.byteSize,
      });
      return failure("transcription_failed", true);
    }

    const clipUpdate = await updateClip(supabase, {
      audioClipId,
      turnId: owned.turnId,
      status: "transcribed",
      objectKey,
      mimeType: input.mimeType,
      durationMs: input.durationMs,
      byteSize: input.byteSize,
    });
    if (clipUpdate.error) return failure("db_error", true);

    const transcript = normalized.text;
    const confidence = transcription.confidence;
    if (
      isSingleDifferentWord(transcript, word.text) &&
      (!confidence || isLowConfidenceTranscript(confidence))
    ) {
      return failure("unclear_transcript", true);
    }

    const initialGrade = gradePronunciationTry({
      expectedWord: word.text,
      targetPhoneIndex: word.pronunciation.targetPhoneIndex,
      tryNumber,
      transcript,
      transcriptConfidence: confidence,
      wordAccuracy: null,
      phonemes: null,
      soundId: owned.snapshot.soundId,
    });
    if (initialGrade.outcome === "different_word") {
      const tryInsert = await supabase.from("pronunciation_word_tries").insert({
        attempt_turn_id: owned.turnId,
        audio_clip_id: audioClipId,
        try_number: tryNumber,
        transcript,
        transcription_evidence: {
          model: transcription.model,
          confidence,
        } as unknown as Json,
        outcome: initialGrade.outcome,
        word_accuracy: null,
        star_band: null,
        full_word_passed: null,
        target_sound_accuracy: null,
        target_sound_passed: null,
      });
      if (tryInsert.error) return failure("db_error", true);
      return {
        ok: true,
        audioClipId,
        tryNumber,
        transcript,
        outcome: initialGrade.outcome,
        starBand: null,
        fullWordPassed: false,
        targetSoundAccuracy: null,
        targetSoundPassed: false,
        feedback: initialGrade.feedback,
      };
    }

    const score = deps.scorePronunciation ?? scorePronunciation;
    const scored = await score({
      file: audioBlob,
      referenceText: word.text,
      durationMs: input.durationMs,
    });
    if (!scored.ok) return failure("scoring_failed", true);

    const scoreWord = scoreWordForExpected(scored, word.text);
    if (!scoreWord) return failure("scoring_failed", true);

    const grade = gradePronunciationTry({
      expectedWord: word.text,
      targetPhoneIndex: word.pronunciation.targetPhoneIndex,
      tryNumber,
      transcript,
      transcriptConfidence: confidence,
      wordAccuracy: scoreWord.accuracyScore,
      phonemes: scoreWord.phonemes ?? null,
      soundId: owned.snapshot.soundId,
    });

    const scoreInsert = await supabase.from("pronunciation_scores").upsert(
      {
        audio_clip_id: audioClipId,
        provider: "azure_speech",
        reference_text: word.text,
        accuracy_score: scoreWord.accuracyScore,
        fluency_score: scored.score.fluencyScore,
        completeness_score: scored.score.completenessScore,
        pronunciation_score: scored.score.pronunciationScore,
        star_band: grade.starBand ?? 1,
        word_scores: scored.score.wordScores as unknown as Json,
      },
      { onConflict: "audio_clip_id" },
    );
    if (scoreInsert.error) return failure("db_error", true);

    const tryInsert = await supabase.from("pronunciation_word_tries").insert({
      attempt_turn_id: owned.turnId,
      audio_clip_id: audioClipId,
      try_number: tryNumber,
      transcript,
      transcription_evidence: {
        model: transcription.model,
        confidence,
      } as unknown as Json,
      outcome: grade.outcome,
      word_accuracy: scoreWord.accuracyScore,
      star_band: grade.starBand,
      full_word_passed: grade.fullWordPassed,
      target_sound_accuracy: grade.targetSoundAccuracy,
      target_sound_passed: grade.targetSoundPassed,
    });
    if (tryInsert.error) return failure("db_error", true);

    return {
      ok: true,
      audioClipId,
      tryNumber,
      transcript,
      outcome: grade.outcome,
      starBand: grade.starBand,
      fullWordPassed: grade.fullWordPassed,
      targetSoundAccuracy: grade.targetSoundAccuracy,
      targetSoundPassed: grade.targetSoundPassed,
      feedback: grade.feedback,
    };
  } catch {
    return failure("db_error", true);
  }
}
