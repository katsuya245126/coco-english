// Audio retention purge job (PILOT-04, D-14).
//
// Deletes expired mission clips, teacher pronunciation samples, and generated
// Coco TTS audio. Mission clips keep their existing Storage-first/update
// behavior; pronunciation samples use a shared claim so failed Storage removal
// remains retryable.
//
// SECURITY: server-only by construction (service-role client). Never import
// from a "use client" module.

import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { TTS_PROVIDER } from "@/domain/audio/tts";
import { TTS_AUDIO_BUCKET } from "@/server/audio/tts-cache";
import { log } from "@/server/logging/logger";

const DEFAULT_AUDIO_BUCKET = "student-audio";
const TTS_AUDIO_RETENTION_DAYS = 30;
const TTS_REMOVE_BATCH = 100;

function getStudentAudioBucketId(): string {
  return process.env.STUDENT_AUDIO_BUCKET || DEFAULT_AUDIO_BUCKET;
}

export type PurgeExpiredAudioResult = {
  deletedCount: number;
};

type PronunciationDeletionClaim = {
  teacher_id: string;
  sample_id: string;
  object_key: string | null;
  deletion_token: string;
  deletion_kind: "teacher" | "expiry";
};

/** Purge expired teacher samples while preserving confirmed evidence. */
export async function purgeExpiredPronunciationSamples(
  supabase: ReturnType<typeof createSupabaseServiceClient>,
): Promise<number> {
  const claimed = await supabase.rpc(
    "claim_expired_teacher_pronunciation_samples",
    { p_limit: 1000 },
  );
  if (claimed.error) {
    throw new Error(
      `Unable to claim expired pronunciation samples: ${claimed.error.message}`,
    );
  }

  let finalizedCount = 0;
  for (const value of claimed.data ?? []) {
    const claim = value as PronunciationDeletionClaim;
    if (
      typeof claim.teacher_id !== "string" ||
      typeof claim.sample_id !== "string" ||
      typeof claim.deletion_token !== "string" ||
      (claim.deletion_kind !== "teacher" && claim.deletion_kind !== "expiry")
    ) {
      log("warn", "job.purge_pronunciation_samples.invalid_claim", {});
      continue;
    }

    if (claim.object_key) {
      let storageError: string | null = null;
      try {
        const removed = await supabase.storage
          .from(getStudentAudioBucketId())
          .remove([claim.object_key]);
        storageError = removed.error
          ? removed.error.message || "Storage removal failed"
          : null;
      } catch (error) {
        storageError = error instanceof Error ? error.message : String(error);
      }

      if (storageError) {
        log("warn", "job.purge_pronunciation_samples.storage_error", {
          sampleId: claim.sample_id,
          error: storageError,
        });
        continue;
      }
    }

    let finalized: string | null = null;
    try {
      const finalizer =
        claim.deletion_kind === "teacher"
          ? "finalize_teacher_pronunciation_sample_deletion"
          : "finalize_expired_teacher_pronunciation_sample_deletion";
      const result = await supabase.rpc(
        finalizer,
        {
          p_teacher_id: claim.teacher_id,
          p_sample_id: claim.sample_id,
          p_deletion_token: claim.deletion_token,
        },
      );
      finalized = result.error ? null : result.data;
    } catch {
      finalized = null;
    }

    if (finalized === "ok") {
      finalizedCount += 1;
      continue;
    }

    log("warn", "job.purge_pronunciation_samples.finalize_error", {
      sampleId: claim.sample_id,
    });
  }

  return finalizedCount;
}

/**
 * Delete Coco TTS audio created more than 30 days ago.
 *
 * Improved sentences and Coco replies are spoken from student answers, so
 * they follow the student-audio retention window. `created_at`, not
 * `last_accessed_at`, bounds retention: replays must not extend it. Fixed lines
 * regenerate on the next cache miss. Pronunciation word audio shares the table
 * but is signed without regeneration, so only Coco's provider is selected.
 * Rows are deleted only after every object is removed, so a Storage failure
 * leaves them for the next run.
 */
