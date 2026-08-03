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
import type { MissionSnapshot } from "@/domain/mission/schemas";
import {
  resolveActiveStudentQuestion,
  type StudentQuestionTurnFacts,
} from "@/domain/mission/student-question-state";
import {
  getOwnedAttemptForTeacher,
  getOwnedAudioClipForTeacher,
  listOwnedAttemptClipsForTeacher,
  listOwnedAttemptTurnsForTeacher,
  listOwnedPronunciationScoresForTeacher,
} from "@/server/teacher/teacher-owned-queries";
import type {
  TeacherOwnedAttemptEvidenceRow,
  TeacherOwnedAttemptTurnRow,
  TeacherOwnedAudioClipEvidenceRow,
  TeacherOwnedAudioClipSignerRow,
  TeacherOwnedPronunciationScoreRow,
} from "@/server/teacher/teacher-owned-queries";
import {
  isStoredTeacherReview,
  parseStoredEvaluation,
  storedReviewReasonOf,
  storedOriginalOf,
  storedOriginalMetadataOf,
} from "@/domain/ai/stored-evaluation";
import {
  getPronunciationEvidenceForTeacher,
  type PronunciationWordEvidence,
} from "@/server/teacher/pronunciation-evidence";

const DEFAULT_AUDIO_BUCKET = "student-audio";
const SIGNED_AUDIO_URL_TTL_SECONDS = 300;
const CLARIFICATION_LEASE_MS = 5 * 60 * 1000;

type AttemptStatus = Database["public"]["Enums"]["attempt_status"];
type AudioClipKind = Database["public"]["Enums"]["audio_clip_kind"];
type AudioProcessingStatus =
  Database["public"]["Enums"]["audio_processing_status"];

type NestedRelation<T> = T | T[] | null | undefined;

type AttemptOwnershipRow = TeacherOwnedAttemptEvidenceRow;
type AttemptTurnRow = TeacherOwnedAttemptTurnRow;
type AudioClipEvidenceRow = TeacherOwnedAudioClipEvidenceRow;
type PronunciationScoreRow = TeacherOwnedPronunciationScoreRow;
type AudioClipSignerRow = TeacherOwnedAudioClipSignerRow;

export type AttemptPronunciationScoreEvidence = {
  starBand: PronunciationStarBand;
  words: { word: string; label: string }[];
  soundsToWorkOn: {
    label: string;
    ipa: string;
    exampleWord: string;
    candidate?: {
      label: string;
      ipa: string;
    };
  }[];
};

