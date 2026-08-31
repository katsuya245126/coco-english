import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PronunciationSample } from "@/server/teacher/pronunciation-samples";

const mocks = vi.hoisted(() => ({
  requireTeacherProfile: vi.fn(),
  confirmPronunciationSample: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/server/auth/teacher-profile", () => ({
  requireTeacherProfile: mocks.requireTeacherProfile,
}));
vi.mock("@/server/teacher/pronunciation-samples", async () => {
  const actual = await vi.importActual<typeof import("@/server/teacher/pronunciation-samples")>(
    "@/server/teacher/pronunciation-samples",
  );
  return { ...actual, confirmPronunciationSample: mocks.confirmPronunciationSample };
});

import { confirmPronunciationSampleAction } from "@/app/teacher/students/[id]/actions";

const sample = {
  studentId: "student-1",
} as PronunciationSample;

describe("confirmPronunciationSampleAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireTeacherProfile.mockResolvedValue({ id: "teacher-1" });
  });

  it("confirms for the authenticated teacher and revalidates the owning student page", async () => {
    mocks.confirmPronunciationSample.mockResolvedValue({ ok: true, sample });

    await expect(
      confirmPronunciationSampleAction("sample-1", "fan"),
    ).resolves.toEqual({ ok: true, sample });

    expect(mocks.confirmPronunciationSample).toHaveBeenCalledWith({
      teacherId: "teacher-1",
      sampleId: "sample-1",
      teacherConfirmedText: "fan",
    });
    expect(mocks.revalidatePath).toHaveBeenCalledWith(
      "/teacher/students/student-1",
    );
  });

  it("sanitizes foreign sample responses", async () => {
    mocks.confirmPronunciationSample.mockResolvedValue({
      ok: false,
      error: "not_found",
    });

    await expect(
      confirmPronunciationSampleAction("sample-1", "fan"),
    ).resolves.toEqual({
      ok: false,
      error: "unavailable",
      message:
        "We could not confirm this pronunciation sample. Please try again.",
    });
  });
});
