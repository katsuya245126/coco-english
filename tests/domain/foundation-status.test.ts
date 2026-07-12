import { describe, expect, it } from "vitest";
import {
  ASSIGNMENT_STUDENT_STATUSES,
  assertTransitionRequest,
  canTransitionAssignmentStatus,
  shouldMarkMissed,
} from "@/domain/foundation/status";

describe("foundation assignment status rules", () => {
  it("defines exactly the ASGN-04 assignment student statuses", () => {
    expect(ASSIGNMENT_STUDENT_STATUSES).toEqual([
      "assigned",
      "started",
      "completed",
      "missed",
      "needs_retry",
      "teacher_review",
    ]);
  });

  it.each([
    ["assigned", "started"],
    ["assigned", "missed"],
    ["started", "completed"],
    ["started", "missed"],
    ["started", "needs_retry"],
    ["started", "teacher_review"],
    ["missed", "started"],
    ["needs_retry", "started"],
    ["needs_retry", "teacher_review"],
    ["teacher_review", "completed"],
    ["teacher_review", "needs_retry"],
    ["teacher_review", "started"],
    ["completed", "teacher_review"],
  ] as const)("allows legal transition %s -> %s", (previousStatus, nextStatus) => {
    expect(canTransitionAssignmentStatus(previousStatus, nextStatus)).toBe(true);
  });

  it.each([
    ["assigned", "completed"],
    ["assigned", "needs_retry"],
    ["missed", "completed"],
    ["missed", "teacher_review"],
    ["missed", "needs_retry"],
    ["completed", "started"],
    ["needs_retry", "missed"],
  ] as const)("rejects illegal transition %s -> %s", (previousStatus, nextStatus) => {
    expect(canTransitionAssignmentStatus(previousStatus, nextStatus)).toBe(false);
    expect(() =>
      assertTransitionRequest({
        previousStatus,
        nextStatus,
        actorType: "system",
        reasonCode: "test",
        occurredAt: new Date().toISOString(),
      }),
    ).toThrow(/Illegal assignment status transition/);
  });

  it("marks only overdue assigned or started homework as missed", () => {
    const now = new Date("2026-06-25T12:00:00.000Z");
    const past = "2026-06-25T11:59:00.000Z";
    const future = "2026-06-25T12:01:00.000Z";

    expect(shouldMarkMissed({ status: "assigned", dueAt: past, now })).toBe(true);
    expect(shouldMarkMissed({ status: "started", dueAt: past, now })).toBe(true);
    expect(shouldMarkMissed({ status: "completed", dueAt: past, now })).toBe(false);
    expect(shouldMarkMissed({ status: "needs_retry", dueAt: past, now })).toBe(false);
    expect(shouldMarkMissed({ status: "assigned", dueAt: future, now })).toBe(false);
    expect(shouldMarkMissed({ status: "assigned", dueAt: null, now })).toBe(false);
  });

  it("requires teacher override audit data", () => {
    const base = {
      previousStatus: "teacher_review",
      nextStatus: "completed",
      actorType: "teacher",
      reasonCode: "manual_review_passed",
      occurredAt: "2026-06-25T12:00:00.000Z",
    } as const;

    expect(() =>
      assertTransitionRequest({ ...base, actorId: "teacher-1" }),
    ).not.toThrow();
    expect(() => assertTransitionRequest(base)).toThrow(/actorId/);
    expect(() =>
      assertTransitionRequest({ ...base, actorId: "teacher-1", reasonCode: "" }),
    ).toThrow(/reasonCode/);
    expect(() =>
      assertTransitionRequest({
        ...base,
        actorId: "teacher-1",
        occurredAt: "",
      }),
    ).toThrow(/occurredAt/);
  });
});
