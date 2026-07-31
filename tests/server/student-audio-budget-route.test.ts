import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockReadStudentUnlock, mockUpload } = vi.hoisted(() => ({
  mockReadStudentUnlock: vi.fn(),
  mockUpload: vi.fn(),
}));

vi.mock("@/app/join/actions", () => ({
  readStudentUnlock: mockReadStudentUnlock,
}));

vi.mock("@/server/student-access/audio-upload", async (importOriginal) => {
  const actual = await importOriginal<
    typeof import("@/server/student-access/audio-upload")
  >();
  return { ...actual, uploadAttemptAudioClip: mockUpload };
});

const ASSIGNMENT_STUDENT_ID = "22222222-2222-4222-8222-222222222222";

function validAudioFormData() {
  const formData = new FormData();
  formData.set("file", new Blob(["voice"], { type: "audio/webm" }));
  formData.set("attemptId", "11111111-1111-4111-8111-111111111111");
  formData.set("turnOrder", "1");
  formData.set("clipKind", "original_answer");
  formData.set("durationMs", "1200");
  formData.set("mimeType", "audio/webm");
  return formData;
}

async function postAudio() {
  const { POST } = await import(
    "@/app/student/missions/[assignmentStudentId]/audio/route"
  );
  return POST(
    new Request("http://localhost/audio", {
      method: "POST",
      body: validAudioFormData(),
    }),
    { params: Promise.resolve({ assignmentStudentId: ASSIGNMENT_STUDENT_ID }) },
  );
}

describe("student audio route budget mapping", () => {
  beforeEach(() => {
    vi.resetModules();
    mockReadStudentUnlock.mockReset();
    mockUpload.mockReset();
    mockReadStudentUnlock.mockResolvedValue({ studentId: "student-1" });
  });

  it("maps audio budget denial to 429 without exposing budget details", async () => {
    mockUpload.mockResolvedValue({
      ok: false,
      error: "rate_limited",
      retryable: true,
      retryAfterSeconds: 287,
    });

    const response = await postAudio();

    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("287");
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: "rate_limited",
    });
  });

  it("falls back to the full window when no retry delay is present", async () => {
    mockUpload.mockResolvedValue({
      ok: false,
      error: "rate_limited",
      retryable: true,
    });

    const response = await postAudio();

    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("600");
  });
});
