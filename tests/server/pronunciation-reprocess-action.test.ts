import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockRequireTeacherProfile,
  mockReprocessClipPronunciation,
  mockRevalidatePath,
} = vi.hoisted(() => ({
  mockRequireTeacherProfile: vi.fn(),
  mockReprocessClipPronunciation: vi.fn(),
  mockRevalidatePath: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: mockRevalidatePath }));

vi.mock("@/server/auth/teacher-profile", () => ({
  requireTeacherProfile: mockRequireTeacherProfile,
}));

vi.mock("@/server/teacher/audio-evidence", () => ({
  createSignedAudioUrlForTeacher: vi.fn(),
}));

vi.mock("@/server/audio/pronunciation-reprocess", () => ({
  reprocessClipPronunciation: mockReprocessClipPronunciation,
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServiceClient: vi.fn(),
}));

vi.mock("@/server/teacher/assignment-operations", () => ({
  changeAttemptReview: vi.fn(),
}));

async function reprocess(input = { audioClipId: "clip-1", attemptId: "attempt-1" }) {
  const { reprocessPronunciationAction } = await import(
    "@/app/teacher/evidence/[attemptId]/actions"
  );
  return reprocessPronunciationAction(input);
}

describe("reprocessPronunciationAction", () => {
  beforeEach(() => {
    vi.resetModules();
    mockRequireTeacherProfile.mockReset();
    mockReprocessClipPronunciation.mockReset();
    mockRevalidatePath.mockReset();

    mockRequireTeacherProfile.mockResolvedValue({ id: "teacher-1" });
    mockReprocessClipPronunciation.mockResolvedValue({ ok: true, scored: true });
  });

  it("passes the authenticated teacher and clip to the reprocessor once", async () => {
    await expect(reprocess()).resolves.toEqual({ ok: true });

    expect(mockRequireTeacherProfile).toHaveBeenCalledTimes(1);
    expect(mockReprocessClipPronunciation).toHaveBeenCalledTimes(1);
    expect(mockReprocessClipPronunciation).toHaveBeenCalledWith({
      teacherId: "teacher-1",
      audioClipId: "clip-1",
    });
    expect(mockRevalidatePath).toHaveBeenCalledWith("/teacher/evidence/attempt-1");
  });

  it.each(["unauthorized", "already_scored", "unavailable", "failed", "rate_limited"] as const)(
    "returns %s without revalidating",
    async (error) => {
      mockReprocessClipPronunciation.mockResolvedValue({ ok: false, error });

      await expect(reprocess()).resolves.toEqual({ ok: false, error });

      expect(mockRevalidatePath).not.toHaveBeenCalled();
    },
  );

  it("returns unavailable before authenticating an empty clip", async () => {
    await expect(reprocess({ audioClipId: "", attemptId: "attempt-1" })).resolves.toEqual({
      ok: false,
      error: "unavailable",
    });

    expect(mockRequireTeacherProfile).not.toHaveBeenCalled();
    expect(mockReprocessClipPronunciation).not.toHaveBeenCalled();
  });
});
