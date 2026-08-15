import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { wordsToPractice, type WordScore } from "@/domain/pronunciation/scoring";
import {
  interpretMissionSnapshot,
  resolveMissionSnapshotTargetPattern,
} from "@/domain/mission/mission-snapshot";
import {
  buildLearnerTranscript,
  hangulInterpretationSchema,
  type HangulInterpretation,
} from "@/domain/audio/transcript-interpretation";

const AUDIO_TTL_SECONDS = 300;
const AUDIO_BUCKET = "student-audio";

export type StudentRecapPronunciation = {
  starBand: 1 | 2 | 3;
  words: { word: string; label: string }[];
};

export type StudentRecapAudioClip = {
  id: string;
  playback: "available" | "expired" | "unavailable";
};

export type StudentRecapAttempt = {
  /** Learner-safe text, or null when a Hangul span could not be vouched for. */
  transcript: string | null;
  audio: StudentRecapAudioClip | null;
  pronunciation: StudentRecapPronunciation | null;
};

export type StudentRecapReviewState =
  | "accepted"
  | "accepted_minor"
  | "repeat_accepted"
  | "neutral";

export type StudentRecapTurn = {
  id: string;
  turnOrder: number;
  targetPattern: string | null;
  cocoPrompt: string;
  transcript: string | null;
  audio: StudentRecapAudioClip | null;
  pronunciation: StudentRecapPronunciation | null;
  original: StudentRecapAttempt;
  improvedSentence: string | null;
  repeat: StudentRecapAttempt | null;
  reviewState: StudentRecapReviewState;
};

export type StudentMissionRecap = {
  assignmentStudentId: string;
  title: string;
  completedAt: string | null;
  conversationMode: boolean;
  characterId: string;
  finalCocoLine: string | null;
  turns: StudentRecapTurn[];
};

function readInterpretations(value: unknown): HangulInterpretation[] {
  const parsed = hangulInterpretationSchema.array().safeParse(value);
  return parsed.success ? parsed.data : [];
}

