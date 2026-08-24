import { createSupabaseServiceClient } from "@/lib/supabase/server";
import {
  buildLearnerTranscript,
  hangulInterpretationSchema,
  type HangulInterpretation,
} from "@/domain/audio/transcript-interpretation";
import type { Database } from "@/lib/db/types";
import {
  errorTypeToLabel,
  soundsToWorkOn,
  type PronunciationStarBand,
  type WordScore,
} from "@/domain/pronunciation/scoring";
import {
  interpretMissionSnapshot,
  resolveMissionSnapshotTargetPattern,
} from "@/domain/mission/mission-snapshot";
import {
  isStoredTeacherReview,
  parseStoredEvaluation,
  storedReviewReasonOf,
  storedOriginalOf,
  storedOriginalMetadataOf,
} from "@/domain/ai/stored-evaluation";

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
  needs_review_reason: string | null;
  assignment_students: NestedRelation<{
    id: string;
    status: string;
    dismissed_at: string | null;
    submitted_at: string | null;
    attempt_count: number;
    highest_hint_level: number;
    students: NestedRelation<{
      display_name: string;
    }>;
    assignments: NestedRelation<{
      id: string;
      title: string;
      mission_snapshot: unknown;
      classes: NestedRelation<{
        id: string;
        name: string;
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
  target_attempted: boolean | null;
  repeat_accepted: boolean | null;
  evaluation: unknown;
  coco_line: string | null;
  reply_hint_frame: string | null;
  hint_level_used: number | null;
};

type AudioClipEvidenceRow = {
  id: string;
  attempt_turn_id: string;
  clip_kind: AudioClipKind;
  processing_status: AudioProcessingStatus;
};

type PronunciationScoreRow = {
  audio_clip_id: string;
  star_band: number;
  reference_text: string | null;
  word_scores: unknown;
};

type AudioClipSignerRow = {
  id: string;
  object_key: string | null;
  processing_status: AudioProcessingStatus;
  deleted_at: string | null;
};

export type AttemptPronunciationScoreEvidence = {
  starBand: PronunciationStarBand;
  words: { word: string; label: string }[];
  soundsToWorkOn: {
    label: string;
    ipa: string;
    exampleWord: string;
  }[];
};

export type AttemptAudioClipEvidence = {
  id: string;
  clipKind: AudioClipKind;
  processingStatus: AudioProcessingStatus;
  pronunciationScore?: AttemptPronunciationScoreEvidence | null;
};

export type AttemptTurnEvidence = {
  id: string;
  turnOrder: number;
  question: string | null;
  /** Raw transcript, retained verbatim as teacher evidence. */
  originalTranscript: string | null;
  /** Learner-facing reading, or null when it could not be vouched for. */
  originalDisplayTranscript: string | null;
  improvedSentence: string | null;
  /** Raw transcript, retained verbatim as teacher evidence. */
  repeatTranscript: string | null;
  /** Learner-facing reading, or null when it could not be vouched for. */
  repeatDisplayTranscript: string | null;
  targetPattern: string | null;
  meaningResult: "Understood" | "Try again" | "Needs teacher check";
  targetPatternResult:
    | "Target pattern used"
    | "Target pattern missing"
    | "Needs teacher check";
  repeatResult: "Accepted" | "Try again" | "Needs teacher check" | null;
  reviewReason: string | null;
  /** The reply hint frame offered for this question; null for preset missions. */
  replyHintFrame: string | null;
  /** 0 = student did not expand the hint; higher = leaned on it. */
  hintLevelUsed: number;
  audioClips: AttemptAudioClipEvidence[];
};

export type AttemptEvidence = {
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
  /** Free-talking mission: the target pattern is soft context, not a per-turn goal. */
  conversationMode: boolean;
  turns: AttemptTurnEvidence[];
};

function getStudentAudioBucketId() {
  return process.env.STUDENT_AUDIO_BUCKET || DEFAULT_AUDIO_BUCKET;
}

export function one<T>(relation: NestedRelation<T>): T | null {
  if (Array.isArray(relation)) return relation[0] ?? null;
  return relation ?? null;
}

function mapAttemptMetadata(row: AttemptOwnershipRow) {
  const assignmentStudent = one(row.assignment_students);
  const assignment = one(assignmentStudent?.assignments);
  const assignmentClass = one(assignment?.classes);
  const student = one(assignmentStudent?.students);

  return {
    assignmentStudentId: assignmentStudent?.id ?? "",
    assignmentId: assignment?.id ?? "",
    classId: assignmentClass?.id ?? "",
    className: assignmentClass?.name ?? "",
    assignmentStudentStatus: assignmentStudent?.status ?? "",
    dismissedAt: assignmentStudent?.dismissed_at ?? null,
    missionTitle: assignment?.title ?? "Untitled mission",
    studentName: student?.display_name ?? "Unknown student",
    submittedAt: assignmentStudent?.submitted_at ?? null,
    attemptCount: assignmentStudent?.attempt_count ?? 0,
    highestHintLevel: assignmentStudent?.highest_hint_level ?? 0,
  };
}

type AttemptMissionContext = {
  questionsByOrder: Map<number, string>;
  targetPatternsByOrder: Map<number, string>;
  conversationMode: boolean;
};

function readAttemptMissionContext(
  row: AttemptOwnershipRow,
): AttemptMissionContext {
  const assignment = one(one(row.assignment_students)?.assignments);
  const snapshotResult = interpretMissionSnapshot(
    assignment?.mission_snapshot,
  );

  if (snapshotResult.kind === "invalid") {
    return {
      questionsByOrder: new Map(),
      targetPatternsByOrder: new Map(),
      conversationMode: false,
    };
  }

  const questionsByOrder = new Map(
    snapshotResult.snapshot.turns.map((turn) => [
      turn.turnOrder,
      turn.prompt,
    ] as const),
  );
  const targetPatternsByOrder = new Map<number, string>();
  if (
    snapshotResult.kind === "complete" &&
    !snapshotResult.snapshot.conversationMode
  ) {
    for (const turn of snapshotResult.snapshot.turns) {
      const targetPattern = resolveMissionSnapshotTargetPattern(
        snapshotResult.snapshot,
        turn.turnOrder,
      );
      if (targetPattern) {
        targetPatternsByOrder.set(turn.turnOrder, targetPattern);
      }
    }
  }
  return {
    questionsByOrder,
    targetPatternsByOrder,
    conversationMode:
      snapshotResult.kind === "complete" &&
      snapshotResult.snapshot.conversationMode,
  };
}

/**
 * Fill in the questions a conversation mission asked after its opening turn.
 *
 * Free-talking missions only carry turn 1's prompt in the snapshot; every later
 * question is generated during the attempt and stored on the *previous* turn as
 * `coco_line`. Without this the evidence page shows a question on turn 1 and
 * nothing after it. Mirrors the student recap in `student-history.ts`.
 *
 * Preset missions already have every prompt in the snapshot, so entries added
 * here never overwrite one that is already present.
 */
export function addDynamicTurnQuestions(
  questionsByOrder: Map<number, string>,
  turnRows: AttemptTurnRow[],
): Map<number, string> {
  for (const row of turnRows) {
    const cocoLine = row.coco_line?.trim();
    if (!cocoLine) continue;
    const nextOrder = row.turn_order + 1;
    if (!questionsByOrder.has(nextOrder)) {
      questionsByOrder.set(nextOrder, cocoLine);
    }
  }

  return questionsByOrder;
}

function mapPronunciationScore(
  row: PronunciationScoreRow,
): AttemptPronunciationScoreEvidence {
  const wordScores = parseWordScores(row.word_scores);

  return {
    starBand: row.star_band as PronunciationStarBand,
    words: wordScores.map((word) => ({
      word: word.word,
      label: errorTypeToLabel(word.errorType),
    })),
    // reference_text for an original-answer clip is the student's own
    // transcript, so it correctly scopes sounds to words they actually said.
    soundsToWorkOn: soundsToWorkOn(
      wordScores,
      row.reference_text ?? undefined,
    ).map(({ label, ipa, exampleWord }) => ({ label, ipa, exampleWord })),
  };
}

/** Defensively parse the stored `word_scores` jsonb into typed WordScores. */
export function parseWordScores(raw: unknown): WordScore[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((entry) => {
    const word = entry as {
      word?: unknown;
      accuracyScore?: unknown;
      errorType?: unknown;
      phonemes?: unknown;
    };
    const phonemes = Array.isArray(word.phonemes)
      ? word.phonemes
          .map((p) => {
            const phoneme = p as { phoneme?: unknown; accuracyScore?: unknown };
            return {
              phoneme: typeof phoneme.phoneme === "string" ? phoneme.phoneme : "",
              accuracyScore:
                typeof phoneme.accuracyScore === "number"
                  ? phoneme.accuracyScore
                  : 0,
            };
          })
          .filter((p) => p.phoneme !== "")
      : undefined;

    return {
      word: typeof word.word === "string" ? word.word : "",
      accuracyScore:
        typeof word.accuracyScore === "number" ? word.accuracyScore : 0,
      errorType: typeof word.errorType === "string" ? word.errorType : "None",
      ...(phonemes && phonemes.length > 0 ? { phonemes } : {}),
    };
  });
}

function mapClip(
  row: AudioClipEvidenceRow,
  scoresByAudioClipId: Map<string, AttemptPronunciationScoreEvidence>,
): AttemptAudioClipEvidence {
  return {
    id: row.id,
    clipKind: row.clip_kind,
    processingStatus: row.processing_status,
    pronunciationScore: scoresByAudioClipId.get(row.id) ?? null,
  };
}

function topLevelInterpretationsOf(row: AttemptTurnRow): unknown {
  const parsed = parseStoredEvaluation(row.evaluation);
  return parsed.ok ? parsed.evaluation.hangulInterpretations : undefined;
}

function isTeacherReview(row: AttemptTurnRow) {
  // Shared predicate covers the outcome literal and both review-reason
  // signals (recognized rows and unrecognized legacy objects), so evidence
  // detection cannot fail open where other readers fail closed.
  return isStoredTeacherReview(row.evaluation);
}

function mapMeaningResult(row: AttemptTurnRow): AttemptTurnEvidence["meaningResult"] {
  const original = storedOriginalOf(row.evaluation);
  if (isTeacherReview(row)) return "Needs teacher check";
  if (original?.outcome === "retry_original") return "Try again";
  if (original?.meaningUnderstood === false) return "Try again";
  return "Understood";
}

function mapTargetPatternResult(
  row: AttemptTurnRow,
): AttemptTurnEvidence["targetPatternResult"] {
  if (isTeacherReview(row)) return "Needs teacher check";
  const evaluated = storedOriginalOf(row.evaluation)?.targetPatternAttempted;
  const targetAttempted =
    typeof evaluated === "boolean" ? evaluated : row.target_attempted;
  return targetAttempted ? "Target pattern used" : "Target pattern missing";
}

function mapRepeatResult(row: AttemptTurnRow): AttemptTurnEvidence["repeatResult"] {
  if (!row.repeat_transcript) return null;
  if (isTeacherReview(row) || row.repeat_accepted === null) {
    return "Needs teacher check";
  }
  return row.repeat_accepted ? "Accepted" : "Try again";
}

function mapReviewReason(row: AttemptTurnRow) {
  return storedReviewReasonOf(row.evaluation);
}

function readInterpretations(value: unknown): HangulInterpretation[] {
  const parsed = hangulInterpretationSchema.array().safeParse(value);
  return parsed.success ? parsed.data : [];
}

function mapTurn(
  row: AttemptTurnRow,
  clipsByTurnId: Map<string, AttemptAudioClipEvidence[]>,
  questionsByOrder: Map<number, string>,
  targetPatternsByOrder: Map<number, string>,
): AttemptTurnEvidence {
  return {
    id: row.id,
    turnOrder: row.turn_order,
    question: questionsByOrder.get(row.turn_order) ?? null,
    originalTranscript: row.original_transcript,
    originalDisplayTranscript: row.original_transcript
      ? buildLearnerTranscript(
          row.original_transcript,
          readInterpretations(
            storedOriginalMetadataOf(row.evaluation)?.hangulInterpretations,
          ),
        )
      : null,
    improvedSentence: row.improved_sentence,
    repeatTranscript: row.repeat_transcript,
    repeatDisplayTranscript: row.repeat_transcript
      ? buildLearnerTranscript(
          row.repeat_transcript,
          readInterpretations(topLevelInterpretationsOf(row)),
        )
      : null,
    targetPattern: targetPatternsByOrder.get(row.turn_order) ?? null,
    meaningResult: mapMeaningResult(row),
    targetPatternResult: mapTargetPatternResult(row),
    repeatResult: mapRepeatResult(row),
    reviewReason: mapReviewReason(row),
    replyHintFrame: row.reply_hint_frame,
    hintLevelUsed: row.hint_level_used ?? 0,
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
      "id, turn_order, original_transcript, improved_sentence, repeat_transcript, target_attempted, repeat_accepted, evaluation, coco_line, reply_hint_frame, hint_level_used",
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

    const clipRows = (clips.data ?? []) as AudioClipEvidenceRow[];
    const audioClipIds = clipRows.map((clip) => clip.id);
    const scoresByAudioClipId = new Map<
      string,
      AttemptPronunciationScoreEvidence
    >();

    if (audioClipIds.length > 0) {
      const scores = await supabase
        .from("pronunciation_scores")
        .select("audio_clip_id, star_band, reference_text, word_scores")
        .in("audio_clip_id", audioClipIds);

      if (scores.error) {
        throw new Error(
          `Unable to load pronunciation scores: ${scores.error.message}`,
        );
      }

      for (const scoreRow of (scores.data ??
        []) as PronunciationScoreRow[]) {
        scoresByAudioClipId.set(
          scoreRow.audio_clip_id,
          mapPronunciationScore(scoreRow),
        );
      }
    }

    for (const clip of clipRows) {
      const existing = clipsByTurnId.get(clip.attempt_turn_id) ?? [];
      existing.push(mapClip(clip, scoresByAudioClipId));
      clipsByTurnId.set(clip.attempt_turn_id, existing);
    }
  }

  const ownershipRow = attempt.data as AttemptOwnershipRow;
  const metadata = mapAttemptMetadata(ownershipRow);
  const missionContext = readAttemptMissionContext(ownershipRow);
  const questionsByOrder = missionContext.conversationMode
    ? addDynamicTurnQuestions(missionContext.questionsByOrder, turnRows)
    : missionContext.questionsByOrder;

  return {
    attemptId: attempt.data.id,
    assignmentStudentId: metadata.assignmentStudentId,
    assignmentId: metadata.assignmentId,
    classId: metadata.classId,
    className: metadata.className,
    missionTitle: metadata.missionTitle,
    studentName: metadata.studentName,
    attemptStatus: attempt.data.status as AttemptStatus,
    assignmentStudentStatus: metadata.assignmentStudentStatus,
    dismissedAt: metadata.dismissedAt,
    submittedAt: metadata.submittedAt,
    completedAt: attempt.data.completed_at,
    reviewReason: attempt.data.needs_review_reason,
    attemptCount: metadata.attemptCount,
    highestHintLevel: metadata.highestHintLevel,
    conversationMode: missionContext.conversationMode,
    turns: turnRows.map((turn) =>
      mapTurn(
        turn,
        clipsByTurnId,
        questionsByOrder,
        missionContext.targetPatternsByOrder,
      ),
    ),
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
