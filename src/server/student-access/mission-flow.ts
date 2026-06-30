/**
 * Mission-flow service (D-01..D-08, FLOW-02/04/05/07).
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
import { assertTransitionRequest } from "@/domain/foundation/status";
import { buildPlaceholderEvaluation } from "@/domain/flow/evaluation";
import {
  isAttemptComplete,
  nextUnfinishedTurnOrder,
} from "@/domain/flow/completion";

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
  | "provider_failed";

export type RouteTeacherReviewResult =
  | { ok: true }
  | { ok: false; error: "not_found" | "invalid_transition" | "db_error" };

// ─── Helpers ───

/** Load assignment_students row scoped to both id AND student_id (V4 ownership). */
async function loadOwnedAssignmentStudent(
  supabase: ReturnType<typeof createSupabaseServiceClient>,
  assignmentStudentId: string,
  studentId: string,
) {
  const { data, error } = await supabase
    .from("assignment_students")
    .select("id, assignment_id, student_id, status, latest_attempt_id, attempt_count, highest_hint_level")
    .eq("id", assignmentStudentId)
    .eq("student_id", studentId)
    .maybeSingle();

  if (error || !data) return null;
  return data;
}

async function loadOwnedAttempt(
  supabase: ReturnType<typeof createSupabaseServiceClient>,
  assignmentStudentId: string,
  attemptId: string,
) {
  const { data, error } = await supabase
    .from("attempts")
    .select("id, assignment_student_id, status")
    .eq("id", attemptId)
    .eq("assignment_student_id", assignmentStudentId)
    .maybeSingle();

  if (error) return { ok: false as const, error: "db_error" as const };
  if (!data) return { ok: false as const, error: "not_found" as const };
  return { ok: true as const, attempt: data };
}

// ─── Service functions ───

export async function routeAssignmentStudentToTeacherReview(input: {
  studentId: string;
  assignmentStudentId: string;
  attemptId: string;
  reviewReason: TeacherReviewReason;
}): Promise<RouteTeacherReviewResult> {
  try {
    const supabase = createSupabaseServiceClient();
    const asRow = await loadOwnedAssignmentStudent(
      supabase,
      input.assignmentStudentId,
      input.studentId,
    );
    if (!asRow) return { ok: false, error: "not_found" };

    const { data: attempt, error: attemptError } = await supabase
      .from("attempts")
      .select("id, assignment_student_id")
      .eq("id", input.attemptId)
      .eq("assignment_student_id", input.assignmentStudentId)
      .maybeSingle();

    if (attemptError) return { ok: false, error: "db_error" };
    if (!attempt) return { ok: false, error: "not_found" };

    const { error: reasonError } = await supabase
      .from("attempts")
      .update({ needs_review_reason: input.reviewReason })
      .eq("id", input.attemptId);

    if (reasonError) return { ok: false, error: "db_error" };

    if (asRow.status === "completed" || asRow.status === "teacher_review") {
      return { ok: true };
    }

    const nowIso = new Date().toISOString();
    try {
      assertTransitionRequest({
        previousStatus: asRow.status,
        nextStatus: "teacher_review",
        actorType: "ai_evaluator",
        reasonCode: input.reviewReason,
        occurredAt: nowIso,
      });
    } catch {
      return { ok: false, error: "invalid_transition" };
    }

    const { data: updated, error: updateError } = await supabase
      .from("assignment_students")
      .update({
        status: "teacher_review",
        latest_attempt_id: input.attemptId,
      })
      .eq("id", input.assignmentStudentId)
      .eq("status", asRow.status)
      .select("id")
      .maybeSingle();

    if (updateError) return { ok: false, error: "db_error" };
    if (!updated) return { ok: true };

    const { error: eventError } = await supabase
      .from("assignment_status_events")
      .insert({
        assignment_student_id: input.assignmentStudentId,
        previous_status: asRow.status,
        next_status: "teacher_review",
        actor_type: "ai_evaluator",
        reason_code: input.reviewReason,
      });

    if (eventError) return { ok: false, error: "db_error" };
    return { ok: true };
  } catch {
    return { ok: false, error: "db_error" };
  }
}

/**
 * Start or resume an attempt for an assignment (D-04, Pitfall 1).
 *
 * If status is 'started' and an in_progress attempt exists, resumes it
 * at the next unfinished turn. If status is 'assigned', creates exactly
 * one new attempt and performs the audited assigned->started transition.
 * Never creates a second attempt when one is in_progress.
 */
