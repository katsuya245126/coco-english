/**
 * Teacher-owned pronunciation reprocessing. The lifecycle RPCs prove ownership
 * and keep a clip claimed while the private audio is sent to the scorer.
 */

import { createSupabaseServiceClient } from "@/lib/supabase/server";
import type { Json } from "@/lib/db/types";
import {
  scorePronunciation,
  type PronunciationScoreError,
} from "@/server/audio/pronunciation-scorer";
import { consumeRequestBudget } from "@/server/security/request-budget";
import { log } from "@/server/logging/logger";
import { MAX_PRONUNCIATION_REFERENCE_CHARS } from "@/domain/pronunciation/scoring";

const DEFAULT_AUDIO_BUCKET = "student-audio";

export type ReprocessPronunciationError =
  | "unauthorized"
  | "already_scored"
  | "unavailable"
  | "rate_limited"
  | "failed";

export type MissionAudioClarificationError =
  | "unauthorized"
  | "unavailable"
  | "invalid_text"
  | "rate_limited"
  | "failed";

export type ReprocessPronunciationResult =
  | { ok: true; scored: true }
  | { ok: false; error: ReprocessPronunciationError };

export type ReprocessPronunciationDeps = {
  scorePronunciation?: typeof scorePronunciation;
  consumeRequestBudget?: typeof consumeRequestBudget;
};

export type MissionAudioClarificationInput = {
  teacherId: string;
  audioClipId: string;
  teacherConfirmedText: string;
};

export type MissionAudioClarificationResult =
  | { ok: true; scored: true }
  | { ok: false; error: MissionAudioClarificationError };

export type MissionAudioNoSpeechResult =
  | { ok: true; marked: true }
  | { ok: false; error: "unauthorized" | "unavailable" | "failed" };

function getStudentAudioBucketId() {
  return process.env.STUDENT_AUDIO_BUCKET || DEFAULT_AUDIO_BUCKET;
}

/** Mark one owned, retained mission clip as containing no student speech. */
export async function markMissionAudioNoSpeech(input: {
  teacherId: string;
  audioClipId: string;
}): Promise<MissionAudioNoSpeechResult> {
  const supabase = createSupabaseServiceClient();
  try {
    const result = await supabase.rpc("mark_teacher_mission_audio_no_speech", {
      p_teacher_id: input.teacherId,
      p_audio_clip_id: input.audioClipId,
    });
    if (result.error) return { ok: false, error: "failed" };
    if (result.data === "ok") return { ok: true, marked: true };
    if (result.data === "unauthorized") {
      return { ok: false, error: "unauthorized" };
    }
    if (result.data === "unavailable") {
      return { ok: false, error: "unavailable" };
    }
  } catch {
    return { ok: false, error: "failed" };
  }
  return { ok: false, error: "failed" };
}

