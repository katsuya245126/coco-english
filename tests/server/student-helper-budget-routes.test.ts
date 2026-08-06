import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockReadStudentUnlock,
  mockConsume,
  mockGetOrCreateTtsAudio,
  mockGetOrCreateTranslationHint,
  mockResolveOwnedTranslationSource,
  mockSupabaseFrom,
} = vi.hoisted(() => ({
  mockReadStudentUnlock: vi.fn(),
  mockConsume: vi.fn(),
  mockGetOrCreateTtsAudio: vi.fn(),
  mockGetOrCreateTranslationHint: vi.fn(),
  mockResolveOwnedTranslationSource: vi.fn(),
  mockSupabaseFrom: vi.fn(),
}));

vi.mock("@/app/join/actions", () => ({
  readStudentUnlock: mockReadStudentUnlock,
}));

vi.mock("@/server/security/request-budget", () => ({
  consumeRequestBudget: mockConsume,
}));

vi.mock("@/server/audio/tts-cache", () => ({
  getOrCreateTtsAudio: mockGetOrCreateTtsAudio,
}));

vi.mock("@/server/ai/translation-hint-cache", () => ({
  DEFAULT_TRANSLATION_LOCALE: "ko",
  getOrCreateTranslationHint: mockGetOrCreateTranslationHint,
}));

vi.mock("@/server/student-access/translation-source", () => ({
  resolveOwnedTranslationSource: mockResolveOwnedTranslationSource,
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServiceClient: () => ({ from: mockSupabaseFrom }),
}));

const ASSIGNMENT_STUDENT_ID = "22222222-2222-4222-8222-222222222222";

const missionSnapshot = {
  missionId: "33333333-3333-4333-8333-333333333333",
  title: "Ordering food",
  level: "elementary",
  targetPattern: "I would like _____",
  requiredTurns: 1,
  characterId: "default-buddy",
  requireCompleteSentenceAnswers: true,
  turns: [
    {
      turnOrder: 1,
      prompt: "What would you like to eat?",
      targetExample: "I would like pizza.",
      answerShape: "open",
      hintLadder: {
        tier1: "I would like _____",
        tier2: "pizza",
        tier3: "I would like pizza.",
      },
    },
  ],
};

/**
 * The TTS route reads owned assignment state through the service client before
 * resolving the line text, so the ownership read is stubbed rather than mocked
 * away — the budget must be consumed only after it succeeds.
 */
function stubOwnedAssignment() {
  mockSupabaseFrom.mockImplementation((table: string) => {
    if (table === "assignment_students") {
      return {
        select: () => ({
          eq: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: {
                  id: ASSIGNMENT_STUDENT_ID,
                  student_id: "student-1",
                  latest_attempt_id: null,
                  assignments: {
                    mission_snapshot: missionSnapshot,
                    canceled_at: null,
                  },
                },
                error: null,
              }),
            }),
          }),
        }),
      };
    }
    return {
      select: () => ({
        eq: () => ({
          eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }),
        }),
      }),
    };
  });
}

function stubForeignAssignment() {
  mockSupabaseFrom.mockImplementation(() => ({
    select: () => ({
      eq: () => ({
        eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }),
      }),
    }),
  }));
}

