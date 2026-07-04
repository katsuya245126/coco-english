import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PronunciationScoreResult } from "@/server/audio/pronunciation-scorer";

let mockSupabase: ReturnType<typeof createMockSupabase>;

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServiceClient: () => mockSupabase,
}));

type ClipFixture = {
  id: string;
  clip_kind: "original_answer" | "repeat_attempt";
  object_key: string | null;
  mime_type: string | null;
  duration_ms: number | null;
  processing_status: string;
  deleted_at: string | null;
  attempt_turns: {
    original_transcript: string | null;
    improved_sentence: string | null;
    repeat_transcript: string | null;
  } | null;
};

function createMockSupabase(options: {
  clip?: ClipFixture | null;
  existingScore?: boolean;
  downloadOk?: boolean;
} = {}) {
  const inserted: Array<Record<string, unknown>> = [];
  const downloaded: string[] = [];

  const clip =
    options.clip === undefined
      ? ({
          id: "clip-1",
          clip_kind: "original_answer",
          object_key: "as-1/att-1/1/original_answer-clip-1.webm",
          mime_type: "audio/webm",
          duration_ms: 4200,
          processing_status: "transcribed",
          deleted_at: null,
          attempt_turns: {
            original_transcript: "I wake up at seven.",
            improved_sentence: null,
            repeat_transcript: null,
          },
        } satisfies ClipFixture)
      : options.clip;

  function createQuery(table: string) {
    const q = {
      _table: table,
      select: vi.fn(() => q),
      eq: vi.fn(() => q),
      maybeSingle: vi.fn(async () => {
        if (table === "audio_clips") {
          return { data: clip, error: null };
        }
        if (table === "pronunciation_scores") {
          return {
            data: options.existingScore ? { audio_clip_id: "clip-1" } : null,
            error: null,
          };
        }
        return { data: null, error: null };
      }),
      upsert: vi.fn((payload: Record<string, unknown>) => {
        inserted.push(payload);
        return Promise.resolve({ error: null });
      }),
    };
    return q;
  }

  return {
    inserted,
    downloaded,
    from: vi.fn((table: string) => createQuery(table)),
    storage: {
      from: vi.fn(() => ({
        download: vi.fn(async (key: string) => {
          downloaded.push(key);
          if (options.downloadOk === false) {
            return { data: null, error: new Error("not found") };
          }
          return {
            data: new Blob(["audio"], { type: "audio/webm" }),
            error: null,
          };
        }),
      })),
    },
  };
}

function fakeScorer(
  result: PronunciationScoreResult,
): () => Promise<PronunciationScoreResult> {
  return vi.fn(async () => result);
}

const OK_SCORE: PronunciationScoreResult = {
  ok: true,
  score: {
    accuracyScore: 74,
    fluencyScore: 60,
    completenessScore: 80,
    pronunciationScore: 65.8,
    starBand: 2,
    referenceText: "I wake up at seven.",
    wordScores: [{ word: "I", accuracyScore: 90, errorType: "None" }],
  },
};