export async function reprocessClipPronunciation(
  input: { teacherId: string; audioClipId: string },
  deps: ReprocessPronunciationDeps = {},
): Promise<ReprocessPronunciationResult> {
  const supabase = createSupabaseServiceClient();
  const lifecycleArgs = {
    p_teacher_id: input.teacherId,
    p_audio_clip_id: input.audioClipId,
  };
  const clear = async () => {
    try {
      const { data, error } = await supabase.rpc(
        "clear_pronunciation_reprocessing",
        lifecycleArgs,
      );
      if (!error && data === "ok") return true;
      log("warn", "audio.pronunciation_reprocess_cleanup_failed", {
        audioClipId: input.audioClipId,
        outcome: error ? "error" : data ?? "missing",
      });
    } catch {
      log("warn", "audio.pronunciation_reprocess_cleanup_failed", {
        audioClipId: input.audioClipId,
        outcome: "error",
      });
    }
    return false;
  };

  let begin;
  try {
    const { data, error } = await supabase.rpc(
      "begin_pronunciation_reprocessing",
      lifecycleArgs,
    );
    begin = error ? null : data?.[0] ?? null;
  } catch {
    begin = null;
  }

  if (!begin) return { ok: false, error: "failed" };
  if (begin.outcome === "unauthorized") {
    return { ok: false, error: "unauthorized" };
  }
  if (begin.outcome === "already_scored") {
    return { ok: false, error: "already_scored" };
  }
  if (begin.outcome === "unavailable") {
    return { ok: false, error: "unavailable" };
  }
  if (
    begin.outcome !== "ok" ||
    !begin.object_key ||
    !begin.reference_text
  ) {
    if (begin.outcome === "ok") await clear();
    return { ok: false, error: "failed" };
  }

  let file: Blob;
  try {
    const download = await supabase.storage
      .from(getStudentAudioBucketId())
      .download(begin.object_key);
    if (download.error || !download.data) {
      await clear();
      return { ok: false, error: "failed" };
    }
    file = download.data;
  } catch {
    await clear();
    return { ok: false, error: "failed" };
  }

  try {
    const budget = await (deps.consumeRequestBudget ?? consumeRequestBudget)({
      actorId: input.teacherId,
      operation: "teacher_provider",
    });
    if (!budget.allowed) {
      await clear();
      return { ok: false, error: "rate_limited" };
    }
  } catch {
    await clear();
    return { ok: false, error: "failed" };
  }

  let scoring: Awaited<ReturnType<typeof scorePronunciation>>;
  try {
    scoring = await (deps.scorePronunciation ?? scorePronunciation)({
      file,
      referenceText: begin.reference_text,
      durationMs: begin.duration_ms ?? 0,
    });
  } catch {
    await clear();
    return { ok: false, error: "failed" };
  }

  if (!scoring.ok) {
    log("warn", "audio.pronunciation_reprocess_failed", {
      audioClipId: input.audioClipId,
      error: scoring.error satisfies PronunciationScoreError,
    });
    await clear();
    return { ok: false, error: "failed" };
  }

  try {
    const { data, error } = await supabase.rpc(
      "complete_pronunciation_reprocessing",
      {
        ...lifecycleArgs,
        p_accuracy_score: scoring.score.accuracyScore,
        p_fluency_score: scoring.score.fluencyScore,
        p_completeness_score: scoring.score.completenessScore,
        p_pronunciation_score: scoring.score.pronunciationScore,
        p_star_band: scoring.score.starBand,
        p_word_scores: scoring.score.wordScores satisfies Json,
      },
    );
    if (!error && data === "ok") {
      log("info", "audio.pronunciation_reprocessed", {
        audioClipId: input.audioClipId,
        starBand: scoring.score.starBand,
      });
      return { ok: true, scored: true };
    }
    if (!error && data === "already_scored") {
      return { ok: false, error: "already_scored" };
    }
  } catch {
    // Cleanup below leaves a failed claim repairable.
  }

  await clear();
  return { ok: false, error: "failed" };
}

type ClarificationBegin = {
  outcome: "ok" | "unauthorized" | "invalid_input" | "unavailable";
  object_key?: string | null;
  duration_ms?: number | null;
  clarification_token?: string | null;
};

