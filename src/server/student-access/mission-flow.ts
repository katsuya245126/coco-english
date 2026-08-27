/**
 * Mission-flow service (D-01..D-08, FLOW-02/04/05/07; D-01..D-05 Phase 11).
 *
 * Server-only module — performs NO free-text generation and imports NO
 * AI client (AI-06 structural). Uses the service-role client to bypass
 * RLS; every function enforces app-level ownership by filtering on
 * student_id = the caller's unlocked identity.
 *
 * SECURITY: never import into a client component. The service-role key
 * is confined to this module + unlock.ts (T-04-09).
 */

import { createSupabaseServiceClient } from "@/lib/supabase/server";
import {
  requireOwnedAssignmentStudent,
  withOwnedInProgressAttempt,
} from "@/server/student-access/owned-assignment";
import type { Database, Json } from "@/lib/db/types";
import { buildPlaceholderEvaluation } from "@/domain/flow/evaluation";
import { log } from "@/server/logging/logger";
import { nextUnfinishedTurnOrder } from "@/domain/flow/completion";
import { HARD_TURN_CAP } from "@/domain/ai/conversation-generation";

// ─── Result types ───

export type StartOrResumeResult =
  | {
      ok: true;
      attemptId: string;
      isResume: boolean;
      resumeTurnOrder: number;
    }
  | { ok: false; error: "not_found" | "not_assigned_or_started" | "db_error" };

export type RecordAnswerResult =
  | { ok: true }
  | { ok: false; error: "not_found" | "empty_transcript" | "db_error" };

export type RecordRepeatResult =
  | { ok: true }
  | { ok: false; error: "not_found" | "empty_transcript" | "no_turn_row" | "db_error" };

export type RecordHintRevealResult =
  | { ok: true }
  | {
      ok: false;
      error: "not_found" | "invalid_hint_level" | "no_turn_row" | "db_error";
    };

export type CompleteAttemptResult =
  | { ok: true }
  | { ok: false; error: "not_found" | "not_complete" | "db_error" };

export type TeacherReviewReason =
  | "low_confidence"
  | "ambiguous"
  | "failed_schema"
  | "provider_failed"
  | "contract_rejected";

export type RouteTeacherReviewResult =
  | { ok: true }
  | { ok: false; error: "not_found" | "invalid_transition" | "db_error" };

export type RecordCocoLineResult =
  | { ok: true }
  | { ok: false; error: "not_found" | "db_error" };

// ─── Helpers ───

function mapAttemptGuardError(
  error: "not_found_or_canceled" | "db_error",
): "not_found" | "db_error" {
  return error === "db_error" ? "db_error" : "not_found";
}

// ─── Service functions ───

/**
 * Server-owned hard-cap gate for dynamic conversation turns (CHAT-03, T-11-08).
 *
 * HARD_TURN_CAP is a literal constant imported from conversation-generation.ts,
 * entirely independent of a mission's own required_turns — never trust a
 * client-supplied turn number; callers must derive turnOrder from the actual
 * count of attempt_turns rows for the attempt (Pitfall 4).
 */
export function canGenerateNextDynamicTurn(turnOrder: number): boolean {
  return turnOrder <= HARD_TURN_CAP;
}

/**
 * Flag an attempt as needing teacher review WITHOUT terminalizing anything
 * (Task 3, deferred-completion redesign).
 *
 * The assignment stays `started` and the attempt stays `in_progress` — a
 * teacher-review turn is not necessarily the mission's final turn, and the
 * client must be able to keep advancing the conversation (hints, TTS, the
 * next recording) against a still-active attempt. The ONLY place that
 * terminalizes a reviewed conversation is the atomic `complete_student_attempt`
 * RPC, which inspects `attempts.needs_review_reason` once the mission's
 * required turn count is reached and atomically chooses `teacher_review` vs
 * `completed` as the terminal status (see the
 * 202607230002_deferred_teacher_review_completion.sql migration).
 *
 * Never writes assignment_students.status, attempts.status, or an
 * assignment_status_events row — those are exclusively RPC-owned once this
 * function returns. Independently verifies both ownership hops (the
 * assignment_student belongs to the calling student and is `started`, and the
 * attempt belongs to that assignment_student and is `in_progress`) before
 * writing anything.
 */
