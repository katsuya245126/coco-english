import { createHmac, timingSafeEqual } from "node:crypto";

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
  return Buffer.byteLength(secret) >= 32;
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
