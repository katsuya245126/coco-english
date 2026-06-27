"use server";

/**
 * Student mission server actions (FLOW-01/02/04/05/07).
 *
 * Each action: (1) reads the unlock cookie, (2) Zod-validates input,
 * (3) delegates to the mission-flow service passing unlock.studentId.
 * No business logic beyond gate + validate + delegate.
 *
 * No AI/LLM client import, no chat/buddy route (AI-06, T-04-01).
 */

import { z } from "zod";
import { readStudentUnlock } from "@/app/join/actions";
import {
  startOrResumeAttempt,
  recordAnswer,
  recordRepeat,
  recordHintReveal,
  completeAttempt,
  type StartOrResumeResult,
  type RecordAnswerResult,
  type RecordRepeatResult,
  type RecordHintRevealResult,
  type CompleteAttemptResult,
} from "@/server/student-access/mission-flow";

// ─── Input schemas ───

const startAttemptSchema = z.object({
  assignmentStudentId: z.string().uuid(),
});

const submitAnswerSchema = z.object({
  assignmentStudentId: z.string().uuid(),
  attemptId: z.string().uuid(),
  turnOrder: z.number().int().positive(),
  originalTranscript: z.string().trim().min(1),
});

const submitRepeatSchema = z.object({
  assignmentStudentId: z.string().uuid(),
  attemptId: z.string().uuid(),
  turnOrder: z.number().int().positive(),
  repeatTranscript: z.string().trim().min(1),
});

const revealHintSchema = z.object({
  assignmentStudentId: z.string().uuid(),
  attemptId: z.string().uuid(),
  turnOrder: z.number().int().positive(),
  hintLevel: z.number().int().min(1).max(3),
});

const completeMissionSchema = z.object({
  assignmentStudentId: z.string().uuid(),
  attemptId: z.string().uuid(),
  requiredTurns: z.number().int().positive(),
});

// ─── Shared error types ───

type SessionExpired = { ok: false; error: "session_expired" };
type InvalidInput = { ok: false; error: "invalid_input" };

// ─── Actions ───

export async function startAttemptAction(
  input: unknown,
): Promise<StartOrResumeResult | SessionExpired | InvalidInput> {
  const unlock = await readStudentUnlock();
  if (!unlock) return { ok: false, error: "session_expired" };

  const parsed = startAttemptSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_input" };

  return startOrResumeAttempt({
    studentId: unlock.studentId,
    assignmentStudentId: parsed.data.assignmentStudentId,
  });
}

export async function submitAnswerAction(
  input: unknown,
): Promise<RecordAnswerResult | SessionExpired | InvalidInput> {
  const unlock = await readStudentUnlock();
  if (!unlock) return { ok: false, error: "session_expired" };

  const parsed = submitAnswerSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_input" };

  return recordAnswer({
    studentId: unlock.studentId,
    assignmentStudentId: parsed.data.assignmentStudentId,
    attemptId: parsed.data.attemptId,
    turnOrder: parsed.data.turnOrder,
    originalTranscript: parsed.data.originalTranscript,
  });
}

export async function submitRepeatAction(
  input: unknown,
): Promise<RecordRepeatResult | SessionExpired | InvalidInput> {
  const unlock = await readStudentUnlock();
  if (!unlock) return { ok: false, error: "session_expired" };

  const parsed = submitRepeatSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_input" };

  return recordRepeat({
    studentId: unlock.studentId,
    assignmentStudentId: parsed.data.assignmentStudentId,
    attemptId: parsed.data.attemptId,
    turnOrder: parsed.data.turnOrder,
    repeatTranscript: parsed.data.repeatTranscript,
  });
}

export async function revealHintAction(
  input: unknown,
): Promise<RecordHintRevealResult | SessionExpired | InvalidInput> {
  const unlock = await readStudentUnlock();
  if (!unlock) return { ok: false, error: "session_expired" };

  const parsed = revealHintSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_input" };

  return recordHintReveal({
    studentId: unlock.studentId,
    assignmentStudentId: parsed.data.assignmentStudentId,
    attemptId: parsed.data.attemptId,
    turnOrder: parsed.data.turnOrder,
    hintLevel: parsed.data.hintLevel,
  });
}

export async function completeMissionAction(
  input: unknown,
): Promise<CompleteAttemptResult | SessionExpired | InvalidInput> {
  const unlock = await readStudentUnlock();
  if (!unlock) return { ok: false, error: "session_expired" };

  const parsed = completeMissionSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_input" };

  return completeAttempt({
    studentId: unlock.studentId,
    assignmentStudentId: parsed.data.assignmentStudentId,
    attemptId: parsed.data.attemptId,
    requiredTurns: parsed.data.requiredTurns,
  });
}