export async function flagAttemptForTeacherReview(input: {
  studentId: string;
  assignmentStudentId: string;
  attemptId: string;
  reviewReason: TeacherReviewReason;
}): Promise<RouteTeacherReviewResult> {
  try {
    const supabase = createSupabaseServiceClient();
    const result = await withOwnedInProgressAttempt(input, async (owned) => {
      if (owned.status !== "started") {
        return { ok: false, error: "not_found" } as const;
      }

      const { error } = await supabase
        .from("attempts")
        .update({ needs_review_reason: input.reviewReason })
        .eq("id", input.attemptId)
        .eq("assignment_student_id", input.assignmentStudentId)
        .eq("status", "in_progress");

      return error
        ? ({ ok: false, error: "db_error" } as const)
        : ({ ok: true } as const);
    });

    if (!result.ok) {
      return { ok: false, error: mapAttemptGuardError(result.error) };
    }
    return result.value;
  } catch {
    return { ok: false, error: "db_error" };
  }
}

/**
 * Start or resume an attempt for an assignment (D-04, Pitfall 1).
 *
 * If status is 'started' and an in_progress attempt exists, resumes it
 * at the next unfinished turn. If status is 'assigned', 'missed', or
 * 'needs_retry', creates exactly one new attempt and performs the audited
 * transition to started.
 * Never creates a second attempt when one is in_progress.
 */
export async function startOrResumeAttempt(input: {
  studentId: string;
  assignmentStudentId: string;
}): Promise<StartOrResumeResult> {
  try {
    const supabase = createSupabaseServiceClient();

    // The RPC owns status, snapshot, ownership, attempt, count, and event
    // decisions under one database lock. This service only maps its result and
    // loads turns when the database resumed an active attempt.
    const { data, error } = await supabase.rpc("start_student_attempt", {
      p_student_id: input.studentId,
      p_assignment_student_id: input.assignmentStudentId,
    });

    if (error) return { ok: false, error: "db_error" };

    const result = (Array.isArray(data) ? data[0] : data) as
      | Database["public"]["Functions"]["start_student_attempt"]["Returns"][number]
      | undefined;
    if (!result) return { ok: false, error: "db_error" };
    if (result.outcome !== "ok") {
      return { ok: false, error: result.outcome };
    }
    if (!result.attempt_id) return { ok: false, error: "db_error" };

    if (!result.is_resume) {
      return {
        ok: true,
        attemptId: result.attempt_id,
        isResume: false,
        resumeTurnOrder: 1,
      };
    }

    if (result.required_turns === null) return { ok: false, error: "db_error" };

    const { data: turns } = await supabase
      .from("attempt_turns")
      .select("turn_order, original_transcript, repeat_transcript, repeat_accepted, evaluation")
      .eq("attempt_id", result.attempt_id);

    const resumeTurnOrder = nextUnfinishedTurnOrder(
      result.required_turns,
      (turns ?? []).map((t) => ({
        turn_order: t.turn_order,
        original_transcript: t.original_transcript,
        repeat_transcript: t.repeat_transcript,
        repeat_accepted: t.repeat_accepted,
        evaluation: t.evaluation,
      })),
    );

    return {
      ok: true,
      attemptId: result.attempt_id,
      isResume: true,
      resumeTurnOrder,
    };
  } catch {
    return { ok: false, error: "db_error" };
  }
}

/**
 * Record a student's answer for a turn (D-01, D-02, Pitfall 2).
 *
 * Upserts on (attempt_id, turn_order) unique key for idempotency.
 * Writes original_transcript, target_attempted=true (truthful), and
 * evaluation = buildPlaceholderEvaluation(). Never sets repeat fields.
 * Rejects empty/whitespace transcript (the only gate — D-02 never
 * blocks on eval).
 */
