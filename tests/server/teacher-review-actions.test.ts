import { afterEach, describe, expect, it, vi } from "vitest";
import { revalidatePath } from "next/cache";
import { updateClassReviewPolicyAction } from "@/app/teacher/assignment-actions";
import * as assignmentOperations from "@/server/teacher/assignment-operations";
import { updateClassReviewPolicy } from "@/server/teacher/assignment-operations";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/server/auth/teacher-profile", () => ({ requireTeacherProfile: vi.fn().mockResolvedValue({ id: "teacher-1" }) }));

afterEach(() => vi.clearAllMocks());

function reviewPolicyClient(result: { data: { id: string } | null; error: { message: string } | null }) {
  const operations: Array<[string, ...unknown[]]> = [];
  const chain: Record<string, unknown> = {
    update: (payload: unknown) => { operations.push(["update", "classes", payload]); return chain; },
    eq: (key: string, value: unknown) => { operations.push(["eq", "classes", key, value]); return chain; },
    select: () => chain,
    maybeSingle: () => Promise.resolve(result),
  };
  return {
    client: { from: () => chain } as unknown as NonNullable<Parameters<typeof updateClassReviewPolicy>[1]>,
    operations,
  };
}

describe("class review policy mutation", () => {
  it("updates only a class owned by the authenticated teacher", async () => {
    const { client, operations } = reviewPolicyClient({ data: { id: "class-1" }, error: null });
    expect(await updateClassReviewPolicy({ teacherId: "teacher-1", classId: "class-1", reviewPolicy: "flagged_only" }, client)).toEqual({ ok: true });
    expect(operations).toContainEqual(["update", "classes", { review_policy: "flagged_only" }]);
    expect(operations).toContainEqual(["eq", "classes", "id", "class-1"]);
    expect(operations).toContainEqual(["eq", "classes", "teacher_id", "teacher-1"]);
  });

  it("returns not_found when no owned class matches", async () => {
    const { client } = reviewPolicyClient({ data: null, error: null });
    expect(await updateClassReviewPolicy({ teacherId: "teacher-2", classId: "class-1", reviewPolicy: "every_submission" }, client)).toEqual({ ok: false, error: "not_found" });
  });

  it("returns db_error when the update fails", async () => {
    const { client } = reviewPolicyClient({ data: null, error: { message: "boom" } });
    expect(await updateClassReviewPolicy({ teacherId: "teacher-1", classId: "class-1", reviewPolicy: "every_submission" }, client)).toEqual({ ok: false, error: "db_error" });
  });

  it("rejects malformed action input before any service write", async () => {
    const update = vi.spyOn(assignmentOperations, "updateClassReviewPolicy");
    expect(await updateClassReviewPolicyAction({ classId: "class-1", reviewPolicy: "all" as never })).toEqual({ ok: false, error: "invalid_policy" });
    expect(update).not.toHaveBeenCalled();
  });

  it("revalidates global and class queues after a successful action", async () => {
    vi.spyOn(assignmentOperations, "updateClassReviewPolicy").mockResolvedValue({ ok: true });
    expect(await updateClassReviewPolicyAction({ classId: "class-1", reviewPolicy: "flagged_only" })).toEqual({ ok: true });
    expect(revalidatePath).toHaveBeenCalledWith("/teacher");
    expect(revalidatePath).toHaveBeenCalledWith("/teacher/classes/class-1");
  });
});
