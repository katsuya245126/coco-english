import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  cookieJar: new Map<string, string>(),
  unlockStudent: vi.fn(),
}));

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => {
      const value = mocks.cookieJar.get(name);
      return value ? { name, value } : undefined;
    },
    set: (name: string, value: string) => mocks.cookieJar.set(name, value),
    delete: (name: string) => mocks.cookieJar.delete(name),
  }),
  headers: async () => ({ get: () => "203.0.113.10" }),
}));

vi.mock("@/server/student-access/unlock", async (importOriginal) => {
  const actual = await importOriginal<
    typeof import("@/server/student-access/unlock")
  >();
  return { ...actual, unlockStudent: mocks.unlockStudent };
});

import {
  readStudentUnlock,
  unlockStudentAction,
} from "@/app/join/actions";

const SECRET = "0123456789abcdef0123456789abcdef";
const alice = {
  ok: true as const,
  classId: "class-a",
  studentId: "student-a",
  className: "Class A",
  displayName: "Alice",
};

async function unlockAlice() {
  mocks.unlockStudent.mockResolvedValueOnce(alice);
  await expect(
    unlockStudentAction({
      joinCode: "ALPHA1",
      typedName: "Alice",
      pin: "1234",
    }),
  ).resolves.toEqual(alice);
  await expect(readStudentUnlock()).resolves.toEqual({
    classId: alice.classId,
    studentId: alice.studentId,
    className: alice.className,
    displayName: alice.displayName,
  });
}

describe("student unlock session replacement", () => {
  beforeEach(() => {
    mocks.cookieJar.clear();
    mocks.unlockStudent.mockReset();
    process.env.STUDENT_ACCESS_SECRET = SECRET;
  });

  it("clears the previous session after a credential mismatch", async () => {
    await unlockAlice();
    mocks.unlockStudent.mockResolvedValueOnce({
      ok: false,
      error: "generic_mismatch",
    });

    await expect(
      unlockStudentAction({
        joinCode: "BRAVO2",
        typedName: "Bob",
        pin: "9999",
      }),
    ).resolves.toEqual({ ok: false, error: "generic_mismatch" });

    await expect(readStudentUnlock()).resolves.toBeNull();
  });

  it("clears the previous session after malformed input", async () => {
    await unlockAlice();

    await expect(
      unlockStudentAction({
        joinCode: "BRAVO2",
        typedName: "Bob",
        pin: "",
      }),
    ).resolves.toEqual({ ok: false, error: "generic_mismatch" });

    await expect(readStudentUnlock()).resolves.toBeNull();
  });

  it("clears the previous session when the new session cannot be sealed", async () => {
    await unlockAlice();
    mocks.unlockStudent.mockResolvedValueOnce({
      ...alice,
      classId: "class-b",
      studentId: "student-b",
      className: "Class B",
      displayName: "Bob",
    });
    process.env.STUDENT_ACCESS_SECRET = "short";

    await expect(
      unlockStudentAction({
        joinCode: "BRAVO2",
        typedName: "Bob",
        pin: "9999",
      }),
    ).resolves.toEqual({ ok: false, error: "generic_mismatch" });

    process.env.STUDENT_ACCESS_SECRET = SECRET;
    await expect(readStudentUnlock()).resolves.toBeNull();
  });
});
