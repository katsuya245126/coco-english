import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server-auth";
import { one, parseWordScores } from "@/server/teacher/audio-evidence";
import {
  studentSoundProfile,
  type StudentClipScore,
  type StudentSoundWeakness,
} from "@/domain/pronunciation/scoring";

/** A pronunciation_scores row projected for profile aggregation. */
const profileScoreRowSchema = z.object({
  reference_text: z.string().nullable(),
  word_scores: z.unknown(),
});
type ProfileScoreRow = z.infer<typeof profileScoreRowSchema>;

/**
 * Pure mapping from stored score rows to the accumulated sound profile.
 * Only `original_answer` clips reach here (scoped by the query), so
 * `reference_text` is the student's own transcript. A null transcript scopes
 * nothing in — safer than counting against the target sentence.
 */
export function buildStudentSoundProfile(
  rows: ProfileScoreRow[],
): StudentSoundWeakness[] {
  const clips: StudentClipScore[] = rows.map((row) => ({
    wordScores: parseWordScores(row.word_scores),
    transcript: row.reference_text ?? "",
  }));
  return studentSoundProfile(clips);
}

/**
 * Load a student's accumulated weak-sound profile. Runs under RLS via the
 * authenticated server client; the reverse-join + teacher_id filter enforces
 * ownership defensively. Scopes to `original_answer` clips, whose
 * `reference_text` is the student's transcript (repeat_attempt clips'
 * reference_text is the target sentence — wrong scope for "what they said").
 */
export async function getStudentSoundProfile(
  studentId: string,
  teacherId: string,
): Promise<StudentSoundWeakness[]> {
  const supabase = await createSupabaseServerClient();

  const scores = await supabase
    .from("pronunciation_scores")
    .select(
      `
      reference_text,
      word_scores,
      audio_clips!inner(
        clip_kind,
        attempt_turns!inner(
          attempts!inner(
            assignment_students!attempts_assignment_student_id_fkey!inner(
              student_id,
              assignments!inner(
                classes!inner(teacher_id)
              )
            )
          )
        )
      )
    `,
    )
    .eq("audio_clips.clip_kind", "original_answer")
    .eq(
      "audio_clips.attempt_turns.attempts.assignment_students.student_id",
      studentId,
    )
    .eq(
      "audio_clips.attempt_turns.attempts.assignment_students.assignments.classes.teacher_id",
      teacherId,
    );

  if (scores.error) {
    throw new Error(
      `Unable to load student pronunciation scores: ${scores.error.message}`,
    );
  }

  const rows = z.array(profileScoreRowSchema).safeParse(scores.data ?? []);
  if (!rows.success) {
    throw new Error(
      "Unable to load student pronunciation scores: unexpected row shape",
    );
  }
  return buildStudentSoundProfile(rows.data);
}

export type StudentProfileHeader = {
  studentId: string;
  classId: string;
  displayName: string;
  className: string;
};

/**
 * Load the student's identity + class for the page header, RLS-scoped to the
 * requesting teacher. Returns null if the student is not visible to them
 * (drives notFound on the page).
 */
export async function getStudentProfileHeader(
  studentId: string,
): Promise<StudentProfileHeader | null> {
  const supabase = await createSupabaseServerClient();

  const student = await supabase
    .from("students")
    .select("id, class_id, display_name, classes!inner(name)")
    .eq("id", studentId)
    .maybeSingle();

  if (student.error) {
    throw new Error(`Unable to load student: ${student.error.message}`);
  }
  if (!student.data) return null;

  const classSchema = z.object({ name: z.string() });
  const parsed = z
    .object({
      id: z.string(),
      class_id: z.string(),
      display_name: z.string(),
      classes: z.union([classSchema, z.array(classSchema)]).nullable(),
    })
    .safeParse(student.data);
  if (!parsed.success) {
    throw new Error("Unable to load student: unexpected row shape");
  }
  const row = parsed.data;
  const className = one(row.classes)?.name ?? "";

  return {
    studentId: row.id,
    classId: row.class_id,
    displayName: row.display_name,
    className,
  };
}
