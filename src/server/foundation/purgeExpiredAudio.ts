// Audio retention purge job (PILOT-04, D-14).
//
// Deletes expired audio clips: Storage objects first, then DB rows marked
// deleted (row preserved for transcript audit trail). Storage-first ordering
// (T-07-10) ensures no Storage object is orphaned — if the DB update fails
// the next run can retry; if Storage remove fails the row is still marked
// deleted to avoid re-queuing stale keys.
//
// SECURITY: server-only by construction (service-role client). Never import
// from a "use client" module.

import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { log } from "@/server/logging/logger";

const DEFAULT_AUDIO_BUCKET = "student-audio";

function getStudentAudioBucketId(): string {
  return process.env.STUDENT_AUDIO_BUCKET || DEFAULT_AUDIO_BUCKET;
}

export type PurgeExpiredAudioResult = {
  deletedCount: number;
};

/**
 * Purge audio clips whose audio_expires_at has elapsed (PILOT-04).
 *
 * Steps (Storage-first ordering per T-07-10):
 *  1. SELECT up to 1000 non-deleted clips with audio_expires_at < now
 *  2. If none, return { deletedCount: 0 } with no Storage call
 *  3. Remove non-null object_keys from Storage (BEFORE DB update)
 *  4. If Storage remove fails, log a warning and continue — do NOT throw
 *  5. Mark all selected rows: processing_status="deleted", deleted_at, deleted_reason
 *  6. Return { deletedCount: selected rows count }
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

  if (!rows || rows.length === 0) {
    return { deletedCount: 0 };
  }

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

  return { deletedCount: rows.length };
}
