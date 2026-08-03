"use server";

import { z } from "zod";
import { readStudentUnlock } from "@/app/join/actions";
import {
  completePronunciationAttempt,
  startOrResumePronunciationAttempt,
  type CompletePronunciationAttemptResult,
  type StartPronunciationAttemptResult,
} from "@/server/student-access/pronunciation-flow";

const assignmentInput = z.object({
  assignmentStudentId: z.string().uuid(),
});

const completeInput = assignmentInput.extend({
  attemptId: z.string().uuid(),
});

type SessionExpired = { ok: false; error: "session_expired" };
type InvalidInput = { ok: false; error: "invalid_input" };

export async function startPronunciationAttemptAction(
  input: unknown,
): Promise<StartPronunciationAttemptResult | SessionExpired | InvalidInput> {
  const unlock = await readStudentUnlock();
  if (!unlock) return { ok: false, error: "session_expired" };
  const parsed = assignmentInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_input" };

  return startOrResumePronunciationAttempt({
    studentId: unlock.studentId,
    assignmentStudentId: parsed.data.assignmentStudentId,
  });
}

export async function completePronunciationAttemptAction(
  input: unknown,
): Promise<CompletePronunciationAttemptResult | SessionExpired | InvalidInput> {
  const unlock = await readStudentUnlock();
  if (!unlock) return { ok: false, error: "session_expired" };
  const parsed = completeInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_input" };

  return completePronunciationAttempt({
    studentId: unlock.studentId,
    assignmentStudentId: parsed.data.assignmentStudentId,
    attemptId: parsed.data.attemptId,
  });
}
