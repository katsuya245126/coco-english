"use server";

import { cookies } from "next/headers";
import { studentUnlockSchema } from "@/domain/classroom/student-access-schemas";
import {
  resolveClassById,
  resolveClassByJoinCode,
  type StudentClassContext,
} from "@/server/student-access/class-lookup";
import {
  unlockStudent,
  type StudentUnlockResult,
} from "@/server/student-access/unlock";
import {
  openStudentSession,
  sealStudentSession,
  type StudentUnlockCookie,
} from "@/server/student-access/student-session";

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

// Short-lived, server-only unlock state. This is NOT a persistent student auth
// account (D-17): it is an HttpOnly session cookie that lets the immediate
// navigation to /student/home render the class/name context after a successful
// PIN unlock. It expires with the browser session and carries no PIN. The
// student still re-enters their PIN on every fresh visit (D-13).
const UNLOCK_COOKIE = "coco_student_unlock";

export type { StudentUnlockCookie } from "@/server/student-access/student-session";

// Unlock a student. Validates shape; on ANY validation failure returns the same
// generic mismatch (a malformed PIN/name/code must not be distinguishable from a
// wrong one). Delegates the real verification to unlockStudent and, on success,
// sets a short-lived server-only unlock cookie for the home shell.
export async function unlockStudentAction(input: {
  joinCode: string;
  typedName: string;
  pin: string;
}): Promise<UnlockActionResult> {
  const parsed = studentUnlockSchema.safeParse(input);
  if (!parsed.success) {
    return GENERIC_MISMATCH;
  }

  const result = await unlockStudent(parsed.data);

  if (result.ok) {
    const payload: StudentUnlockCookie = {
      classId: result.classId,
      studentId: result.studentId,
      className: result.className,
      displayName: result.displayName,
    };
    const secret = process.env.STUDENT_ACCESS_SECRET ?? "";
    let token: string;
    try {
      token = sealStudentSession(payload, secret);
    } catch {
      return GENERIC_MISMATCH;
    }

    const cookieStore = await cookies();
    cookieStore.set(UNLOCK_COOKIE, token, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      // Session cookie (no maxAge) — cleared when the browser closes. The PIN is
      // still required on the next fresh visit (D-13/D-17).
    });
  }

  return result;
}

// Read the current short-lived unlock cookie for the home shell. Returns null if
// absent or malformed. Server-only.
export async function readStudentUnlock(): Promise<StudentUnlockCookie | null> {
  const cookieStore = await cookies();
  const raw = cookieStore.get(UNLOCK_COOKIE)?.value;
  if (!raw) return null;
  return openStudentSession(raw, process.env.STUDENT_ACCESS_SECRET ?? "");
}

// Clear the unlock cookie (switch class / sign out of the shell).
export async function clearStudentUnlockAction(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(UNLOCK_COOKIE);
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

// Resolve a REMEMBERED class by its stored immutable id (STUD-02, D-18). The
// remembered device keys on the class id, never on the cached join code, so a
// teacher's join-code reset does not strand it: this returns the CURRENT live
// code. On success the join UI jumps straight to the name + PIN step with the
// fresh code; on failure (class archived/deleted) the UI clears the stale
// remembered entry and falls back to manual entry — never revealing why.
export async function resolveRememberedClassAction(
  classId: string,
): Promise<ResolveClassResult> {
  if (typeof classId !== "string" || classId.trim().length === 0) {
    return { ok: false };
  }

  const context = await resolveClassById(classId);
  if (!context) {
    return { ok: false };
  }

  return { ok: true, class: context };
}