export async function startOrResumeAttempt(input: {
  studentId: string;
  assignmentStudentId: string;
}): Promise<StartOrResumeResult> {
  try {
    const supabase = createSupabaseServiceClient();

    // 1. Load owned assignment_students row
    const asRow = await loadOwnedAssignmentStudent(
      supabase,
      input.assignmentStudentId,
      input.studentId,
    );
    if (!asRow) return { ok: false, error: "not_found" };

    // 2. If already started, try to resume the existing in_progress attempt
    if (asRow.status === "started" && asRow.latest_attempt_id) {
      const { data: attempt } = await supabase
        .from("attempts")
        .select("id, status")
        .eq("id", asRow.latest_attempt_id)
        .eq("status", "in_progress")
        .maybeSingle();

      if (attempt) {
        // Load existing turns for resume position
        const { data: turns } = await supabase
          .from("attempt_turns")
          .select("turn_order, original_transcript, repeat_transcript, repeat_accepted, evaluation")
          .eq("attempt_id", attempt.id);

        // Get required_turns from the assignment's mission_snapshot
        const { data: assignment } = await supabase
          .from("assignments")
          .select("mission_snapshot")
          .eq("id", asRow.assignment_id)
          .single();

        const snapshot = assignment?.mission_snapshot as { requiredTurns?: number } | null;
        const requiredTurns = snapshot?.requiredTurns ?? 3;

        const resumeTurnOrder = nextUnfinishedTurnOrder(
          requiredTurns,
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
          attemptId: attempt.id,
          isResume: true,
          resumeTurnOrder,
        };
      }
    }

    // 3. Only create a new attempt if status is 'assigned' or 'needs_retry' (D-10)
    if (asRow.status !== "assigned" && asRow.status !== "needs_retry") {
      return { ok: false, error: "not_assigned_or_started" };
    }

    // 4. INSERT new attempt
    const { data: newAttempt, error: attemptError } = await supabase
      .from("attempts")
      .insert({
        assignment_student_id: input.assignmentStudentId,
        status: "in_progress",
      })
      .select("id")
      .single();

    if (attemptError || !newAttempt) {
      return { ok: false, error: "db_error" };
    }

    // 5. Audited transition — use actual prior status and appropriate reason code
    const nowIso = new Date().toISOString();
    const reasonCode =
      asRow.status === "needs_retry" ? "reopened_by_teacher" : "mission_started";
    assertTransitionRequest({
      previousStatus: asRow.status,
      nextStatus: "started",
      actorType: "student_session",
      reasonCode,
      occurredAt: nowIso,
    });

    // Conditional UPDATE. Use dynamic prior status as the claim guard so optimistic
    // locking works for both 'assigned' and 'needs_retry' paths (T-07-08).
    const { data: claimed, error: claimError } = await supabase
      .from("assignment_students")
      .update({
        status: "started" as const,
        latest_attempt_id: newAttempt.id,
        attempt_count: asRow.attempt_count + 1,
      })
      .eq("id", input.assignmentStudentId)
      .eq("status", asRow.status)
      .select("id")
      .maybeSingle();

    if (claimError) return { ok: false, error: "db_error" };

    if (!claimed) {
      await supabase
        .from("attempts")
        .update({ status: "abandoned" as const })
        .eq("id", newAttempt.id);

      const resumed = await loadOwnedAssignmentStudent(
        supabase,
        input.assignmentStudentId,
        input.studentId,
      );
      if (resumed?.latest_attempt_id) {
        return {
          ok: true,
          attemptId: resumed.latest_attempt_id,
          isResume: true,
          resumeTurnOrder: 1,
        };
      }

      return { ok: false, error: "not_assigned_or_started" };
    }

    const { error: eventError } = await supabase
      .from("assignment_status_events")
      .insert({
        assignment_student_id: input.assignmentStudentId,
        previous_status: asRow.status,
        next_status: "started",
        actor_type: "student_session",
        reason_code: reasonCode,
      });

    if (eventError) return { ok: false, error: "db_error" };

    return {
      ok: true,
      attemptId: newAttempt.id,
      isResume: false,
      resumeTurnOrder: 1,
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

    // Verify ownership
    const asRow = await loadOwnedAssignmentStudent(
      supabase,
      input.assignmentStudentId,
      input.studentId,
    );
    if (!asRow) return { ok: false, error: "not_found" };

    const attempt = await loadOwnedAttempt(
      supabase,
      input.assignmentStudentId,
      input.attemptId,
    );
    if (!attempt.ok) return attempt;
    if (attempt.attempt.status !== "in_progress") {
      return { ok: false, error: "not_found" };
    }

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

    if (error) return { ok: false, error: "db_error" };
    return { ok: true };
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

    // Verify ownership
    const asRow = await loadOwnedAssignmentStudent(
      supabase,
      input.assignmentStudentId,
      input.studentId,
    );
    if (!asRow) return { ok: false, error: "not_found" };

    const attempt = await loadOwnedAttempt(
      supabase,
      input.assignmentStudentId,
      input.attemptId,
    );
    if (!attempt.ok) return attempt;
    if (attempt.attempt.status !== "in_progress") {
      return { ok: false, error: "not_found" };
    }

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

    if (error) return { ok: false, error: "db_error" };
    if (!data) return { ok: false, error: "no_turn_row" };
    return { ok: true };
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

    // Verify ownership
    const asRow = await loadOwnedAssignmentStudent(
      supabase,
      input.assignmentStudentId,
      input.studentId,
    );
    if (!asRow) return { ok: false, error: "not_found" };

    const attempt = await loadOwnedAttempt(
      supabase,
      input.assignmentStudentId,
      input.attemptId,
    );
    if (!attempt.ok) return attempt;
    if (attempt.attempt.status !== "in_progress") {
      return { ok: false, error: "not_found" };
    }

    // UPDATE turn: hint_level_used = GREATEST(hint_level_used, hintLevel)
    // Supabase JS client doesn't support SQL GREATEST in update, so we
    // read-then-write with GREATEST semantics via Math.max in app code.
    const { data: turn, error: turnErr } = await supabase
      .from("attempt_turns")
      .select("id, hint_level_used")
      .eq("attempt_id", input.attemptId)
      .eq("turn_order", input.turnOrder)
      .maybeSingle();

    if (turnErr) return { ok: false, error: "db_error" };
    if (!turn) return { ok: false, error: "no_turn_row" };

    const newHintLevel = Math.max(turn.hint_level_used ?? 0, input.hintLevel);

    const { error: updateErr } = await supabase
      .from("attempt_turns")
      .update({ hint_level_used: newHintLevel })
      .eq("id", turn.id);

    if (updateErr) return { ok: false, error: "db_error" };

    // Roll up assignment_students.highest_hint_level = GREATEST(highest_hint_level, hintLevel)
    const newHighest = Math.max(asRow.highest_hint_level ?? 0, input.hintLevel);
    await supabase
      .from("assignment_students")
      .update({ highest_hint_level: newHighest })
      .eq("id", input.assignmentStudentId);

    return { ok: true };
  } catch {
    return { ok: false, error: "db_error" };
  }
}

/**
 * Complete a mission attempt (FLOW-06, D-06).
 *
 * Server-owned audited completion: re-derives completeness from the DB
 * turns via isAttemptComplete. If not complete, writes nothing and returns
 * not_complete. If complete, performs the audited started->completed
 * transition with an assignment_status_events row, stamps
 * attempts.status='completed'+completed_at and
 * assignment_students.submitted_at+latest_attempt_id.
 *
 * Idempotent: a second call on an already-completed assignment returns
 * ok:true without creating a duplicate audit event (Pitfall 3 —
 * conditional UPDATE WHERE status='started' returns 0 rows).
 */
export async function completeAttempt(input: {
  studentId: string;
  assignmentStudentId: string;
  attemptId: string;
  requiredTurns: number;
}): Promise<CompleteAttemptResult> {
  try {
    const supabase = createSupabaseServiceClient();

    // 1. Verify ownership
    const asRow = await loadOwnedAssignmentStudent(
      supabase,
      input.assignmentStudentId,
      input.studentId,
    );
    if (!asRow) return { ok: false, error: "not_found" };

    const attempt = await loadOwnedAttempt(
      supabase,
      input.assignmentStudentId,
      input.attemptId,
    );
    if (!attempt.ok) return attempt;
    if (attempt.attempt.status === "completed" && asRow.status === "completed") {
      return { ok: true };
    }
    if (attempt.attempt.status !== "in_progress") {
      return { ok: false, error: "not_found" };
    }

    // 2. Load attempt turns from DB
    const { data: turns, error: turnsErr } = await supabase
      .from("attempt_turns")
      .select("turn_order, original_transcript, repeat_transcript, repeat_accepted, evaluation")
      .eq("attempt_id", input.attemptId);

    if (turnsErr) return { ok: false, error: "db_error" };

    // 3. Gate on isAttemptComplete — app-owned completion accepts verified
    // originals or accepted repeats, and rejects malformed evaluation JSON.
    if (!isAttemptComplete(input.requiredTurns, turns ?? [])) {
      return { ok: false, error: "not_complete" };
    }

    // 4. Audited started->completed transition
    const nowIso = new Date().toISOString();
    assertTransitionRequest({
      previousStatus: "started",
      nextStatus: "completed",
      actorType: "student_session",
      reasonCode: "mission_completed",
      occurredAt: nowIso,
    });

    // 5. Conditional UPDATE — 0 rows means already completed (idempotent, Pitfall 3)
    const { data: updated, error: updateError } = await supabase
      .from("assignment_students")
      .update({
        status: "completed" as const,
        submitted_at: nowIso,
        latest_attempt_id: input.attemptId,
      })
      .eq("id", input.assignmentStudentId)
      .eq("status", "started")
      .select("id")
      .maybeSingle();

    if (updateError) return { ok: false, error: "db_error" };

    // Only write audit event if the transition actually happened (not duplicate)
    if (updated) {
      const { error: eventError } = await supabase.from("assignment_status_events").insert({
        assignment_student_id: input.assignmentStudentId,
        previous_status: "started",
        next_status: "completed",
        actor_type: "student_session",
        reason_code: "mission_completed",
      });

      if (eventError) return { ok: false, error: "db_error" };
    }

    // 6. Stamp attempt as completed
    const { error: attemptUpdateError } = await supabase
      .from("attempts")
      .update({
        status: "completed" as const,
        completed_at: nowIso,
      })
      .eq("id", input.attemptId);

    if (attemptUpdateError) return { ok: false, error: "db_error" };

    return { ok: true };
  } catch {
    return { ok: false, error: "db_error" };
  }
}
