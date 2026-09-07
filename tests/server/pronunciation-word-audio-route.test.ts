import { beforeEach, describe, expect, it, vi } from "vitest";

const { signCurrent, signSnapshot } = vi.hoisted(() => ({
  signCurrent: vi.fn(async () => ({
    ok: true as const,
    contentHash: "current-hash",
    audioUrl: "https://signed.test/current.mp3",
    mimeType: "audio/mpeg",
  })),
  signSnapshot: vi.fn(async () => ({
    ok: true as const,
    contentHash: "legacy-hash",
    audioUrl: "https://signed.test/legacy.mp3",
    mimeType: "audio/mpeg",
  })),
}));

vi.mock("@/app/join/actions", () => ({
  readStudentUnlock: vi.fn(async () => ({ studentId: "student-1" })),
}));

const query = {
  select: vi.fn(() => query),
  eq: vi.fn(() => query),
  maybeSingle: vi.fn(async () => ({
    data: {
      id: "assignment-student-1",
      student_id: "student-1",
      assignments: {
        assignment_kind: "pronunciation",
        canceled_at: null,
        mission_snapshot: {
          kind: "pronunciation",
          version: 1,
          soundId: "s",
          difficulty: "easy",
          requiredWords: 5,
          soundClipVersion: "v1",
          words: [1, 2, 3, 4, 5].map((order) => ({
            order,
            text: "fish",
            highlightStart: 0,
            highlightLength: 1,
            source: "verified",
            pronunciation: {
              phones: ["F", "IH1", "SH"],
              targetPhoneIndex: 0,
              cmuVariant: 1,
            },
            wordAudio: {
              schemaVersion: 1,
              contentHash: "legacy-hash",
              voice: "en-US-AvaNeural",
              format: "audio-24khz-48kbitrate-mono-mp3",
            },
          })),
        },
      },
    },
    error: null,
  })),
};

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServiceClient: () => ({ from: vi.fn(() => query) }),
}));

vi.mock("@/server/audio/pronunciation-word-audio", () => ({
  signPronunciationWordAudio: signCurrent,
  signPronunciationWordAudioFromSnapshot: signSnapshot,
}));

describe("pronunciation word audio route", () => {
  beforeEach(() => {
    signCurrent.mockClear();
    signSnapshot.mockClear();
  });

  it("passes owned snapshot audio identity to the signer", async () => {
    const { POST } = await import(
      "@/app/student/pronunciation/[assignmentStudentId]/word-audio/route"
    );
    const response = await POST(
      new Request("http://localhost/student/pronunciation/assignment-student-1/word-audio", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ wordOrder: 1 }),
      }),
      { params: Promise.resolve({ assignmentStudentId: "assignment-student-1" }) },
    );

    expect(response.status).toBe(200);
    expect(signSnapshot).toHaveBeenCalledWith({
      schemaVersion: 1,
      contentHash: "legacy-hash",
      voice: "en-US-AvaNeural",
      format: "audio-24khz-48kbitrate-mono-mp3",
    });
    expect(signCurrent).not.toHaveBeenCalled();
  });
});