export async function recordAnswer(input: {
  studentId: string;
  assignmentStudentId: string;
  attemptId: string;
  turnOrder: number;
  originalTranscript: string;
}): Promise<RecordAnswerResult> {
  const trimmed = input.originalTranscript.trim();
  if (trimmed.length === 0) {
    return { ok: false, error: "empty_transcript" };
  }

  try {
    const supabase = createSupabaseServiceClient();
    const result = await withOwnedInProgressAttempt(input, async () => {
      // Upsert on (attempt_id, turn_order) — Pitfall 2 idempotency
      const { error } = await supabase
        .from("attempt_turns")
        .upsert(
          {
            attempt_id: input.attemptId,
            turn_order: input.turnOrder,
            original_transcript: trimmed,
            target_attempted: true,
            evaluation: buildPlaceholderEvaluation(),
          },
          { onConflict: "attempt_id,turn_order" },
        );

      return error
        ? ({ ok: false, error: "db_error" } as const)
        : ({ ok: true } as const);
    });

    if (!result.ok) {
      return { ok: false, error: mapAttemptGuardError(result.error) };
    }
    return result.value;
  } catch {
    return { ok: false, error: "db_error" };
  }
}

/**
 * Persist Coco's generated line + moderation event for a dynamic conversation
 * turn (CHAT-03/05/06, D-10/D-11/D-13, T-11-08, T-11-11).
 *
 * Upserts on (attempt_id, turn_order) — same idempotency shape as
 * recordAnswer, so a second call for the same turn_order overwrites rather
 * than duplicates. Enforces ownership via withOwnedInProgressAttempt around
 * the write (V4) — never trusts a client-supplied
 * turn number. Generation/moderation calls themselves live in the
 * orchestration layer (audio-upload.ts); this function is persistence-only,
 * preserving the "imports NO AI client" boundary above.
 */
export async function recordCocoLine(input: {
  studentId: string;
  assignmentStudentId: string;
  attemptId: string;
  turnOrder: number;
  cocoLine: string;
  moderationEvent?: object | null;
  evaluation?: Json;
}): Promise<RecordCocoLineResult> {
  try {
    const supabase = createSupabaseServiceClient();
    const result = await withOwnedInProgressAttempt(input, async () => {
      // Upsert on (attempt_id, turn_order) — idempotent, mirrors recordAnswer
      const { error } = await supabase
        .from("attempt_turns")
        .upsert(
          {
            attempt_id: input.attemptId,
            turn_order: input.turnOrder,
            coco_line: input.cocoLine,
            moderation_event: (input.moderationEvent ?? null) as Json,
            ...(input.evaluation === undefined ? {} : { evaluation: input.evaluation }),
          },
          { onConflict: "attempt_id,turn_order" },
        );

      return error
        ? ({ ok: false, error: "db_error" } as const)
        : ({ ok: true } as const);
    });

    if (!result.ok) {
      return { ok: false, error: mapAttemptGuardError(result.error) };
    }
    return result.value;
  } catch {
    return { ok: false, error: "db_error" };
  }
}

/**
 * Record a student's repeat for a turn (D-05).
 *
 * Updates the EXISTING turn row — never inserts a new one. Sets
 * repeat_transcript and repeat_accepted=true (accept-any-non-empty).
 * Rejects empty/whitespace repeat.
 */
