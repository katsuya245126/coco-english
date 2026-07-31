import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockRequireTeacherProfile,
  mockTeacherOwnsAudioClip,
  mockConsume,
  mockReprocessClipPronunciation,
  mockRevalidatePath,
} = vi.hoisted(() => ({
  mockRequireTeacherProfile: vi.fn(),
  mockTeacherOwnsAudioClip: vi.fn(),
  mockConsume: vi.fn(),
  mockReprocessClipPronunciation: vi.fn(),
  mockRevalidatePath: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: mockRevalidatePath }));

vi.mock("@/server/teacher/auth", () => ({
  requireTeacherProfile: mockRequireTeacherProfile,
}));

vi.mock("@/server/teacher/audio-evidence", () => ({
  teacherOwnsAudioClip: mockTeacherOwnsAudioClip,
  createSignedAudioUrlForTeacher: vi.fn(),
}));

vi.mock("@/server/security/request-budget", () => ({
  consumeRequestBudget: mockConsume,
}));

vi.mock("@/server/audio/pronunciation-reprocess", () => ({
  reprocessClipPronunciation: mockReprocessClipPronunciation,
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServiceClient: vi.fn(),
}));

vi.mock("@/server/teacher/assignment-operations", () => ({
  dismissAssignmentStudent: vi.fn(),
  markSubmissionReviewed: vi.fn(),
  requestSubmissionRetry: vi.fn(),
  undoDismiss: vi.fn(),
}));

async function reprocess(input = { audioClipId: "clip-1", attemptId: "attempt-1" }) {
  const { reprocessPronunciationAction } = await import(
    "@/app/teacher/evidence/[attemptId]/actions"
  );
  return reprocessPronunciationAction(input);
}

describe("reprocessPronunciationAction budget", () => {
  beforeEach(() => {
    vi.resetModules();
    mockRequireTeacherProfile.mockReset();
    mockTeacherOwnsAudioClip.mockReset();
    mockConsume.mockReset();
    mockReprocessClipPronunciation.mockReset();
    mockRevalidatePath.mockReset();

    mockRequireTeacherProfile.mockResolvedValue({ id: "teacher-1" });
    mockTeacherOwnsAudioClip.mockResolvedValue(true);
    mockConsume.mockResolvedValue({ allowed: true });
    mockReprocessClipPronunciation.mockResolvedValue({ ok: true });
  });

  it("checks clip ownership, then denies before pronunciation provider work", async () => {
    mockConsume.mockResolvedValue({ allowed: false, retryAfterSeconds: 300 });

    const result = await reprocess();

    expect(mockTeacherOwnsAudioClip).toHaveBeenCalled();
    expect(mockConsume).toHaveBeenCalledWith({
      actorId: "teacher-1",
      operation: "teacher_provider",
    });
    expect(mockReprocessClipPronunciation).not.toHaveBeenCalled();
    expect(result).toEqual({ ok: false, error: "rate_limited" });
  });

  it("does not consume a budget for a clip the teacher does not own", async () => {
    mockTeacherOwnsAudioClip.mockResolvedValue(false);

    const result = await reprocess();

    expect(mockConsume).not.toHaveBeenCalled();
    expect(mockReprocessClipPronunciation).not.toHaveBeenCalled();
    expect(result).toEqual({ ok: false, error: "unauthorized" });
  });

  it("admits an owned clip and reprocesses exactly once", async () => {
    const result = await reprocess();

    expect(mockConsume).toHaveBeenCalledTimes(1);
    expect(mockReprocessClipPronunciation).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ ok: true });
  });
});