/** Reanalyze one playable mission clip against teacher-confirmed wording. */
export async function clarifyMissionAudio(
  input: MissionAudioClarificationInput,
  deps: ReprocessPronunciationDeps = {},
): Promise<MissionAudioClarificationResult> {
  const teacherConfirmedText = input.teacherConfirmedText.trim();
  if (
    !teacherConfirmedText ||
    teacherConfirmedText.length > MAX_PRONUNCIATION_REFERENCE_CHARS
  ) {
    return { ok: false, error: "invalid_text" };
  }

  const supabase = createSupabaseServiceClient();
  const lifecycleArgs = {
    p_teacher_id: input.teacherId,
    p_audio_clip_id: input.audioClipId,
    p_teacher_confirmed_text: teacherConfirmedText,
  };

  let begin: ClarificationBegin | null = null;
  try {
    const result = await supabase.rpc(
      "begin_teacher_mission_audio_clarification",
      lifecycleArgs,
    );
    begin = result.error
      ? null
      : (result.data?.[0] as ClarificationBegin | undefined) ?? null;
  } catch {
    begin = null;
  }

  if (!begin) return { ok: false, error: "failed" };
  if (begin.outcome === "unauthorized") {
    return { ok: false, error: "unauthorized" };
  }
  if (begin.outcome === "invalid_input") {
    return { ok: false, error: "invalid_text" };
  }
  if (begin.outcome === "unavailable") {
    return { ok: false, error: "unavailable" };
  }

  const token = begin.clarification_token;
  const clear = async () => {
    if (typeof token !== "string") return false;
    try {
      const result = await supabase.rpc(
        "clear_teacher_mission_audio_clarification",
        {
          p_teacher_id: input.teacherId,
          p_audio_clip_id: input.audioClipId,
          p_clarification_token: token,
        },
      );
      if (!result.error && result.data === "ok") return true;
      log("warn", "audio.pronunciation_clarification_cleanup_failed", {
        audioClipId: input.audioClipId,
        outcome: result.error ? "error" : result.data ?? "missing",
      });
    } catch {
      log("warn", "audio.pronunciation_clarification_cleanup_failed", {
        audioClipId: input.audioClipId,
        outcome: "error",
      });
    }
    return false;
  };

  if (
    begin.outcome !== "ok" ||
    typeof begin.object_key !== "string" ||
    !begin.object_key ||
    typeof begin.clarification_token !== "string" ||
    (begin.duration_ms !== null && typeof begin.duration_ms !== "number")
  ) {
    await clear();
    return { ok: false, error: "failed" };
  }

  let file: Blob;
  try {
    const download = await supabase.storage
      .from(getStudentAudioBucketId())
      .download(begin.object_key);
    if (download.error || !download.data) {
      await clear();
      return { ok: false, error: "failed" };
    }
    file = download.data;
  } catch {
    await clear();
    return { ok: false, error: "failed" };
  }

  try {
    const budget = await (deps.consumeRequestBudget ?? consumeRequestBudget)({
      actorId: input.teacherId,
      operation: "teacher_provider",
    });
    if (!budget.allowed) {
      await clear();
      return { ok: false, error: "rate_limited" };
    }
  } catch {
    await clear();
    return { ok: false, error: "failed" };
  }

  let scoring: Awaited<ReturnType<typeof scorePronunciation>>;
  try {
      scoring = await (deps.scorePronunciation ?? scorePronunciation)({
        file,
        referenceText: teacherConfirmedText,
        durationMs: begin.duration_ms ?? 0,
      });
  } catch {
    await clear();
    return { ok: false, error: "failed" };
  }

  if (!scoring.ok) {
    log("warn", "audio.pronunciation_clarification_failed", {
      audioClipId: input.audioClipId,
      error: scoring.error satisfies PronunciationScoreError,
    });
    await clear();
    return { ok: false, error: "failed" };
  }

  try {
    const result = await supabase.rpc(
      "complete_teacher_mission_audio_clarification",
      {
        p_teacher_id: input.teacherId,
        p_audio_clip_id: input.audioClipId,
        p_clarification_token: begin.clarification_token,
        p_teacher_confirmed_text: teacherConfirmedText,
        p_accuracy_score: scoring.score.accuracyScore,
        p_fluency_score: scoring.score.fluencyScore,
        p_completeness_score: scoring.score.completenessScore,
        p_pronunciation_score: scoring.score.pronunciationScore,
        p_star_band: scoring.score.starBand,
        p_word_scores: scoring.score.wordScores satisfies Json,
      },
    );
    if (!result.error && result.data === "ok") {
      log("info", "audio.pronunciation_clarified", {
        audioClipId: input.audioClipId,
        starBand: scoring.score.starBand,
      });
      return { ok: true, scored: true };
    }
  } catch {
    // Cleanup below leaves a failed claim repairable.
  }

  await clear();
  return { ok: false, error: "failed" };
}
