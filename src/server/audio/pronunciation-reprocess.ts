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

const DEFAULT_AUDIO_BUCKET = "student-audio";

export type ReprocessPronunciationError =
  | "unauthorized"
  | "already_scored"
  | "unavailable"
  | "rate_limited"
  | "failed";

export type ReprocessPronunciationResult =
  | { ok: true; scored: true }
  | { ok: false; error: ReprocessPronunciationError };

export type ReprocessPronunciationDeps = {
  scorePronunciation?: typeof scorePronunciation;
  consumeRequestBudget?: typeof consumeRequestBudget;
};

function getStudentAudioBucketId() {
  return process.env.STUDENT_AUDIO_BUCKET || DEFAULT_AUDIO_BUCKET;
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
        p_word_scores: scoring.score.wordScores as unknown as Json,
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
