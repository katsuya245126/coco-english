import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockRequireTeacherProfile,
  mockClarifyMissionAudio,
  mockReprocessClipPronunciation,
  mockRevalidatePath,
} = vi.hoisted(() => ({
  mockRequireTeacherProfile: vi.fn(),
  mockClarifyMissionAudio: vi.fn(),
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
  clarifyMissionAudio: mockClarifyMissionAudio,
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

async function clarify(input = {
  audioClipId: "clip-1",
  attemptId: "attempt-1",
  teacherConfirmedText: "  I wake up at eight.  ",
}) {
  const { clarifyMissionAudioAction } = await import(
    "@/app/teacher/evidence/[attemptId]/actions"
  );
  return clarifyMissionAudioAction(input);
}

describe("reprocessPronunciationAction", () => {
  beforeEach(() => {
    vi.resetModules();
    mockRequireTeacherProfile.mockReset();
    mockClarifyMissionAudio.mockReset();
    mockReprocessClipPronunciation.mockReset();
    mockRevalidatePath.mockReset();

    mockRequireTeacherProfile.mockResolvedValue({ id: "teacher-1" });
    mockClarifyMissionAudio.mockResolvedValue({ ok: true, scored: true });
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

describe("clarifyMissionAudioAction", () => {
  beforeEach(() => {
    vi.resetModules();
    mockRequireTeacherProfile.mockReset();
    mockClarifyMissionAudio.mockReset();
    mockReprocessClipPronunciation.mockReset();
    mockRevalidatePath.mockReset();

    mockRequireTeacherProfile.mockResolvedValue({ id: "teacher-1" });
    mockClarifyMissionAudio.mockResolvedValue({ ok: true, scored: true });
    mockReprocessClipPronunciation.mockResolvedValue({ ok: true, scored: true });
  });

  it("passes the authenticated teacher and trimmed wording to the service", async () => {
    await expect(clarify()).resolves.toEqual({ ok: true });

    expect(mockRequireTeacherProfile).toHaveBeenCalledTimes(1);
    expect(mockClarifyMissionAudio).toHaveBeenCalledWith({
      teacherId: "teacher-1",
      audioClipId: "clip-1",
      teacherConfirmedText: "I wake up at eight.",
    });
    expect(mockRevalidatePath).toHaveBeenCalledWith("/teacher/evidence/attempt-1");
  });

  it.each([
    ["unauthorized", "unavailable"],
    ["unavailable", "unavailable"],
    ["invalid_text", "invalid_input"],
    ["rate_limited", "rate_limited"],
    ["failed", "retryable"],
  ] as const)("maps %s without revalidating", async (serviceError, actionError) => {
    mockClarifyMissionAudio.mockResolvedValue({
      ok: false,
      error: serviceError,
    });

    await expect(clarify()).resolves.toMatchObject({
      ok: false,
      error: actionError,
      message: expect.any(String),
    });
    expect(mockRevalidatePath).not.toHaveBeenCalled();
  });

  it("rejects blank wording before authenticating", async () => {
    await expect(
      clarify({
        audioClipId: "clip-1",
        attemptId: "attempt-1",
        teacherConfirmedText: "  ",
      }),
    ).resolves.toMatchObject({ ok: false, error: "invalid_input" });

    expect(mockRequireTeacherProfile).not.toHaveBeenCalled();
    expect(mockClarifyMissionAudio).not.toHaveBeenCalled();
    expect(mockRevalidatePath).not.toHaveBeenCalled();
  });

  it("maps authentication and unexpected service failures to safe retry responses", async () => {
    mockRequireTeacherProfile.mockRejectedValueOnce(new Error("unauthenticated"));
    await expect(clarify()).rejects.toThrow("unauthenticated");

    mockRequireTeacherProfile.mockResolvedValue({ id: "teacher-1" });
    mockClarifyMissionAudio.mockRejectedValueOnce(new Error("provider"));
    await expect(clarify()).resolves.toMatchObject({
      ok: false,
      error: "retryable",
      message: expect.any(String),
    });
    expect(mockRevalidatePath).not.toHaveBeenCalled();
  });
});