describe("reprocessClipPronunciation", () => {
  beforeEach(() => {
    vi.resetModules();
    process.env.STUDENT_AUDIO_BUCKET = "student-audio";
  });

  it("scores a transcribed clip that has no score row and upserts the result", async () => {
    mockSupabase = createMockSupabase();
    const { reprocessClipPronunciation } = await import(
      "@/server/audio/pronunciation-reprocess"
    );

    const scorePronunciation = fakeScorer(OK_SCORE);
    const result = await reprocessClipPronunciation(
      { audioClipId: "clip-1" },
      { scorePronunciation },
    );

    expect(result).toEqual({ ok: true, scored: true });
    expect(scorePronunciation).toHaveBeenCalledWith(
      expect.objectContaining({ referenceText: "I wake up at seven.", durationMs: 4200 }),
    );
    expect(mockSupabase.downloaded).toContain(
      "as-1/att-1/1/original_answer-clip-1.webm",
    );
    expect(mockSupabase.inserted[0]).toMatchObject({
      audio_clip_id: "clip-1",
      star_band: 2,
      accuracy_score: 74,
    });
  });

  it("does not re-score a clip that already has a score", async () => {
    mockSupabase = createMockSupabase({ existingScore: true });
    const { reprocessClipPronunciation } = await import(
      "@/server/audio/pronunciation-reprocess"
    );

    const scorePronunciation = fakeScorer(OK_SCORE);
    const result = await reprocessClipPronunciation(
      { audioClipId: "clip-1" },
      { scorePronunciation },
    );

    expect(result).toEqual({ ok: false, error: "already_scored" });
    expect(scorePronunciation).not.toHaveBeenCalled();
    expect(mockSupabase.inserted).toHaveLength(0);
  });

  it("returns clip_unavailable for a deleted clip and never downloads it", async () => {
    mockSupabase = createMockSupabase({
      clip: {
        id: "clip-1",
        clip_kind: "original_answer",
        object_key: "key.webm",
        mime_type: "audio/webm",
        duration_ms: 4200,
        processing_status: "deleted",
        deleted_at: "2026-07-04T00:00:00Z",
        attempt_turns: {
          original_transcript: "I wake up at seven.",
          improved_sentence: null,
          repeat_transcript: null,
        },
      },
    });
    const { reprocessClipPronunciation } = await import(
      "@/server/audio/pronunciation-reprocess"
    );

    const scorePronunciation = fakeScorer(OK_SCORE);
    const result = await reprocessClipPronunciation(
      { audioClipId: "clip-1" },
      { scorePronunciation },
    );

    expect(result).toEqual({ ok: false, error: "clip_unavailable" });
    expect(scorePronunciation).not.toHaveBeenCalled();
  });

  it("returns no_reference_text when the turn has no usable transcript", async () => {
    mockSupabase = createMockSupabase({
      clip: {
        id: "clip-1",
        clip_kind: "original_answer",
        object_key: "key.webm",
        mime_type: "audio/webm",
        duration_ms: 4200,
        processing_status: "transcribed",
        deleted_at: null,
        attempt_turns: {
          original_transcript: null,
          improved_sentence: null,
          repeat_transcript: null,
        },
      },
    });
    const { reprocessClipPronunciation } = await import(
      "@/server/audio/pronunciation-reprocess"
    );

    const result = await reprocessClipPronunciation(
      { audioClipId: "clip-1" },
      { scorePronunciation: fakeScorer(OK_SCORE) },
    );

    expect(result).toEqual({ ok: false, error: "no_reference_text" });
  });

  it("uses the improved sentence as the reference for a repeat attempt", async () => {
    mockSupabase = createMockSupabase({
      clip: {
        id: "clip-1",
        clip_kind: "repeat_attempt",
        object_key: "key.webm",
        mime_type: "audio/webm",
        duration_ms: 3000,
        processing_status: "transcribed",
        deleted_at: null,
        attempt_turns: {
          original_transcript: "I go park.",
          improved_sentence: "I am going to the park.",
          repeat_transcript: "I am going to the park.",
        },
      },
    });
    const { reprocessClipPronunciation } = await import(
      "@/server/audio/pronunciation-reprocess"
    );

    const scorePronunciation = fakeScorer(OK_SCORE);
    await reprocessClipPronunciation(
      { audioClipId: "clip-1" },
      { scorePronunciation },
    );

    expect(scorePronunciation).toHaveBeenCalledWith(
      expect.objectContaining({ referenceText: "I am going to the park." }),
    );
  });

  it("propagates a scorer failure without upserting", async () => {
    mockSupabase = createMockSupabase();
    const { reprocessClipPronunciation } = await import(
      "@/server/audio/pronunciation-reprocess"
    );

    const result = await reprocessClipPronunciation(
      { audioClipId: "clip-1" },
      { scorePronunciation: fakeScorer({ ok: false, error: "provider_failed" }) },
    );

    expect(result).toEqual({ ok: false, error: "provider_failed" });
    expect(mockSupabase.inserted).toHaveLength(0);
  });
});
