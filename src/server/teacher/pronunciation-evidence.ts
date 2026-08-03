import { selectResultTry, pronunciationPracticeSnapshotSchema, type PracticeTryOutcome } from "@/domain/pronunciation/practice";
import { createSupabaseServiceClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/db/types";

type AttemptStatus = Database["public"]["Enums"]["attempt_status"];

type Relation<T> = T | T[] | null | undefined;

function one<T>(value: Relation<T>): T | null {
  return Array.isArray(value) ? value[0] ?? null : value ?? null;
}

const OUTCOMES = new Set<PracticeTryOutcome>([
  "passed",
  "target_weak",
  "word_weak",
  "different_word",
]);

export type PronunciationTryEvidence = {
  id: string;
  audioClipId: string;
  tryNumber: 1 | 2 | 3;
  transcript: string;
  outcome: PracticeTryOutcome;
  wordAccuracy: number | null;
  starBand: 1 | 2 | 3 | null;
  fullWordPassed: boolean | null;
  targetSoundAccuracy: number | null;
  targetSoundPassed: boolean | null;
  processingStatus: string;
  pronunciationScore: { starBand: 1 | 2 | 3 } | null;
  createdAt: string;
};

export type PronunciationWordEvidence = {
  order: number;
  word: string;
  attemptCount: number;
  tries: PronunciationTryEvidence[];
  firstTry: PronunciationTryEvidence | null;
  resultTry: PronunciationTryEvidence | null;
};

export type PronunciationAttemptEvidence = {
  assignmentKind: "pronunciation";
  attemptId: string;
  assignmentStudentId: string;
  assignmentId: string;
  classId: string;
  className: string;
  missionTitle: string;
  studentName: string;
  attemptStatus: AttemptStatus;
  assignmentStudentStatus: string;
  dismissedAt: string | null;
  submittedAt: string | null;
  completedAt: string | null;
  reviewReason: string | null;
  attemptCount: number;
  highestHintLevel: number;
  conversationMode: false;
  turns: [];
  pronunciationWords: PronunciationWordEvidence[];
};

type RawAttempt = {
  id: string;
  status: string;
  completed_at: string | null;
  needs_review_reason: string | null;
  assignment_students: Relation<{
    id: string;
    status: string;
    dismissed_at: string | null;
    submitted_at: string | null;
    attempt_count: number;
    highest_hint_level: number;
    students: Relation<{ display_name: string }>;
    assignments: Relation<{
      id: string;
      title: string;
      assignment_kind: string;
      mission_snapshot: unknown;
      classes: Relation<{ id: string; name: string; teacher_id: string }>;
    }>;
  }>;
  attempt_turns: Relation<{ id: string; turn_order: number }>;
};

type RawTry = {
  id: string;
  attempt_turn_id: string;
  audio_clip_id: string;
  try_number: number;
  transcript: string;
  outcome: string;
  word_accuracy: number | null;
  star_band: number | null;
  full_word_passed: boolean | null;
  target_sound_accuracy: number | null;
  target_sound_passed: boolean | null;
  created_at: string;
  audio_clips: Relation<{
    id: string;
    processing_status: string;
    pronunciation_scores: Relation<{ star_band: number }>;
  }>;
  attempt_turns: Relation<{ id: string; turn_order: number }>;
};

function starBand(value: number | null): 1 | 2 | 3 | null {
  return value === 1 || value === 2 || value === 3 ? value : null;
}

function tryNumber(value: number): 1 | 2 | 3 | null {
  return value === 1 || value === 2 || value === 3 ? value : null;
}

function mapTry(row: RawTry): PronunciationTryEvidence | null {
  const number = tryNumber(row.try_number);
  if (!number || !OUTCOMES.has(row.outcome as PracticeTryOutcome)) return null;
  const clip = one(row.audio_clips);
  const score = one(clip?.pronunciation_scores);
  return {
    id: row.id,
    audioClipId: row.audio_clip_id,
    tryNumber: number,
    transcript: row.transcript,
    outcome: row.outcome as PracticeTryOutcome,
    wordAccuracy: row.word_accuracy,
    starBand: starBand(row.star_band),
    fullWordPassed: row.full_word_passed,
    targetSoundAccuracy: row.target_sound_accuracy,
    targetSoundPassed: row.target_sound_passed,
    processingStatus: clip?.processing_status ?? "failed",
    pronunciationScore: score && starBand(score.star_band) !== null
      ? { starBand: starBand(score.star_band)! }
      : null,
    createdAt: row.created_at,
  };
}

export async function getPronunciationEvidenceForTeacher(input: {
  teacherId: string;
  attemptId: string;
}): Promise<PronunciationAttemptEvidence | null> {
  const supabase = createSupabaseServiceClient();
  const attempt = await supabase
    .from("attempts")
    .select(
      `
        id,
        status,
        completed_at,
        needs_review_reason,
        assignment_students!inner(
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
            assignment_kind,
            mission_snapshot,
            classes!inner(id, name, teacher_id)
          )
        ),
        attempt_turns(id, turn_order)
      `,
    )
    .eq("id", input.attemptId)
    .eq("assignment_students.assignments.classes.teacher_id", input.teacherId)
    .maybeSingle();

  if (attempt.error) {
    throw new Error(`Unable to load pronunciation evidence: ${attempt.error.message}`);
  }
  if (!attempt.data) return null;

  const rawAttempt = attempt.data as unknown as RawAttempt;
  const assignmentStudent = one(rawAttempt.assignment_students);
  const assignment = one(assignmentStudent?.assignments);
  const assignmentClass = one(assignment?.classes);
  const student = one(assignmentStudent?.students);
  if (!assignmentStudent || !assignment || assignment.assignment_kind !== "pronunciation") {
    return null;
  }

  const snapshot = pronunciationPracticeSnapshotSchema.safeParse(
    assignment.mission_snapshot,
  );
  if (!snapshot.success) return null;

  const tries = await supabase
    .from("pronunciation_word_tries")
    .select(
      `
        id,
        attempt_turn_id,
        audio_clip_id,
        try_number,
        transcript,
        outcome,
        word_accuracy,
        star_band,
        full_word_passed,
        target_sound_accuracy,
        target_sound_passed,
        created_at,
        audio_clips!inner(id, processing_status, pronunciation_scores(star_band)),
        attempt_turns!inner(
          id,
          turn_order,
          attempts!inner(
            id,
            assignment_students!inner(
              assignments!inner(classes!inner(teacher_id))
            )
          )
        )
      `,
    )
    .eq("attempt_turns.attempts.id", input.attemptId)
    .eq(
      "attempt_turns.attempts.assignment_students.assignments.classes.teacher_id",
      input.teacherId,
    );

  if (tries.error) {
    throw new Error(`Unable to load pronunciation tries: ${tries.error.message}`);
  }

  const triesByTurnId = new Map<string, PronunciationTryEvidence[]>();
  for (const raw of (tries.data ?? []) as unknown as RawTry[]) {
    const mapped = mapTry(raw);
    if (!mapped) continue;
    const existing = triesByTurnId.get(raw.attempt_turn_id) ?? [];
    existing.push(mapped);
    triesByTurnId.set(raw.attempt_turn_id, existing);
  }
  for (const turnTries of triesByTurnId.values()) {
    turnTries.sort((a, b) => a.tryNumber - b.tryNumber);
  }

  const turnIdByOrder = new Map(
    (Array.isArray(rawAttempt.attempt_turns) ? rawAttempt.attempt_turns : []).map(
      (turn) => [turn.turn_order, turn.id] as const,
    ),
  );
  const pronunciationWords = snapshot.data.words.map((word) => {
    const wordTries = triesByTurnId.get(turnIdByOrder.get(word.order) ?? "") ?? [];
    return {
      order: word.order,
      word: word.text,
      attemptCount: wordTries.length,
      tries: wordTries,
      firstTry: wordTries.find((tryRow) => tryRow.tryNumber === 1) ?? null,
      resultTry: selectResultTry(wordTries),
    };
  });

  return {
    assignmentKind: "pronunciation",
    attemptId: rawAttempt.id,
    assignmentStudentId: assignmentStudent.id,
    assignmentId: assignment.id,
    classId: assignmentClass?.id ?? "",
    className: assignmentClass?.name ?? "",
    missionTitle: assignment.title,
    studentName: student?.display_name ?? "Unknown student",
    attemptStatus: rawAttempt.status as AttemptStatus,
    assignmentStudentStatus: assignmentStudent.status,
    dismissedAt: assignmentStudent.dismissed_at,
    submittedAt: assignmentStudent.submitted_at,
    completedAt: rawAttempt.completed_at,
    reviewReason: rawAttempt.needs_review_reason,
    attemptCount: assignmentStudent.attempt_count,
    highestHintLevel: assignmentStudent.highest_hint_level,
    conversationMode: false,
    turns: [],
    pronunciationWords,
  };
}
