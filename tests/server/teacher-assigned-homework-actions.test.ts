import { beforeEach, describe, expect, it, vi } from "vitest";

const { changeAssignedHomework, requireTeacherProfile } = vi.hoisted(() => ({
  changeAssignedHomework: vi.fn(),
  requireTeacherProfile: vi.fn(),
}));

vi.mock("@/server/auth/teacher-profile", () => ({ requireTeacherProfile }));
vi.mock("@/server/teacher/assignment-operations", () => ({ changeAssignedHomework }));

async function change(input: unknown) {
  const { changeAssignedHomeworkAction } = await import("@/app/teacher/assignment-actions");
  return changeAssignedHomeworkAction(input as never);
}

describe("changeAssignedHomeworkAction", () => {
  beforeEach(() => {
    vi.resetModules();
    changeAssignedHomework.mockReset();
    requireTeacherProfile.mockReset();
    requireTeacherProfile.mockResolvedValue({ id: "00000000-0000-4000-8000-000000000001" });
  });

  it("passes authenticated teacher intent to the deep module", async () => {
    changeAssignedHomework.mockResolvedValue({ ok: true });

    await expect(change({
      assignedHomeworkId: "00000000-0000-4000-8000-000000000002",
      action: "dismiss",
      reason: "Absent",
    })).resolves.toEqual({ ok: true });

    expect(changeAssignedHomework).toHaveBeenCalledWith({
      teacherId: "00000000-0000-4000-8000-000000000001",
      assignedHomeworkId: "00000000-0000-4000-8000-000000000002",
      action: "dismiss",
      reason: "Absent",
    });
  });

  it.each([
    { assignedHomeworkId: "bad", action: "dismiss" },
    { assignedHomeworkId: "00000000-0000-4000-8000-000000000002", action: "bad" },
  ])("rejects malformed client input before authentication or mutation", async (input) => {
    await expect(change(input)).resolves.toEqual({ ok: false, error: "not_allowed" });
    expect(requireTeacherProfile).not.toHaveBeenCalled();
    expect(changeAssignedHomework).not.toHaveBeenCalled();
  });
});
