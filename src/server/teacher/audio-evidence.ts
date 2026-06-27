import { createSupabaseServiceClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/db/types";

const DEFAULT_AUDIO_BUCKET = "student-audio";
const SIGNED_AUDIO_URL_TTL_SECONDS = 300;

type AttemptStatus = Database["public"]["Enums"]["attempt_status"];
type AudioClipKind = Database["public"]["Enums"]["audio_clip_kind"];
type AudioProcessingStatus =
  Database["public"]["Enums"]["audio_processing_status"];

type NestedRelation<T> = T | T[] | null | undefined;

type AttemptOwnershipRow = {
  id: string;
  status: AttemptStatus;
  started_at: string;
  completed_at: string | null;
  assignment_students: NestedRelation<{
    status: string;
    submitted_at: string | null;
    students: NestedRelation<{
      display_name: string;
    }>;
    assignments: NestedRelation<{
      title: string;
      classes: NestedRelation<{
        teacher_id: string;
      }>;
    }>;
  }>;
};

type AttemptTurnRow = {
  id: string;
  turn_order: number;
  original_transcript: string | null;
  improved_sentence: string | null;
  repeat_transcript: string | null;
};

type AudioClipEvidenceRow = {
  id: string;
  attempt_turn_id: string;
  clip_kind: AudioClipKind;
  processing_status: AudioProcessingStatus;
};

type AudioClipSignerRow = {
  id: string;
  object_key: string | null;
  processing_status: AudioProcessingStatus;
  deleted_at: string | null;
};

export type AttemptAudioClipEvidence = {
  id: string;
  clipKind: AudioClipKind;
  processingStatus: AudioProcessingStatus;
};

export type AttemptTurnEvidence = {
  id: string;
  turnOrder: number;
  originalTranscript: string | null;
  improvedSentence: string | null;
  repeatTranscript: string | null;
  audioClips: AttemptAudioClipEvidence[];
};

export type AttemptEvidence = {
  attemptId: string;
  missionTitle: string;
  studentName: string;
  attemptStatus: AttemptStatus;
  submittedAt: string | null;
  completedAt: string | null;
  turns: AttemptTurnEvidence[];
};

function getStudentAudioBucketId() {
  return process.env.STUDENT_AUDIO_BUCKET || DEFAULT_AUDIO_BUCKET;
}

function one<T>(relation: NestedRelation<T>): T | null {
  if (Array.isArray(relation)) return relation[0] ?? null;
  return relation ?? null;
}

function mapAttemptMetadata(row: AttemptOwnershipRow) {
  const assignmentStudent = one(row.assignment_students);
  const assignment = one(assignmentStudent?.assignments);
  const student = one(assignmentStudent?.students);

  return {
    missionTitle: assignment?.title ?? "Untitled mission",
    studentName: student?.display_name ?? "Unknown student",
    submittedAt: assignmentStudent?.submitted_at ?? null,
  };
}

function mapClip(row: AudioClipEvidenceRow): AttemptAudioClipEvidence {
  return {
    id: row.id,
    clipKind: row.clip_kind,
    processingStatus: row.processing_status,
  };
}

function mapTurn(
  row: AttemptTurnRow,
  clipsByTurnId: Map<string, AttemptAudioClipEvidence[]>,
): AttemptTurnEvidence {
  return {
    id: row.id,
    turnOrder: row.turn_order,
    originalTranscript: row.original_transcript,
    improvedSentence: row.improved_sentence,
    repeatTranscript: row.repeat_transcript,
    audioClips: clipsByTurnId.get(row.id) ?? [],
  };
}

export async function getAttemptEvidenceForTeacher(input: {
  teacherId: string;
  attemptId: string;
}): Promise<AttemptEvidence | null> {
  const supabase = createSupabaseServiceClient();

  const attempt = await supabase
    .from("attempts")
    .select(
      `
        id,
        status,
        started_at,
        completed_at,
        assignment_students!attempts_assignment_student_id_fkey!inner(
          status,
          submitted_at,
          students!inner(display_name),
          assignments!inner(
            title,
            classes!inner(teacher_id)
          )
        )
      `,
    )
    .eq("id", input.attemptId)
    .eq("assignment_students.assignments.classes.teacher_id", input.teacherId)
    .maybeSingle();

  if (attempt.error) {
    throw new Error(`Unable to load attempt evidence: ${attempt.error.message}`);
  }

  if (!attempt.data) {
    return null;
  }

  const turns = await supabase
    .from("attempt_turns")
    .select(
      "id, turn_order, original_transcript, improved_sentence, repeat_transcript",
    )
    .eq("attempt_id", input.attemptId)
    .order("turn_order", { ascending: true });

  if (turns.error) {
    throw new Error(`Unable to load attempt turns: ${turns.error.message}`);
  }

  const turnRows = (turns.data ?? []) as AttemptTurnRow[];
  const turnIds = turnRows.map((turn) => turn.id);
  const clipsByTurnId = new Map<string, AttemptAudioClipEvidence[]>();

  if (turnIds.length > 0) {
    const clips = await supabase
      .from("audio_clips")
      .select("id, attempt_turn_id, clip_kind, processing_status")
      .in("attempt_turn_id", turnIds)
      .order("created_at", { ascending: true });

    if (clips.error) {
      throw new Error(`Unable to load audio clips: ${clips.error.message}`);
    }

    for (const clip of (clips.data ?? []) as AudioClipEvidenceRow[]) {
      const existing = clipsByTurnId.get(clip.attempt_turn_id) ?? [];
      existing.push(mapClip(clip));
      clipsByTurnId.set(clip.attempt_turn_id, existing);
    }
  }

  const metadata = mapAttemptMetadata(attempt.data as AttemptOwnershipRow);

  return {
    attemptId: attempt.data.id,
    missionTitle: metadata.missionTitle,
    studentName: metadata.studentName,
    attemptStatus: attempt.data.status as AttemptStatus,
    submittedAt: metadata.submittedAt,
    completedAt: attempt.data.completed_at,
    turns: turnRows.map((turn) => mapTurn(turn, clipsByTurnId)),
  };
}

export async function createSignedAudioUrlForTeacher(input: {
  teacherId: string;
  audioClipId: string;
}): Promise<{ signedUrl: string } | null> {
  const supabase = createSupabaseServiceClient();

  const clip = await supabase
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
    .eq(
      "attempt_turns.attempts.assignment_students.assignments.classes.teacher_id",
      input.teacherId,
    )
    .maybeSingle();

  if (clip.error) {
    throw new Error(`Unable to load audio clip: ${clip.error.message}`);
  }

  if (!clip.data) {
    return null;
  }

  const ownedClip = clip.data as AudioClipSignerRow;
  if (
    !ownedClip.object_key ||
    ownedClip.deleted_at ||
    ownedClip.processing_status === "deleted" ||
    ownedClip.processing_status === "failed"
  ) {
    return null;
  }

  const signed = await supabase.storage
    .from(getStudentAudioBucketId())
    .createSignedUrl(ownedClip.object_key, SIGNED_AUDIO_URL_TTL_SECONDS);

  if (signed.error || !signed.data?.signedUrl) {
    throw new Error(
      `Unable to create signed audio URL: ${
        signed.error?.message ?? "missing signed URL"
      }`,
    );
  }

  return { signedUrl: signed.data.signedUrl };
}