function ttsRequest(body: unknown = { lineKind: "mission_prompt", turnOrder: 1 }) {
  return new Request("http://localhost/tts", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

function translationRequest(
  body: unknown = { lineKind: "mission_prompt", turnOrder: 1 },
) {
  return new Request("http://localhost/translation-hint", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

async function postTts(request: Request) {
  const { POST } = await import(
    "@/app/student/missions/[assignmentStudentId]/tts/route"
  );
  return POST(request, {
    params: Promise.resolve({ assignmentStudentId: ASSIGNMENT_STUDENT_ID }),
  });
}

async function postTranslation(request: Request) {
  const { POST } = await import(
    "@/app/student/missions/[assignmentStudentId]/translation-hint/route"
  );
  return POST(request, {
    params: Promise.resolve({ assignmentStudentId: ASSIGNMENT_STUDENT_ID }),
  });
}

describe("student helper budget routes", () => {
  beforeEach(() => {
    vi.resetModules();
    mockReadStudentUnlock.mockReset();
    mockConsume.mockReset();
    mockGetOrCreateTtsAudio.mockReset();
    mockGetOrCreateTranslationHint.mockReset();
    mockResolveOwnedTranslationSource.mockReset();
    mockSupabaseFrom.mockReset();

    mockReadStudentUnlock.mockResolvedValue({ studentId: "student-1" });
    mockConsume.mockResolvedValue({ allowed: true });
    mockGetOrCreateTtsAudio.mockResolvedValue({
      ok: true,
      cacheStatus: "hit",
      audioUrl: "https://example.test/audio.mp3",
      mimeType: "audio/mpeg",
    });
    mockGetOrCreateTranslationHint.mockResolvedValue({
      ok: true,
      hint: { phrases: [{ source: "hello", target: "안녕" }] },
    });
    mockResolveOwnedTranslationSource.mockResolvedValue({
      ok: true,
      source: { sourceText: "What would you like to eat?", studentLevel: "elementary" },
    });
  });

  it("TTS resolves an owned line, then denies before cache lookup", async () => {
    stubOwnedAssignment();
    mockConsume.mockResolvedValue({ allowed: false, retryAfterSeconds: 412 });

    const response = await postTts(ttsRequest());

    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("412");
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: "rate_limited",
    });
    expect(mockConsume).toHaveBeenCalledWith({
      actorId: "student-1",
      operation: "student_helper",
    });
    expect(mockGetOrCreateTtsAudio).not.toHaveBeenCalled();
  });

  it("translation resolves its owned source, then denies before cache lookup", async () => {
    mockConsume.mockResolvedValue({ allowed: false, retryAfterSeconds: 233 });

    const response = await postTranslation(translationRequest());

    expect(mockResolveOwnedTranslationSource).toHaveBeenCalled();
    expect(mockConsume).toHaveBeenCalledWith({
      actorId: "student-1",
      operation: "student_helper",
    });
    expect(mockGetOrCreateTranslationHint).not.toHaveBeenCalled();
    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("233");
  });

  it("does not consume a budget for invalid TTS input", async () => {
    stubOwnedAssignment();
    const response = await postTts(ttsRequest({ lineKind: "not_a_line_kind" }));

    expect(response.status).toBe(400);
    expect(mockConsume).not.toHaveBeenCalled();
    expect(mockGetOrCreateTtsAudio).not.toHaveBeenCalled();
  });

  it("does not consume a budget for a foreign TTS assignment", async () => {
    stubForeignAssignment();
    const response = await postTts(ttsRequest());

    expect(response.status).toBe(404);
    expect(mockConsume).not.toHaveBeenCalled();
    expect(mockGetOrCreateTtsAudio).not.toHaveBeenCalled();
  });

  it("does not consume a budget for invalid translation input", async () => {
    const response = await postTranslation(translationRequest({ nope: true }));

    expect(response.status).toBe(400);
    expect(mockConsume).not.toHaveBeenCalled();
    expect(mockGetOrCreateTranslationHint).not.toHaveBeenCalled();
  });

  it("does not consume a budget for a foreign translation source", async () => {
    mockResolveOwnedTranslationSource.mockResolvedValue({
      ok: false,
      error: "not_found",
    });

    const response = await postTranslation(translationRequest());

    expect(response.status).toBe(404);
    expect(mockConsume).not.toHaveBeenCalled();
    expect(mockGetOrCreateTranslationHint).not.toHaveBeenCalled();
  });

  it("admits TTS and performs exactly one cache lookup", async () => {
    stubOwnedAssignment();
    const response = await postTts(ttsRequest());

    expect(response.status).toBe(200);
    expect(mockConsume).toHaveBeenCalledTimes(1);
    expect(mockGetOrCreateTtsAudio).toHaveBeenCalledTimes(1);
  });

  it("admits translation and performs exactly one cache lookup", async () => {
    const response = await postTranslation(translationRequest());

    expect(response.status).toBe(200);
    expect(mockConsume).toHaveBeenCalledTimes(1);
    expect(mockGetOrCreateTranslationHint).toHaveBeenCalledTimes(1);
  });
});