function readEvaluationObject(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/**
 * Absent or malformed metadata yields an empty set, which is right in both
 * directions: a legacy all-English row still displays verbatim, and any row
 * containing Hangul fails closed to `null`.
 */
function displayFor(
  rawTranscript: string,
  evaluation: Record<string, unknown> | null,
): string | null {
  return buildLearnerTranscript(
    rawTranscript,
    readInterpretations(evaluation?.hangulInterpretations),
  );
}

function playbackFor(clip: { object_key: string | null; processing_status: string; audio_expires_at: string | null; deleted_at: string | null }) {
  if (clip.deleted_at || (clip.audio_expires_at && Date.parse(clip.audio_expires_at) <= Date.now())) return "expired" as const;
  if (!clip.object_key || clip.processing_status === "failed" || clip.processing_status === "deleted") return "unavailable" as const;
  return "available" as const;
}

function reviewStateFor(turn: {
  improved_sentence: string | null;
  repeat_transcript: string | null;
  repeat_accepted: boolean | null;
  evaluation: unknown;
}): StudentRecapReviewState {
  if (turn.repeat_accepted === true && turn.repeat_transcript?.trim()) {
    return "repeat_accepted";
  }
  const evaluation =
    turn.evaluation && typeof turn.evaluation === "object"
      ? (turn.evaluation as {
          outcome?: unknown;
          correctionSeverity?: unknown;
        })
      : null;
  if (
    evaluation?.outcome === "accepted_original" &&
    evaluation.correctionSeverity === "minor" &&
    turn.improved_sentence?.trim()
  ) {
    return "accepted_minor";
  }
  if (
    evaluation?.outcome === "accepted_original" ||
    (!turn.improved_sentence && !turn.repeat_transcript && !evaluation)
  ) {
    return "accepted";
  }
  return "neutral";
}

export async function getCompletedMissionRecap(studentId: string, assignmentStudentId: string): Promise<StudentMissionRecap | null> {
  const supabase = createSupabaseServiceClient();
  const owned = await supabase.from("assignment_students").select("id, status, latest_attempt_id, submitted_at, assignments!inner(title, mission_snapshot, canceled_at)")
    .eq("id", assignmentStudentId).eq("student_id", studentId).in("status", ["completed", "teacher_review"]).maybeSingle();
  if (owned.error) {
    throw new Error(`Unable to load owned recap: ${owned.error.message}`);
  }
  if (!owned.data) return null;
  const row = owned.data as { id: string; latest_attempt_id: string | null; submitted_at: string | null; assignments: { title: string; mission_snapshot: unknown; canceled_at: string | null } | Array<{ title: string; mission_snapshot: unknown; canceled_at: string | null }> };
  const assignment = Array.isArray(row.assignments) ? row.assignments[0] : row.assignments;
  const snapshotResult = interpretMissionSnapshot(assignment?.mission_snapshot);
  if (
    !row.latest_attempt_id ||
    !assignment ||
    assignment.canceled_at ||
    snapshotResult.kind === "invalid"
  ) {
    return null;
  }
  const snapshot = snapshotResult.snapshot;
  const conversationMode =
    snapshotResult.kind === "complete" && snapshotResult.snapshot.conversationMode;

  const attempt = await supabase.from("attempts").select("id, status, completed_at").eq("id", row.latest_attempt_id).eq("assignment_student_id", row.id).in("status", ["completed", "teacher_review"]).maybeSingle();
  if (attempt.error || !attempt.data) return null;
  const turnsResult = await supabase.from("attempt_turns").select("id, turn_order, original_transcript, improved_sentence, repeat_transcript, repeat_accepted, evaluation, coco_line").eq("attempt_id", row.latest_attempt_id).order("turn_order", { ascending: true });
  if (turnsResult.error) throw new Error(`Unable to load recap turns: ${turnsResult.error.message}`);
  const turnRows = (turnsResult.data ?? []) as Array<{
    id: string;
    turn_order: number;
    original_transcript: string | null;
    improved_sentence: string | null;
    repeat_transcript: string | null;
    repeat_accepted: boolean | null;
    evaluation: unknown;
    coco_line: string | null;
  }>;
  const ids = turnRows.map((turn) => turn.id);
  let clips: Array<{ id: string; attempt_turn_id: string; clip_kind: string; object_key: string | null; processing_status: string; audio_expires_at: string | null; deleted_at: string | null }> = [];
  if (ids.length) {
    const result = await supabase.from("audio_clips").select("id, attempt_turn_id, clip_kind, object_key, processing_status, audio_expires_at, deleted_at").in("attempt_turn_id", ids).order("created_at", { ascending: true });
    if (result.error) throw new Error(`Unable to load recap audio: ${result.error.message}`);
    clips = result.data ?? [];
  }
  const clipIds = clips.map((clip) => clip.id);
  let scores: Array<{ audio_clip_id: string; star_band: number; word_scores: unknown }> = [];
  if (clipIds.length) {
    const result = await supabase.from("pronunciation_scores").select("audio_clip_id, star_band, word_scores").in("audio_clip_id", clipIds);
    if (result.error) throw new Error(`Unable to load recap pronunciation: ${result.error.message}`);
    scores = result.data ?? [];
  }

  function attemptFor(turnId: string, clipKind: "original_answer" | "repeat_attempt", transcript: string | null): StudentRecapAttempt {
    const clip = clips.find((item) => item.attempt_turn_id === turnId && item.clip_kind === clipKind) ?? null;
    const score = clip ? scores.find((item) => item.audio_clip_id === clip.id) : undefined;
    return {
      transcript,
      audio: clip ? { id: clip.id, playback: playbackFor(clip) } : null,
      pronunciation: score && [1, 2, 3].includes(score.star_band) ? { starBand: score.star_band as 1 | 2 | 3, words: transcript !== null && Array.isArray(score.word_scores) ? wordsToPractice(score.word_scores as WordScore[], transcript) : [] } : null,
    };
  }

  const presetPrompts = new Map(snapshot.turns.map((turn) => [turn.turnOrder, turn.prompt]));
  let nextDynamicPrompt = snapshot.turns[0]?.prompt ?? "Coco's question";
  let finalCocoLine: string | null = null;

  const turns: StudentRecapTurn[] = turnRows.map((turn) => {
    const acceptedRepeat = turn.repeat_accepted === true && Boolean(turn.repeat_transcript);
    const storedEvaluation = readEvaluationObject(turn.evaluation);
    const original = attemptFor(
      turn.id,
      "original_answer",
      displayFor(
        turn.original_transcript ?? "",
        readEvaluationObject(storedEvaluation?.originalEvaluation) ?? storedEvaluation,
      ),
    );
    const repeat = turn.repeat_transcript?.trim()
      ? attemptFor(turn.id, "repeat_attempt", displayFor(turn.repeat_transcript, storedEvaluation))
      : null;
    const transcript = acceptedRepeat ? repeat!.transcript : original.transcript;

    const cocoPrompt = conversationMode
      ? nextDynamicPrompt
      : presetPrompts.get(turn.turn_order) ?? "Coco's question";

    if (conversationMode) {
      if (turn.coco_line?.trim()) {
        nextDynamicPrompt = turn.coco_line.trim();
        finalCocoLine = turn.coco_line.trim();
      }
    }

    return {
      id: turn.id,
      turnOrder: turn.turn_order,
      targetPattern:
        snapshotResult.kind === "complete" && !conversationMode
          ? resolveMissionSnapshotTargetPattern(
              snapshotResult.snapshot,
              turn.turn_order,
            )
          : null,
      cocoPrompt,
      transcript,
      audio: acceptedRepeat ? repeat!.audio : original.audio,
      pronunciation: acceptedRepeat ? repeat!.pronunciation : original.pronunciation,
      original,
      improvedSentence: turn.improved_sentence?.trim() || null,
      repeat,
      reviewState: reviewStateFor(turn),
    };
  });

  return {
    assignmentStudentId: row.id,
    title: assignment.title,
    completedAt: (attempt.data as { completed_at: string | null }).completed_at ?? row.submitted_at,
    conversationMode,
    characterId: snapshot.characterId,
    finalCocoLine: conversationMode ? finalCocoLine : null,
    turns,
  };
}

export async function createSignedHistoryAudioUrl(studentId: string, audioClipId: string): Promise<{ signedUrl: string } | null> {
  const supabase = createSupabaseServiceClient();
  const clip = await supabase.from("audio_clips").select("id, object_key, processing_status, audio_expires_at, deleted_at, attempt_turns!inner(attempts!inner(id, status, assignment_students!attempts_assignment_student_id_fkey!inner(student_id, status, latest_attempt_id, assignments!inner(canceled_at))))")
    .eq("id", audioClipId).eq("attempt_turns.attempts.assignment_students.student_id", studentId).in("attempt_turns.attempts.assignment_students.status", ["completed", "teacher_review"]).in("attempt_turns.attempts.status", ["completed", "teacher_review"]).maybeSingle();
  if (clip.error || !clip.data) return null;
  const row = clip.data as unknown as { object_key: string | null; processing_status: string; audio_expires_at: string | null; deleted_at: string | null; attempt_turns: { attempts: { id: string; assignment_students: { latest_attempt_id: string | null; assignments: { canceled_at: string | null } } } } };
  const turn = Array.isArray(row.attempt_turns) ? row.attempt_turns[0] : row.attempt_turns;
  const attempt = Array.isArray(turn?.attempts) ? turn.attempts[0] : turn?.attempts;
  const assignmentStudent = Array.isArray(attempt?.assignment_students) ? attempt.assignment_students[0] : attempt?.assignment_students;
  const assignment = Array.isArray(assignmentStudent?.assignments) ? assignmentStudent.assignments[0] : assignmentStudent?.assignments;
  if (!attempt || !assignmentStudent || attempt.id !== assignmentStudent.latest_attempt_id || assignment?.canceled_at || playbackFor(row) !== "available") return null;
  const signed = await supabase.storage.from(process.env.STUDENT_AUDIO_BUCKET || AUDIO_BUCKET).createSignedUrl(row.object_key!, AUDIO_TTL_SECONDS);
  if (signed.error || !signed.data?.signedUrl) return null;
  return { signedUrl: signed.data.signedUrl };
}
