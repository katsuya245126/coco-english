"use server";

import { studentUnlockSchema } from "@/domain/classroom/student-access-schemas";
import {
  resolveClassByJoinCode,
  type StudentClassContext,
} from "@/server/student-access/class-lookup";
import {
  unlockStudent,
  type StudentUnlockResult,
} from "@/server/student-access/unlock";

// Student-access server actions (the browser-facing boundary).
//
// These wrap the server-only student-access services and return ONLY public,
// serializable results. No internal lookup detail (which field matched, teacher
// id, roster, PINs) ever crosses back to the client. The generic-mismatch
// invariant (D-16) is owned by unlockStudent; these actions simply forward its
// single public failure value, and convert any input/validation problem into the
// SAME generic mismatch so the boundary cannot be used to enumerate either.

// The public unlock result the client receives. Identical to the service result:
// success carries minimal class/student context; failure is the single generic
// value.
export type UnlockActionResult = StudentUnlockResult;

const GENERIC_MISMATCH: UnlockActionResult = {
  ok: false,
  error: "generic_mismatch",
};

// Unlock a student. Validates shape; on ANY validation failure returns the same
// generic mismatch (a malformed PIN/name/code must not be distinguishable from a
// wrong one). Delegates the real verification to unlockStudent.
export async function unlockStudentAction(input: {
  joinCode: string;
  typedName: string;
  pin: string;
}): Promise<UnlockActionResult> {
  const parsed = studentUnlockSchema.safeParse(input);
  if (!parsed.success) {
    return GENERIC_MISMATCH;
  }

  return unlockStudent(parsed.data);
}

// The public class-context result for the join routes. We expose only the
// minimal class context (id, display name, resolving code) and never reveal why
// resolution failed.
export type ResolveClassResult =
  | { ok: true; class: StudentClassContext }
  | { ok: false };

// Resolve a class by a typed join code for the manual /join entry step. Returns
// minimal class context for active classes only; unknown/archived -> { ok:false }
// with no reason (the UI shows the generic mismatch copy).
export async function resolveClassAction(
  rawJoinCode: string,
): Promise<ResolveClassResult> {
  if (typeof rawJoinCode !== "string" || rawJoinCode.trim().length === 0) {
    return { ok: false };
  }

  const context = await resolveClassByJoinCode(rawJoinCode);
  if (!context) {
    return { ok: false };
  }

  return { ok: true, class: context };
}
