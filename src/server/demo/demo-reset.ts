import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { getStudentAudioBucketId } from "@/server/student-access/audio-storage";

const REMOVE_BATCH = 100;

// Nightly demo reset: remove the class's student audio files first, then the
// students (attempts, turns, clip rows and pronunciation data cascade). The
// seeded teacher, class, missions and assignments stay. If file removal fails
// the rows are kept, so the next run can still find the files.
// ponytail: a clip uploaded between the key listing and the delete is orphaned;
// runs at night, re-list after delete if that ever shows up.
export async function resetDemoClass(
  classId: string,
): Promise<{ removedObjects: number; deletedStudents: number }> {
  const supabase = createSupabaseServiceClient();
  const bucket = getStudentAudioBucketId();

  const keys = await supabase.rpc("demo_audio_object_keys", {
    p_class_id: classId,
    p_bucket_id: bucket,
  });
  if (keys.error) throw new Error("demo_audio_object_keys failed");
  const objectKeys = (keys.data ?? []).map((row: { object_key: string }) => row.object_key);

  for (let i = 0; i < objectKeys.length; i += REMOVE_BATCH) {
    const removed = await supabase.storage
      .from(bucket)
      .remove(objectKeys.slice(i, i + REMOVE_BATCH));
    if (removed.error) throw new Error("demo audio removal failed");
  }

  const deleted = await supabase
    .from("students")
    .delete()
    .eq("class_id", classId)
    .select("id");
  if (deleted.error) throw new Error("demo student delete failed");

  return { removedObjects: objectKeys.length, deletedStudents: deleted.data.length };
}