export async function purgeExpiredTtsAudio(
  supabase: ReturnType<typeof createSupabaseServiceClient>,
): Promise<number> {
  const cutoff = new Date(
    Date.now() - TTS_AUDIO_RETENTION_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString();
  const { data: rows, error } = await supabase
    .from("tts_audio_cache")
    .select("id, object_key")
    .eq("provider", TTS_PROVIDER)
    .lt("created_at", cutoff)
    .order("created_at")
    .limit(1000);
  if (error) {
    throw new Error(`Unable to load expired TTS audio: ${error.message}`);
  }
  if (!rows || rows.length === 0) return 0;

  for (let i = 0; i < rows.length; i += TTS_REMOVE_BATCH) {
    const removed = await supabase.storage
      .from(TTS_AUDIO_BUCKET)
      .remove(rows.slice(i, i + TTS_REMOVE_BATCH).map((row) => row.object_key));
    if (removed.error) {
      log("warn", "job.purge_tts_audio.storage_error", { rowCount: rows.length });
      return 0;
    }
  }

  // ponytail: between object removal and this delete, a cache hit signs a
  // missing object and gets a retryable 502; if this delete fails, that lasts
  // until the next run. Fence with a claim if it ever shows up.
  const deleted = await supabase
    .from("tts_audio_cache")
    .delete()
    .in(
      "id",
      rows.map((row) => row.id),
    );
  if (deleted.error) {
    throw new Error(`Unable to delete expired TTS audio rows: ${deleted.error.message}`);
  }
  log("info", "job.purge_tts_audio.complete", { deletedCount: rows.length });
  return rows.length;
}

/**
 * Purge expired mission audio, teacher pronunciation samples, and Coco TTS
 * audio (PILOT-04).
 *
 * Mission clip steps (Storage-first ordering per T-07-10):
 *  1. SELECT up to 1000 non-deleted clips with audio_expires_at < now
 *  2. If none, leave mission clips unchanged
 *  3. Remove non-null object_keys from Storage (BEFORE DB update)
 *  4. If Storage remove fails, log a warning and continue — do NOT throw
 *  5. Mark all selected rows: processing_status="deleted", deleted_at, deleted_reason
 *  6. Purge expired pronunciation samples through their claim lifecycle
 *  7. Return the existing mission-audio row count
 *
 * Idempotent: .neq("processing_status","deleted") skips already-processed rows.
 * Rows and transcripts are preserved for the audit trail (D-14); only the
 * Storage object and processing_status change.
 */
export async function purgeExpiredAudio(): Promise<PurgeExpiredAudioResult> {
  const supabase = createSupabaseServiceClient();
  const now = new Date().toISOString();

  // 1. Select expired, non-deleted clips (batch cap 1000 for idempotency)
  const { data: rows, error: selectError } = await supabase
    .from("audio_clips")
    .select("id, object_key")
    .lte("audio_expires_at", now)
    .neq("processing_status", "deleted")
    .limit(1000);

  if (selectError) {
    throw new Error(`Unable to load expired audio clips: ${selectError.message}`);
  }

  let missionDeletedCount = 0;
  if (rows && rows.length > 0) {
    // 2. Collect non-null object_keys for Storage removal
    const objectKeys = rows
      .map((r) => r.object_key)
      .filter((k): k is string => k !== null && k !== undefined);

    // 3. Storage-first: remove objects BEFORE updating DB rows (T-07-10)
    if (objectKeys.length > 0) {
      const { error: storageError } = await supabase.storage
        .from(getStudentAudioBucketId())
        .remove(objectKeys);

      if (storageError) {
        // Log warning but do NOT throw — mark rows deleted to avoid re-queuing
        // stale keys on the next run (resilience over consistency for Storage)
        log("warn", "job.purge_audio.storage_error", {
          error: storageError.message,
          clipCount: objectKeys.length,
        });
      }
    }

    // 4. Mark all selected rows as deleted (row + transcript preserved, per D-14)
    const ids = rows.map((r) => r.id);
    await supabase
      .from("audio_clips")
      .update({
        processing_status: "deleted",
        deleted_at: now,
        deleted_reason: "audio_expires_at_elapsed",
      })
      .in("id", ids);
    missionDeletedCount = rows.length;
  }

  try {
    await purgeExpiredPronunciationSamples(supabase);
  } catch (error) {
    log("warn", "job.purge_pronunciation_samples.failed", {
      error: error instanceof Error ? error.message : String(error),
    });
  }
  try {
    await purgeExpiredTtsAudio(supabase);
  } catch (error) {
    log("warn", "job.purge_tts_audio.failed", {
      error: error instanceof Error ? error.message : String(error),
    });
  }
  return { deletedCount: missionDeletedCount };
}