export type AttemptAudioClipEvidence = {
  id: string;
  clipKind: AudioClipKind;
  processingStatus: AudioProcessingStatus;
  /** The immutable transcript captured for this particular audio clip. */
  automaticTranscript: string | null;
  teacherConfirmedText: string | null;
  teacherConfirmedBy: string | null;
  teacherConfirmedAt: string | null;
  clarificationAvailable: boolean;
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
  assignmentKind: "mission" | "pronunciation";
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
  pronunciationWords?: PronunciationWordEvidence[];
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
  snapshot: MissionSnapshot | null;
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
      snapshot: null,
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
    snapshot:
      snapshotResult.kind === "complete" ? snapshotResult.snapshot : null,
  };
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
    ).map(({ label, ipa, exampleWord, candidate }) => ({
      label,
      ipa,
      exampleWord,
      ...(candidate ? { candidate } : {}),
    })),
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
            const phoneme =
              p !== null && typeof p === "object" && !Array.isArray(p)
                ? (p as {
                    phoneme?: unknown;
                    accuracyScore?: unknown;
                    candidates?: unknown;
                  })
                : null;
            const candidates = Array.isArray(phoneme?.candidates)
              ? phoneme.candidates.map((candidate) => {
                  const value =
                    candidate !== null &&
                    typeof candidate === "object" &&
                    !Array.isArray(candidate)
                      ? (candidate as {
                          phoneme?: unknown;
                          score?: unknown;
                        })
                      : null;
                  return {
                    phoneme:
                      typeof value?.phoneme === "string"
                        ? value.phoneme
                        : "",
                    score:
                      typeof value?.score === "number" ? value.score : NaN,
                  };
                })
              : undefined;
            const validCandidates =
              candidates?.every(
                (candidate) =>
                  candidate.phoneme !== "" &&
                  Number.isFinite(candidate.score),
              )
                ? candidates
                : undefined;
            return {
              phoneme:
                typeof phoneme?.phoneme === "string"
                  ? phoneme.phoneme
                  : "",
              accuracyScore:
                typeof phoneme?.accuracyScore === "number"
                  ? phoneme.accuracyScore
                  : 0,
              ...(validCandidates && validCandidates.length > 0
                ? { candidates: validCandidates }
                : {}),
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
  turnById: Map<string, AttemptTurnRow>,
  now: Date,
): AttemptAudioClipEvidence {
  const turn = turnById.get(row.attempt_turn_id);
  const automaticTranscript =
    row.clip_kind === "original_answer"
      ? turn?.original_transcript ?? null
      : row.clip_kind === "repeat_attempt"
        ? turn?.repeat_transcript ?? null
        : null;
  const expiresAt = new Date(row.audio_expires_at);
  const clarificationStartedAt = row.clarification_started_at
    ? new Date(row.clarification_started_at)
    : null;
  const clarificationClaimActive =
    row.clarification_token !== null &&
    (clarificationStartedAt === null ||
      Number.isNaN(clarificationStartedAt.getTime()) ||
      clarificationStartedAt.getTime() > now.getTime() - CLARIFICATION_LEASE_MS);
  const clarificationAvailable =
    (row.clip_kind === "original_answer" || row.clip_kind === "repeat_attempt") &&
    Boolean(row.object_key) &&
    row.deleted_at === null &&
    !Number.isNaN(expiresAt.getTime()) &&
    expiresAt > now &&
    (row.processing_status === "uploaded" ||
      row.processing_status === "transcribed") &&
    !clarificationClaimActive &&
    row.pronunciation_reprocessing_started_at === null;

  return {
    id: row.id,
    clipKind: row.clip_kind,
    processingStatus: row.processing_status,
    automaticTranscript,
    teacherConfirmedText: row.teacher_confirmed_text,
    teacherConfirmedBy: row.teacher_confirmed_by,
    teacherConfirmedAt: row.teacher_confirmed_at,
    clarificationAvailable,
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
  missionContext: AttemptMissionContext,
  turnRows: AttemptTurnRow[],
  targetPatternsByOrder: Map<number, string>,
): AttemptTurnEvidence {
  const question = missionContext.snapshot
    ? resolveActiveStudentQuestion({
        snapshot: missionContext.snapshot,
        savedTurns: turnRows
          .filter((turn) => turn.turn_order < row.turn_order)
          .map(
            (turn): StudentQuestionTurnFacts => ({
              turnOrder: turn.turn_order,
              cocoLine: turn.coco_line,
              evaluation: turn.evaluation,
            }),
          ),
        currentTurn: {
          turnOrder: row.turn_order,
          cocoLine: row.coco_line,
          evaluation: row.evaluation,
        },
      })?.question ?? null
    : missionContext.questionsByOrder.get(row.turn_order) ?? null;

  return {
    id: row.id,
    turnOrder: row.turn_order,
    question,
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
  const attempt = await getOwnedAttemptForTeacher(input);

  if (attempt.error) {
    throw new Error(`Unable to load attempt evidence: ${attempt.error.message}`);
  }

  if (!attempt.data) {
    return null;
  }

  const ownershipRow = attempt.data as AttemptOwnershipRow;
  const assignment = one(one(ownershipRow.assignment_students)?.assignments);
  if (assignment?.assignment_kind === "pronunciation") {
    return getPronunciationEvidenceForTeacher(input);
  }

  const turns = await listOwnedAttemptTurnsForTeacher(input);

  if (turns.error) {
    throw new Error(`Unable to load attempt turns: ${turns.error.message}`);
  }

  const turnRows = turns.data;
  const turnIds = turnRows.map((turn) => turn.id);
  const turnById = new Map(turnRows.map((turn) => [turn.id, turn]));
  const now = new Date();
  const clipsByTurnId = new Map<string, AttemptAudioClipEvidence[]>();

  if (turnIds.length > 0) {
    const clips = await listOwnedAttemptClipsForTeacher({
      ...input,
      turnIds,
    });

    if (clips.error) {
      throw new Error(`Unable to load audio clips: ${clips.error.message}`);
    }

    const clipRows = clips.data;
    const audioClipIds = clipRows.map((clip) => clip.id);
    const scoresByAudioClipId = new Map<
      string,
      AttemptPronunciationScoreEvidence
    >();

    if (audioClipIds.length > 0) {
      const scores = await listOwnedPronunciationScoresForTeacher({
        ...input,
        audioClipIds,
      });

      if (scores.error) {
        throw new Error(
          `Unable to load pronunciation scores: ${scores.error.message}`,
        );
      }

      for (const scoreRow of scores.data) {
        scoresByAudioClipId.set(
          scoreRow.audio_clip_id,
          mapPronunciationScore(scoreRow),
        );
      }
    }

    for (const clip of clipRows) {
      const existing = clipsByTurnId.get(clip.attempt_turn_id) ?? [];
      existing.push(mapClip(clip, scoresByAudioClipId, turnById, now));
      clipsByTurnId.set(clip.attempt_turn_id, existing);
    }
  }

  const metadata = mapAttemptMetadata(ownershipRow);
  const missionContext = readAttemptMissionContext(ownershipRow);

  return {
    assignmentKind: "mission",
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
        missionContext,
        turnRows,
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

  const clip = await getOwnedAudioClipForTeacher(input, supabase);

  if (clip.error) {
    throw new Error(`Unable to load audio clip: ${clip.error.message}`);
  }

  if (!clip.data) {
    return null;
  }

  const ownedClip = clip.data as AudioClipSignerRow;
  const expiresAt = new Date(ownedClip.audio_expires_at);
  if (
    !ownedClip.object_key ||
    ownedClip.deleted_at ||
    Number.isNaN(expiresAt.getTime()) ||
    expiresAt <= new Date() ||
    (ownedClip.processing_status !== "uploaded" &&
      ownedClip.processing_status !== "transcribed")
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
