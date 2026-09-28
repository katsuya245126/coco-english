import { createHmac, timingSafeEqual } from "node:crypto";

// Short-lived, server-only unlock state. This is NOT a persistent student auth
// account (D-17): it is an HttpOnly session cookie that lets the immediate
// navigation to /student/home render the class/name context after a successful
// PIN unlock. It expires with the browser session and carries no PIN. The
// student still re-enters their PIN on every fresh visit (D-13).
export const STUDENT_UNLOCK_COOKIE = "coco_student_unlock";
export const STUDENT_SESSION_TTL_MS = 8 * 60 * 60 * 1_000;

export type StudentUnlockCookie = {
  classId: string;
  studentId: string;
  className: string;
  displayName: string;
};

type SessionPayload = StudentUnlockCookie & {
  version: 1;
  expiresAt: number;
};

function signature(body: string, secret: string): Buffer {
  return createHmac("sha256", secret)
    .update(`student-session:v1:${body}`)
    .digest();
}

function validSecret(secret: string): boolean {
  return Buffer.byteLength(secret) >= 32 && !secret.startsWith("replace-with-");
}

export function sealStudentSession(
  payload: StudentUnlockCookie,
  secret: string,
  now = Date.now(),
): string {
  if (!validSecret(secret)) throw new Error("STUDENT_ACCESS_SECRET is invalid");
  const body = Buffer.from(
    JSON.stringify({
      ...payload,
      version: 1,
      expiresAt: now + STUDENT_SESSION_TTL_MS,
    } satisfies SessionPayload),
  ).toString("base64url");
  return `${body}.${signature(body, secret).toString("base64url")}`;
}

export function openStudentSession(
  token: string,
  secret: string,
  now = Date.now(),
): StudentUnlockCookie | null {
  if (!validSecret(secret)) return null;
  const [body, encodedSignature, extra] = token.split(".");
  if (!body || !encodedSignature || extra) return null;

  try {
    const actual = Buffer.from(encodedSignature, "base64url");
    const expected = signature(body, secret);
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
      return null;
    }

    const parsed = JSON.parse(
      Buffer.from(body, "base64url").toString("utf8"),
    ) as Partial<SessionPayload>;
    if (
      parsed.version !== 1 ||
      typeof parsed.expiresAt !== "number" ||
      parsed.expiresAt <= now ||
      typeof parsed.classId !== "string" ||
      typeof parsed.studentId !== "string" ||
      typeof parsed.className !== "string" ||
      typeof parsed.displayName !== "string"
    ) {
      return null;
    }
    return {
      classId: parsed.classId,
      studentId: parsed.studentId,
      className: parsed.className,
      displayName: parsed.displayName,
    };
  } catch {
    return null;
  }
}
