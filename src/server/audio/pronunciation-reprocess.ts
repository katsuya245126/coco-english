/**
 * Re-score an already-uploaded audio clip that is missing a pronunciation
 * score.
 *
 * Pronunciation scoring at upload time is best-effort: a transient Azure
 * failure (or a scorer misconfiguration in one deploy) is logged and swallowed
 * so it never blocks a student's turn. The trade-off is that a clip can end up
 * permanently without a `pronunciation_scores` row even though its audio is
 * still in storage. This module recovers that case by re-running the scorer
 * against the stored clip and upserting the result.
 *
 * Server-only. Uses the service-role client, so callers MUST perform their own
 * authorization before invoking (e.g. teacher ownership of the attempt).
 */

import { createSupabaseServiceClient } from "@/lib/supabase/server";
import type { Database, Json } from "@/lib/db/types";
import {
  scorePronunciation,
  type PronunciationScoreError,
} from "@/server/audio/pronunciation-scorer";
import { log } from "@/server/logging/logger";

const DEFAULT_AUDIO_BUCKET = "student-audio";

type AudioClipKind = Database["public"]["Enums"]["audio_clip_kind"];

type AttemptTurnReference = {
  original_transcript: string | null;
  improved_sentence: string | null;
  repeat_transcript: string | null;
};

type NestedRelation<T> = T | T[] | null | undefined;

function one<T>(relation: NestedRelation<T>): T | null {
  if (Array.isArray(relation)) return relation[0] ?? null;
  return relation ?? null;
}

export type ReprocessPronunciationError =
  | "not_found"
  | "already_scored"
  | "clip_unavailable"
  | "no_reference_text"
  | "download_failed"
  | PronunciationScoreError
  | "db_error";

export type ReprocessPronunciationResult =
  | { ok: true; scored: true }
  | { ok: false; error: ReprocessPronunciationError };

export type ReprocessPronunciationDeps = {
  scorePronunciation?: typeof scorePronunciation;
};

function getStudentAudioBucketId() {
  return process.env.STUDENT_AUDIO_BUCKET || DEFAULT_AUDIO_BUCKET;
}

/**
 * The reference text the scorer compares the audio against. For an original
 * answer this is the student's own transcript; for a repeat attempt it is the
 * improved sentence they were asked to say. This mirrors the reference-text
 * choice made in the upload path so re-scored rows match freshly-scored ones.
 */
function resolveReferenceText(
  clipKind: AudioClipKind,
  turn: AttemptTurnReference | null,
): string | null {
  if (!turn) return null;

  if (clipKind === "original_answer") {
    return turn.original_transcript?.trim() || null;
  }

  return (
    turn.improved_sentence?.trim() ||
    turn.repeat_transcript?.trim() ||
    null
  );
}

export async function reprocessClipPronunciation(
  input: { audioClipId: string },
  deps: ReprocessPronunciationDeps = {},
): Promise<ReprocessPronunciationResult> {
  const supabase = createSupabaseServiceClient();

  const { data: clip, error: clipError } = await supabase
    .from("audio_clips")
    .select(
      `
        id,
        clip_kind,
        object_key,
        mime_type,
        duration_ms,
        processing_status,
        deleted_at,
        attempt_turns!inner(
          original_transcript,
          improved_sentence,
          repeat_transcript
        )
      `,
    )
    .eq("id", input.audioClipId)
    .maybeSingle();

  if (clipError) {
    return { ok: false, error: "db_error" };
  }
  if (!clip) {
    return { ok: false, error: "not_found" };
  }

  const attemptTurn = one(
    (clip as { attempt_turns: NestedRelation<AttemptTurnReference> })
      .attempt_turns,
  );

  if (
    !clip.object_key ||
    clip.deleted_at ||
    clip.processing_status === "deleted" ||
    clip.processing_status === "failed"
  ) {
    return { ok: false, error: "clip_unavailable" };
  }

  const { data: existingScore, error: existingError } = await supabase
    .from("pronunciation_scores")
    .select("audio_clip_id")
    .eq("audio_clip_id", input.audioClipId)
    .maybeSingle();

  if (existingError) {
    return { ok: false, error: "db_error" };
  }
  if (existingScore) {
    return { ok: false, error: "already_scored" };
  }

  const referenceText = resolveReferenceText(clip.clip_kind, attemptTurn);
  if (!referenceText) {
    return { ok: false, error: "no_reference_text" };
  }

  const download = await supabase.storage
    .from(getStudentAudioBucketId())
    .download(clip.object_key);

  if (download.error || !download.data) {
    return { ok: false, error: "download_failed" };
  }

  const score = deps.scorePronunciation ?? scorePronunciation;
  const scoring = await score({
    file: download.data,
    referenceText,
    durationMs: clip.duration_ms ?? 0,
  });

  if (!scoring.ok) {
    log("warn", "audio.pronunciation_reprocess_failed", {
      audioClipId: input.audioClipId,
      error: scoring.error,
    });
    return { ok: false, error: scoring.error };
  }

  const upsert = await supabase.from("pronunciation_scores").upsert(
    {
      audio_clip_id: input.audioClipId,
      provider: "azure_speech",
      reference_text: scoring.score.referenceText,
      accuracy_score: scoring.score.accuracyScore,
      fluency_score: scoring.score.fluencyScore,
      completeness_score: scoring.score.completenessScore,
      pronunciation_score: scoring.score.pronunciationScore,
      star_band: scoring.score.starBand,
      word_scores: scoring.score.wordScores as unknown as Json,
    },
    { onConflict: "audio_clip_id" },
  );

  if (upsert.error) {
    log("warn", "audio.pronunciation_reprocess_failed", {
      audioClipId: input.audioClipId,
      error: upsert.error.message,
    });
    return { ok: false, error: "db_error" };
  }

  log("info", "audio.pronunciation_reprocessed", {
    audioClipId: input.audioClipId,
    starBand: scoring.score.starBand,
  });

  return { ok: true, scored: true };
}
