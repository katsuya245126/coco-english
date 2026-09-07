import { z } from "zod";
import { selectResultTry, pronunciationPracticeSnapshotSchema, type PracticeTryOutcome } from "@/domain/pronunciation/practice";
import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { oneOrMany } from "@/lib/supabase/one-or-many";
import type { Database } from "@/lib/db/types";

type AttemptStatus = Database["public"]["Enums"]["attempt_status"];

const OUTCOMES = new Set<string>([
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

const rawAttemptSchema = z.object({
  id: z.string(),
  status: z.enum([
    "in_progress",
    "completed",
    "abandoned",
    "needs_retry",
    "teacher_review",
  ]),
  completed_at: z.string().nullable(),
  needs_review_reason: z.string().nullable(),
  assignment_students: oneOrMany(
    z.object({
      id: z.string(),
      status: z.string(),
      dismissed_at: z.string().nullable(),
      submitted_at: z.string().nullable(),
      attempt_count: z.number().default(0),
      highest_hint_level: z.number().default(0),
      students: oneOrMany(z.object({ display_name: z.string() })).nullable(),
      assignments: oneOrMany(
        z.object({
          id: z.string(),
          title: z.string(),
          assignment_kind: z.string(),
          mission_snapshot: z.unknown(),
          classes: oneOrMany(
            z.object({ id: z.string(), name: z.string(), teacher_id: z.string() }),
          ).nullable(),
        }),
      ).nullable(),
    }),
  ).nullable(),
  attempt_turns: z.array(z.object({ id: z.string(), turn_order: z.number() })),
});

const rawTrySchema = z.object({
  id: z.string(),
  attempt_turn_id: z.string(),
  audio_clip_id: z.string(),
  try_number: z.number(),
  transcript: z.string(),
  outcome: z.string(),
  word_accuracy: z.number().nullable(),
  star_band: z.number().nullable(),
  full_word_passed: z.boolean().nullable(),
  target_sound_accuracy: z.number().nullable(),
  target_sound_passed: z.boolean().nullable(),
  created_at: z.string(),
  audio_clips: oneOrMany(
    z.object({
      id: z.string(),
      processing_status: z.string(),
      pronunciation_scores: oneOrMany(z.object({ star_band: z.number() })).nullable(),
    }),
  ).nullable(),
});

type RawTry = z.infer<typeof rawTrySchema>;

function isPracticeTryOutcome(value: string): value is PracticeTryOutcome {
  return OUTCOMES.has(value);
}

function starBand(value: number | null): 1 | 2 | 3 | null {
  return value === 1 || value === 2 || value === 3 ? value : null;
}

function tryNumber(value: number): 1 | 2 | 3 | null {
  return value === 1 || value === 2 || value === 3 ? value : null;
}

function mapTry(row: RawTry): PronunciationTryEvidence | null {
  const number = tryNumber(row.try_number);
  if (!number || !isPracticeTryOutcome(row.outcome)) return null;
  const clip = row.audio_clips;
  const score = clip?.pronunciation_scores;
  const scoreBand = score ? starBand(score.star_band) : null;
  return {
    id: row.id,
    audioClipId: row.audio_clip_id,
    tryNumber: number,
    transcript: row.transcript,
    outcome: row.outcome,
    wordAccuracy: row.word_accuracy,
    starBand: starBand(row.star_band),
    fullWordPassed: row.full_word_passed,
    targetSoundAccuracy: row.target_sound_accuracy,
    targetSoundPassed: row.target_sound_passed,
    processingStatus: clip?.processing_status ?? "failed",
    pronunciationScore: scoreBand === null ? null : { starBand: scoreBand },
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

  const parsedAttempt = rawAttemptSchema.safeParse(attempt.data);
  if (!parsedAttempt.success) return null;
  const rawAttempt = parsedAttempt.data;
  const assignmentStudent = rawAttempt.assignment_students;
  const assignment = assignmentStudent?.assignments;
  const assignmentClass = assignment?.classes;
  const student = assignmentStudent?.students;
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
            assignment_students!attempts_assignment_student_id_fkey!inner(
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

  const parsedTries = z.array(rawTrySchema).safeParse(tries.data ?? []);
  if (!parsedTries.success) {
    throw new Error("Unable to load pronunciation tries: unexpected row shape");
  }

  const triesByTurnId = new Map<string, PronunciationTryEvidence[]>();
  for (const raw of parsedTries.data) {
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
    rawAttempt.attempt_turns.map((turn) => [turn.turn_order, turn.id] as const),
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
    attemptStatus: rawAttempt.status,
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
