import { createSupabaseServiceClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/db/types";

export type TeacherOwnedQueryClient = ReturnType<
  typeof createSupabaseServiceClient
>;

export type TeacherOwnedQueryError = { message: string };

export type TeacherOwnedQueryResult<T> = {
  data: T;
  error: TeacherOwnedQueryError | null;
};

type AttemptStatus = Database["public"]["Enums"]["attempt_status"];
type AudioClipKind = Database["public"]["Enums"]["audio_clip_kind"];
type AudioProcessingStatus =
  Database["public"]["Enums"]["audio_processing_status"];

export type TeacherOwnedRelation<T> = T | T[] | null | undefined;

type OwnedClass = {
  id?: string;
  name?: string;
  teacher_id?: string;
  review_policy?: string;
};

type OwnedStudent = { display_name: string };

type OwnedAssignment = {
  id?: string;
  title?: string;
  due_at?: string | null;
  canceled_at?: string | null;
  class_id?: string;
  mission_snapshot?: unknown;
  classes: TeacherOwnedRelation<OwnedClass>;
};

type OwnedAssignmentStudent = {
  id: string;
  status: string;
  dismissed_at: string | null;
  submitted_at: string | null;
  latest_attempt_id: string | null;
  attempt_count?: number;
  highest_hint_level?: number;
  students: TeacherOwnedRelation<OwnedStudent>;
  assignments: TeacherOwnedRelation<OwnedAssignment>;
};

export type TeacherOwnedAttemptEvidenceRow = {
  id: string;
  status: AttemptStatus;
  started_at: string;
  completed_at: string | null;
  needs_review_reason: string | null;
  assignment_students: TeacherOwnedRelation<
    OwnedAssignmentStudent & {
      assignments: TeacherOwnedRelation<
        OwnedAssignment & {
          id: string;
          title: string;
          mission_snapshot: unknown;
          classes: TeacherOwnedRelation<
            OwnedClass & { id: string; name: string; teacher_id: string }
          >;
        }
      >;
    }
  >;
};

export type TeacherOwnedAttemptQueueRow = {
  id: string;
  status: string;
  completed_at: string | null;
  received_at?: string | null;
  needs_review_reason: string | null;
  assignment_students: TeacherOwnedRelation<
    OwnedAssignmentStudent & {
      latest_attempt_id: string | null;
      assignments: TeacherOwnedRelation<
        OwnedAssignment & {
          id: string;
          title: string;
          due_at: string | null;
          classes: TeacherOwnedRelation<
            OwnedClass & { id: string; name: string; teacher_id: string; review_policy: string }
          >;
        }
      >;
    }
  >;
  submission_review_receipts: TeacherOwnedRelation<{
    first_viewed_at: string | null;
    reviewed_at: string | null;
  }>;
};

export type TeacherOwnedAssignmentStudentRow = OwnedAssignmentStudent & {
  assignments: TeacherOwnedRelation<
    OwnedAssignment & {
      id: string;
      title: string;
      mission_snapshot: unknown;
      classes: TeacherOwnedRelation<
        OwnedClass & { id: string; name: string; teacher_id: string }
      >;
    }
  >;
};

export type TeacherOwnedAssignmentProgressRow = {
  assignment_id: string;
  status: string;
};

export type TeacherOwnedAttemptTurnRow = {
  id: string;
  turn_order: number;
  original_transcript: string | null;
  improved_sentence: string | null;
  repeat_transcript: string | null;
  target_attempted: boolean | null;
  repeat_accepted: boolean | null;
  evaluation: unknown;
  coco_line: string | null;
  reply_hint_frame: string | null;
  hint_level_used: number | null;
};

export type TeacherOwnedAudioClipEvidenceRow = {
  id: string;
  attempt_turn_id: string;
  clip_kind: AudioClipKind;
  processing_status: AudioProcessingStatus;
};

export type TeacherOwnedPronunciationScoreRow = {
  audio_clip_id: string;
  star_band: number;
  reference_text: string | null;
  word_scores: unknown;
};

export type TeacherOwnedAudioClipSignerRow = {
  id: string;
  object_key: string | null;
  processing_status: AudioProcessingStatus;
  deleted_at: string | null;
};

const attemptTeacherPath = "assignment_students.assignments.classes.teacher_id";
const turnTeacherPath =
  "attempts.assignment_students.assignments.classes.teacher_id";
const clipTeacherPath =
  "attempt_turns.attempts.assignment_students.assignments.classes.teacher_id";
const scoreTeacherPath =
  "audio_clips.attempt_turns.attempts.assignment_students.assignments.classes.teacher_id";

export async function getOwnedAttemptForTeacher(
  input: { teacherId: string; attemptId: string },
  client: TeacherOwnedQueryClient = createSupabaseServiceClient(),
): Promise<TeacherOwnedQueryResult<TeacherOwnedAttemptEvidenceRow | null>> {
  const result = await client
    .from("attempts")
    .select(
      `
        id,
        status,
        started_at,
        completed_at,
        needs_review_reason,
        assignment_students!attempts_assignment_student_id_fkey!inner(
          id,
          status,
          dismissed_at,
          submitted_at,
          attempt_count,
          highest_hint_level,
          students!inner(display_name),
          assignments!inner(
            id,
            title,
            mission_snapshot,
            classes!inner(id, name, teacher_id)
          )
        )
      `,
    )
    .eq("id", input.attemptId)
    .eq(attemptTeacherPath, input.teacherId)
    .maybeSingle();

  return { data: result.data as TeacherOwnedAttemptEvidenceRow | null, error: result.error };
}

export async function listOwnedAttemptsForTeacher(
  input: { teacherId: string },
  client: TeacherOwnedQueryClient = createSupabaseServiceClient(),
): Promise<TeacherOwnedQueryResult<TeacherOwnedAttemptQueueRow[]>> {
  const result = await client
    .from("attempts")
    .select(`
      id, status, completed_at, needs_review_reason,
      assignment_students!attempts_assignment_student_id_fkey!inner(
        id, status, submitted_at, latest_attempt_id,
        students!inner(display_name),
        assignments!inner(id, title, due_at, classes!inner(id, name, teacher_id, review_policy))
      ),
      submission_review_receipts(first_viewed_at, reviewed_at)
    `)
    .eq(attemptTeacherPath, input.teacherId);

  return {
    data: (result.data ?? []) as TeacherOwnedAttemptQueueRow[],
    error: result.error,
  };
}

export async function getOwnedAssignmentStudentForTeacher(
  input: { teacherId: string; assignmentStudentId: string },
  client: TeacherOwnedQueryClient = createSupabaseServiceClient(),
): Promise<TeacherOwnedQueryResult<TeacherOwnedAssignmentStudentRow | null>> {
  const result = await client
    .from("assignment_students")
    .select(`
      id, status, submitted_at, latest_attempt_id, dismissed_at,
      attempt_count, highest_hint_level,
      students!inner(display_name),
      assignments!inner(
        id, title, mission_snapshot,
        classes!inner(id, name, teacher_id)
      )
    `)
    .eq("id", input.assignmentStudentId)
    .eq("assignments.classes.teacher_id", input.teacherId)
    .maybeSingle();

  return {
    data: result.data as TeacherOwnedAssignmentStudentRow | null,
    error: result.error,
  };
}

export async function listOwnedAssignmentStudentsForTeacher(
  input: {
    teacherId: string;
    statuses?: string[];
    onlyUndismissed?: boolean;
    excludeCanceled?: boolean;
  },
  client: TeacherOwnedQueryClient = createSupabaseServiceClient(),
): Promise<TeacherOwnedQueryResult<TeacherOwnedAssignmentStudentRow[]>> {
  let query = client
    .from("assignment_students")
    .select(`
      id, status, submitted_at, latest_attempt_id, dismissed_at,
      attempt_count, highest_hint_level,
      students!inner(display_name),
      assignments!inner(
        id, title, due_at, canceled_at,
        classes!inner(id, name, teacher_id)
      )
    `)
    .eq("assignments.classes.teacher_id", input.teacherId);

  if (input.statuses) query = query.in("status", input.statuses);
  if (input.onlyUndismissed) query = query.is("dismissed_at", null);
  if (input.excludeCanceled) query = query.is("assignments.canceled_at", null);

  const result = await query;
  return {
    data: (result.data ?? []) as TeacherOwnedAssignmentStudentRow[],
    error: result.error,
  };
}

export async function listOwnedAssignmentProgressForClass(
  input: {
    teacherId: string;
    classId: string;
    excludeCanceled?: boolean;
  },
  client: TeacherOwnedQueryClient = createSupabaseServiceClient(),
): Promise<TeacherOwnedQueryResult<TeacherOwnedAssignmentProgressRow[]>> {
  let query = client
    .from("assignment_students")
    .select(
      `assignment_id, status, assignments!inner(class_id, canceled_at, classes!inner(teacher_id))`,
    )
    .eq("assignments.class_id", input.classId)
    .eq("assignments.classes.teacher_id", input.teacherId);

  if (input.excludeCanceled) query = query.is("assignments.canceled_at", null);

  const result = await query;
  return {
    data: (result.data ?? []) as TeacherOwnedAssignmentProgressRow[],
    error: result.error,
  };
}

export async function listOwnedAttemptTurnsForTeacher(
  input: { teacherId: string; attemptId: string },
  client: TeacherOwnedQueryClient = createSupabaseServiceClient(),
): Promise<TeacherOwnedQueryResult<TeacherOwnedAttemptTurnRow[]>> {
  const result = await client
    .from("attempt_turns")
    .select(
      `
        id, turn_order, original_transcript, improved_sentence, repeat_transcript,
        target_attempted, repeat_accepted, evaluation, coco_line, reply_hint_frame,
        hint_level_used,
        attempts!inner(
          assignment_students!attempts_assignment_student_id_fkey!inner(
            assignments!inner(classes!inner(teacher_id))
          )
        )
      `,
    )
    .eq("attempt_id", input.attemptId)
    .eq(turnTeacherPath, input.teacherId)
    .order("turn_order", { ascending: true });

  return {
    data: (result.data ?? []) as TeacherOwnedAttemptTurnRow[],
    error: result.error,
  };
}

export async function listOwnedAttemptClipsForTeacher(
  input: { teacherId: string; attemptId: string; turnIds: string[] },
  client: TeacherOwnedQueryClient = createSupabaseServiceClient(),
): Promise<TeacherOwnedQueryResult<TeacherOwnedAudioClipEvidenceRow[]>> {
  if (input.turnIds.length === 0) return { data: [], error: null };

  const result = await client
    .from("audio_clips")
    .select(
      `
        id, attempt_turn_id, clip_kind, processing_status,
        attempt_turns!inner(
          attempts!inner(
            assignment_students!attempts_assignment_student_id_fkey!inner(
              assignments!inner(classes!inner(teacher_id))
            )
          )
        )
      `,
    )
    .in("attempt_turn_id", input.turnIds)
    .eq("attempt_turns.attempt_id", input.attemptId)
    .eq(clipTeacherPath, input.teacherId)
    .order("created_at", { ascending: true });

  return {
    data: (result.data ?? []) as TeacherOwnedAudioClipEvidenceRow[],
    error: result.error,
  };
}

export async function listOwnedPronunciationScoresForTeacher(
  input: { teacherId: string; attemptId: string; audioClipIds: string[] },
  client: TeacherOwnedQueryClient = createSupabaseServiceClient(),
): Promise<TeacherOwnedQueryResult<TeacherOwnedPronunciationScoreRow[]>> {
  if (input.audioClipIds.length === 0) return { data: [], error: null };

  const result = await client
    .from("pronunciation_scores")
    .select(
      `
        audio_clip_id, star_band, reference_text, word_scores,
        audio_clips!inner(
          attempt_turns!inner(
            attempts!inner(
              assignment_students!attempts_assignment_student_id_fkey!inner(
                assignments!inner(classes!inner(teacher_id))
              )
            )
          )
        )
      `,
    )
    .in("audio_clip_id", input.audioClipIds)
    .eq("audio_clips.attempt_turns.attempt_id", input.attemptId)
    .eq(scoreTeacherPath, input.teacherId);

  return {
    data: (result.data ?? []) as TeacherOwnedPronunciationScoreRow[],
    error: result.error,
  };
}

export async function getOwnedAudioClipForTeacher(
  input: { teacherId: string; audioClipId: string },
  client: TeacherOwnedQueryClient = createSupabaseServiceClient(),
): Promise<TeacherOwnedQueryResult<TeacherOwnedAudioClipSignerRow | null>> {
  const result = await client
    .from("audio_clips")
    .select(
      `
        id,
        object_key,
        processing_status,
        deleted_at,
        attempt_turns!inner(
          attempts!inner(
            assignment_students!attempts_assignment_student_id_fkey!inner(
              assignments!inner(
                classes!inner(teacher_id)
              )
            )
          )
        )
      `,
    )
    .eq("id", input.audioClipId)
    .eq(clipTeacherPath, input.teacherId)
    .maybeSingle();

  return {
    data: result.data as TeacherOwnedAudioClipSignerRow | null,
    error: result.error,
  };
}
