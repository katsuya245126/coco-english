/**
 * Mission-flow service for start/resume, hints, completion, and turn caps.
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
import { requireOwnedAssignmentStudent } from "@/server/student-access/owned-assignment";
import type { Database } from "@/lib/db/types";
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

export type RecordHintRevealResult =
  | { ok: true }
  | {
      ok: false;
      error: "not_found" | "invalid_hint_level" | "no_turn_row" | "db_error";
    };

export type CompleteAttemptResult =
  | { ok: true }
  | { ok: false; error: "not_found" | "not_complete" | "db_error" };

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