export async function recordRepeat(input: {
  studentId: string;
  assignmentStudentId: string;
  attemptId: string;
  turnOrder: number;
  repeatTranscript: string;
}): Promise<RecordRepeatResult> {
  const trimmed = input.repeatTranscript.trim();
  if (trimmed.length === 0) {
    return { ok: false, error: "empty_transcript" };
  }

  try {
    const supabase = createSupabaseServiceClient();
    const result = await withOwnedInProgressAttempt(input, async () => {
      // UPDATE existing turn row (never insert a new one)
      const { data, error } = await supabase
        .from("attempt_turns")
        .update({
          repeat_transcript: trimmed,
          repeat_accepted: true,
        })
        .eq("attempt_id", input.attemptId)
        .eq("turn_order", input.turnOrder)
        .select("id")
        .maybeSingle();

      if (error) return { ok: false, error: "db_error" } as const;
      if (!data) return { ok: false, error: "no_turn_row" } as const;
      return { ok: true } as const;
    });

    if (!result.ok) {
      return { ok: false, error: mapAttemptGuardError(result.error) };
    }
    return result.value;
  } catch {
    return { ok: false, error: "db_error" };
  }
}

/**
 * Record a hint reveal for a turn (D-07, D-08, Pitfall 7).
 *
 * Record-only: NEVER touches status, attempt completion, or
 * repeat_accepted. Uses GREATEST for hint rollup so levels never
 * regress. Validates hintLevel in 1..3.
 */
export async function recordHintReveal(input: {
  studentId: string;
  assignmentStudentId: string;
  attemptId: string;
  turnOrder: number;
  hintLevel: number;
}): Promise<RecordHintRevealResult> {
  if (
    !Number.isInteger(input.hintLevel) ||
    input.hintLevel < 1 ||
    input.hintLevel > 3
  ) {
    return { ok: false, error: "invalid_hint_level" };
  }

  try {
    const supabase = createSupabaseServiceClient();
    const { data, error } = await supabase.rpc("record_hint_reveal", {
      p_student_id: input.studentId,
      p_assignment_student_id: input.assignmentStudentId,
      p_attempt_id: input.attemptId,
      p_turn_order: input.turnOrder,
      p_hint_level: input.hintLevel,
    });

    if (error) return { ok: false, error: "db_error" };
    switch (data) {
      case "ok":
        return { ok: true };
      case "not_found":
      case "invalid_hint_level":
      case "no_turn_row":
        return { ok: false, error: data };
      default:
        return { ok: false, error: "db_error" };
    }
  } catch {
    return { ok: false, error: "db_error" };
  }
}

/**
 * Complete a mission attempt (FLOW-06, D-06).
 *
 * The database RPC owns validation, row locks, status changes, and the audit
 * insert so completion is atomic and idempotent.
 */
export async function completeAttempt(input: {
  studentId: string;
  assignmentStudentId: string;
  attemptId: string;
}): Promise<CompleteAttemptResult> {
  try {
    const supabase = createSupabaseServiceClient();

    const ownedProof8 = await requireOwnedAssignmentStudent({
      studentId: input.studentId,
      assignmentStudentId: input.assignmentStudentId,
    });
    const asRow = ownedProof8.ok ? ownedProof8.owned : null;
    if (!asRow) return { ok: false, error: "not_found" };

    // The seam already interpreted the owned snapshot.
    const snapshot = asRow.snapshot;
    if (!snapshot) return { ok: false, error: "not_found" };

    const { data, error } = await supabase.rpc("complete_student_attempt", {
      p_student_id: input.studentId,
      p_assignment_student_id: input.assignmentStudentId,
      p_attempt_id: input.attemptId,
    });

    if (error) {
      log("error", "assignment.completion_failed", {
        assignmentStudentId: input.assignmentStudentId,
        error: error.message,
      });
      return { ok: false, error: "db_error" };
    }

    if (data === "not_found") return { ok: false, error: "not_found" };
    if (data === "not_complete") return { ok: false, error: "not_complete" };
    if (data !== "ok") return { ok: false, error: "db_error" };

    log("info", "assignment.completed", {
      assignmentStudentId: input.assignmentStudentId,
      attemptId: input.attemptId,
    });
    return { ok: true };
  } catch {
    return { ok: false, error: "db_error" };
  }
}
