import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  openStudentSession,
  sealStudentSession,
  STUDENT_SESSION_TTL_MS,
} from "@/server/student-access/student-session";

const SECRET = "a".repeat(32);
const payload = {
  classId: "class-1",
  studentId: "student-1",
  className: "English A",
  displayName: "Jamie",
};

describe("student session token", () => {
  it("round-trips an authenticated payload", () => {
    const token = sealStudentSession(payload, SECRET, 1_000);
    expect(openStudentSession(token, SECRET, 1_001)).toEqual(payload);
  });

  it("rejects tampering and a different secret", () => {
    const token = sealStudentSession(payload, SECRET, 1_000);
    const [body, signature] = token.split(".");
    expect(openStudentSession(`${body}x.${signature}`, SECRET, 1_001)).toBeNull();
    expect(openStudentSession(token, "b".repeat(32), 1_001)).toBeNull();
  });

  it("rejects malformed and expired tokens", () => {
    const token = sealStudentSession(payload, SECRET, 1_000);
    expect(openStudentSession("not-a-token", SECRET, 1_001)).toBeNull();
    expect(
      openStudentSession(token, SECRET, 1_000 + STUDENT_SESSION_TTL_MS),
    ).toBeNull();
  });

  it("refuses a short or missing secret", () => {
    expect(() => sealStudentSession(payload, "short", 1_000)).toThrow();
    expect(openStudentSession("anything", "", 1_000)).toBeNull();
  });

  it("refuses the public placeholder from .env.example", () => {
    const example = readFileSync(".env.example", "utf8");
    const placeholder = example.match(/^STUDENT_ACCESS_SECRET=(.+)$/m)?.[1];
    expect(placeholder).toBeDefined();
    expect(() => sealStudentSession(payload, placeholder!, 1_000)).toThrow();
    expect(() =>
      sealStudentSession(
        payload,
        "replace-with-an-independent-long-random-secret",
        1_000,
      ),
    ).toThrow();
  });
});
