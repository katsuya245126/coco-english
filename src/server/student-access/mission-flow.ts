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
import { requireOwnedAssignmentStudent } from "@/server/student-access/owned-assignment";
import type { Json } from "@/lib/db/types";
import { assertTransitionRequest } from "@/domain/foundation/status";
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
    const ownedProof1 = await requireOwnedAssignmentStudent({
      studentId: input.studentId,
      assignmentStudentId: input.assignmentStudentId,
    });
    const asRow = ownedProof1.ok ? ownedProof1.owned : null;
    if (!asRow || asRow.status !== "started") {
      return { ok: false, error: "not_found" };
    }

    const attempt = await loadOwnedAttempt(
      supabase,
      input.assignmentStudentId,
      input.attemptId,
    );
    if (!attempt.ok) return attempt;
    if (attempt.attempt.status !== "in_progress") {
      return { ok: false, error: "not_found" };
    }

    const { error } = await supabase
      .from("attempts")
      .update({ needs_review_reason: input.reviewReason })
      .eq("id", input.attemptId)
      .eq("assignment_student_id", input.assignmentStudentId)
      .eq("status", "in_progress");

    return error ? { ok: false, error: "db_error" } : { ok: true };
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

    // 1. Load owned assignment_students row
    const ownedProof2 = await requireOwnedAssignmentStudent({
      studentId: input.studentId,
      assignmentStudentId: input.assignmentStudentId,
    });
    const asRow = ownedProof2.ok ? ownedProof2.owned : null;
    if (!asRow) return { ok: false, error: "not_found" };

    // The seam already interpreted the owned snapshot.
    const snapshot = asRow.snapshot;
    if (!snapshot) return { ok: false, error: "not_found" };

    // 2. If already started, try to resume the existing in_progress attempt
    if (asRow.status === "started" && asRow.latestAttemptId) {
      const { data: attempt } = await supabase
        .from("attempts")
        .select("id, status")
        .eq("id", asRow.latestAttemptId)
        .eq("status", "in_progress")
        .maybeSingle();

      if (attempt) {
        // Load existing turns for resume position
        const { data: turns } = await supabase
          .from("attempt_turns")
          .select("turn_order, original_transcript, repeat_transcript, repeat_accepted, evaluation")
          .eq("attempt_id", attempt.id);

        const resumeTurnOrder = nextUnfinishedTurnOrder(
          snapshot.requiredTurns,
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

    // 3. Create a new attempt only for fresh, late-open, or teacher-reopened work.
    if (
      asRow.status !== "assigned" &&
      asRow.status !== "missed" &&
      asRow.status !== "needs_retry"
    ) {
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
      asRow.status === "needs_retry"
        ? "reopened_by_teacher"
        : asRow.status === "missed"
          ? "late_mission_started"
          : "mission_started";
    assertTransitionRequest({
      previousStatus: asRow.status,
      nextStatus: "started",
      actorType: "student_session",
      reasonCode,
      occurredAt: nowIso,
    });

    // Conditional UPDATE. Use dynamic prior status as the claim guard so optimistic
    // locking works for assigned, missed, and needs_retry paths (T-07-08).
    const { data: claimed, error: claimError } = await supabase
      .from("assignment_students")
      .update({
        status: "started" as const,
        latest_attempt_id: newAttempt.id,
        attempt_count: (asRow.attemptCount ?? 0) + 1,
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

      const ownedProof3 = await requireOwnedAssignmentStudent({
        studentId: input.studentId,
        assignmentStudentId: input.assignmentStudentId,
      });
      const resumed = ownedProof3.ok ? ownedProof3.owned : null;
      if (resumed?.latestAttemptId) {
        return {
          ok: true,
          attemptId: resumed.latestAttemptId,
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
    const ownedProof4 = await requireOwnedAssignmentStudent({
      studentId: input.studentId,
      assignmentStudentId: input.assignmentStudentId,
    });
    const asRow = ownedProof4.ok ? ownedProof4.owned : null;
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
 * Persist Coco's generated line + moderation event for a dynamic conversation
 * turn (CHAT-03/05/06, D-10/D-11/D-13, T-11-08, T-11-11).
 *
 * Upserts on (attempt_id, turn_order) — same idempotency shape as
 * recordAnswer, so a second call for the same turn_order overwrites rather
 * than duplicates. Enforces ownership via requireOwnedAssignmentStudent +
 * loadOwnedAttempt before writing (V4) — never trusts a client-supplied
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

    // Verify ownership
    const ownedProof5 = await requireOwnedAssignmentStudent({
      studentId: input.studentId,
      assignmentStudentId: input.assignmentStudentId,
    });
    const asRow = ownedProof5.ok ? ownedProof5.owned : null;
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
    const ownedProof6 = await requireOwnedAssignmentStudent({
      studentId: input.studentId,
      assignmentStudentId: input.assignmentStudentId,
    });
    const asRow = ownedProof6.ok ? ownedProof6.owned : null;
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
    const ownedProof7 = await requireOwnedAssignmentStudent({
      studentId: input.studentId,
      assignmentStudentId: input.assignmentStudentId,
    });
    const asRow = ownedProof7.ok ? ownedProof7.owned : null;
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
    const newHighest = Math.max(asRow.highestHintLevel ?? 0, input.hintLevel);
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
