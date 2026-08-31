import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PronunciationScoreResult } from "@/server/audio/pronunciation-scorer";
import type { RequestBudgetOperation } from "@/server/security/request-budget";

const { mockLog } = vi.hoisted(() => ({ mockLog: vi.fn() }));
let mockSupabase: ReturnType<typeof createMockSupabase>;

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServiceClient: () => mockSupabase,
}));

vi.mock("@/server/logging/logger", () => ({ log: mockLog }));

const DEFAULT_BEGIN = {
  outcome: "ok",
  object_key: "as-1/att-1/1/original_answer-clip-1.webm",
  duration_ms: 4200,
  reference_text: "I wake up at seven.",
};

const DEFAULT_CLARIFICATION_BEGIN = {
  outcome: "ok",
  object_key: "as-1/att-1/1/original_answer-clip-1.webm",
  duration_ms: 4200,
  clarification_token: "clarification-token-1",
} as const;

const LIFECYCLE_ARGS = {
  p_teacher_id: "teacher-1",
  p_audio_clip_id: "clip-1",
};

type BeginRow = typeof DEFAULT_BEGIN;
type Outcome = "ok" | "already_scored" | "not_found";

function createMockSupabase(options: {
  begin?: Partial<BeginRow>;
  beginError?: boolean;
  downloadOk?: boolean;
  complete?: Outcome;
  completeError?: boolean;
  clear?: Outcome;
  clearError?: boolean;
} = {}) {
  const events: string[] = [];
  let marker = false;
  const begin = { ...DEFAULT_BEGIN, ...options.begin };

  const rpc = vi.fn(async (name: string, args: Record<string, unknown>) => {
    if (name === "begin_pronunciation_reprocessing") {
      events.push("begin");
      if (options.beginError) return { data: null, error: new Error("begin failed") };
      if (marker) return { data: [{ outcome: "unavailable" }], error: null };
      if (begin.outcome === "ok") marker = true;
      return { data: [begin], error: null };
    }
    if (name === "complete_pronunciation_reprocessing") {
      events.push("complete");
      if (options.completeError) return { data: null, error: new Error("complete failed") };
      const outcome = options.complete ?? "ok";
      if (outcome === "ok" || outcome === "already_scored") marker = false;
      return { data: outcome, error: null };
    }
    if (name === "clear_pronunciation_reprocessing") {
      events.push("clear");
      if (options.clearError) return { data: null, error: new Error("clear failed") };
      const outcome = options.clear ?? "ok";
      if (outcome === "ok") marker = false;
      return { data: outcome, error: null };
    }
    throw new Error(`unexpected rpc ${name} ${JSON.stringify(args)}`);
  });

  return {
    events,
    rpc,
    markerActive: () => marker,
    storage: {
      from: vi.fn(() => ({
        download: vi.fn(async () => {
          events.push("download");
          if (options.downloadOk === false) return { data: null, error: new Error("download failed") };
          return { data: new Blob(["audio"], { type: "audio/webm" }), error: null };
        }),
      })),
    },
  };
}

function createClarificationMock(options: {
  begin?: Partial<typeof DEFAULT_CLARIFICATION_BEGIN>;
  beginError?: boolean;
  downloadOk?: boolean;
  complete?: "ok" | "not_found";
  completeError?: boolean;
  clear?: "ok" | "not_found";
  clearError?: boolean;
} = {}) {
  const events: string[] = [];
  let marker = false;
  const begin = { ...DEFAULT_CLARIFICATION_BEGIN, ...options.begin };

  const rpc = vi.fn(async (name: string, args: Record<string, unknown>) => {
    if (name === "begin_teacher_mission_audio_clarification") {
      events.push("begin_clarification");
      if (options.beginError) return { data: null, error: new Error("begin failed") };
      if (marker) return { data: [{ outcome: "unavailable" }], error: null };
      if (begin.outcome === "ok") marker = true;
      return { data: [begin], error: null };
    }
    if (name === "complete_teacher_mission_audio_clarification") {
      events.push("complete_clarification");
      if (options.completeError) return { data: null, error: new Error("complete failed") };
      const outcome = options.complete ?? "ok";
      if (outcome === "ok") marker = false;
      return { data: outcome, error: null };
    }
    if (name === "clear_teacher_mission_audio_clarification") {
      events.push("clear_clarification");
      if (options.clearError) return { data: null, error: new Error("clear failed") };
      const outcome = options.clear ?? "ok";
      if (outcome === "ok") marker = false;
      return { data: outcome, error: null };
    }
    throw new Error(`unexpected rpc ${name} ${JSON.stringify(args)}`);
  });

  return {
    events,
    rpc,
    markerActive: () => marker,
    storage: {
      from: vi.fn(() => ({
        download: vi.fn(async () => {
          events.push("download");
          if (options.downloadOk === false) return { data: null, error: new Error("download failed") };
          return { data: new Blob(["audio"], { type: "audio/webm" }), error: null };
        }),
      })),
    },
  };
}

function fakeScorer(result: PronunciationScoreResult, events?: string[]) {
  return vi.fn(async (_input: { file: Blob; referenceText: string; durationMs: number }) => {
    events?.push("azure");
    return result;
  });
}

function fakeBudget(allowed = true, events?: string[]) {
  return vi.fn(async (_input: { actorId: string; operation: RequestBudgetOperation }) => {
    events?.push("budget");
    return allowed ? { allowed: true as const } : { allowed: false as const, retryAfterSeconds: 60 };
  });
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

async function loadModule() {
  return await import("@/server/audio/pronunciation-reprocess");
}

async function reprocess(
  options: Parameters<typeof createMockSupabase>[0] = {},
  scorer = fakeScorer(OK_SCORE),
  budget = fakeBudget(),
) {
  mockSupabase = createMockSupabase(options);
  const { reprocessClipPronunciation } = await loadModule();
  const activeScorer = vi.fn(async (input) => {
    mockSupabase.events.push("azure");
    return scorer(input);
  });
  const activeBudget = vi.fn(async (input) => {
    mockSupabase.events.push("budget");
    return budget(input);
  });
  const result = await reprocessClipPronunciation(
    { teacherId: "teacher-1", audioClipId: "clip-1" },
    { scorePronunciation: activeScorer, consumeRequestBudget: activeBudget },
  );
  return { result, scorer: activeScorer, budget: activeBudget, supabase: mockSupabase };
}

describe("reprocessClipPronunciation", () => {
  beforeEach(() => {
    vi.resetModules();
    mockLog.mockReset();
    process.env.STUDENT_AUDIO_BUCKET = "student-audio";
  });

  it("denies an unowned clip before provider work", async () => {
    const { result, scorer, budget, supabase } = await reprocess({ begin: { outcome: "unauthorized" } });

    expect(result).toEqual({ ok: false, error: "unauthorized" });
    expect(supabase.events).toEqual(["begin"]);
    expect(budget).not.toHaveBeenCalled();
    expect(scorer).not.toHaveBeenCalled();
  });

  it.each(["already_scored", "unavailable"])("does no provider work for a begin %s outcome", async (outcome) => {
    const { result, scorer, budget, supabase } = await reprocess({ begin: { outcome } });

    expect(result).toEqual({ ok: false, error: outcome });
    expect(supabase.events).toEqual(["begin"]);
    expect(budget).not.toHaveBeenCalled();
    expect(scorer).not.toHaveBeenCalled();
  });

  it("claims, downloads, admits, scores, and completes in order", async () => {
    const { result, scorer, budget, supabase } = await reprocess();

    expect(result).toEqual({ ok: true, scored: true });
    expect(supabase.events).toEqual(["begin", "download", "budget", "azure", "complete"]);
    expect(supabase.rpc).toHaveBeenNthCalledWith(
      1,
      "begin_pronunciation_reprocessing",
      LIFECYCLE_ARGS,
    );
    expect(supabase.rpc).toHaveBeenNthCalledWith(
      2,
      "complete_pronunciation_reprocessing",
      {
        ...LIFECYCLE_ARGS,
        p_accuracy_score: 74,
        p_fluency_score: 60,
        p_completeness_score: 80,
        p_pronunciation_score: 65.8,
        p_star_band: 2,
        p_word_scores: [{ word: "I", accuracyScore: 90, errorType: "None" }],
      },
    );
    expect(budget).toHaveBeenCalledWith({ actorId: "teacher-1", operation: "teacher_provider" });
    expect(scorer).toHaveBeenCalledWith(expect.objectContaining({
      file: expect.any(Blob), referenceText: "I wake up at seven.", durationMs: 4200,
    }));
  });

  it("clears its claim after a download failure", async () => {
    const { result, supabase } = await reprocess({ downloadOk: false });
    expect(result).toEqual({ ok: false, error: "failed" });
    expect(supabase.events).toEqual(["begin", "download", "clear"]);
    expect(supabase.rpc).toHaveBeenNthCalledWith(
      2,
      "clear_pronunciation_reprocessing",
      LIFECYCLE_ARGS,
    );
  });

  it("clears its claim when budget admission is denied", async () => {
    const { result, scorer, supabase } = await reprocess({}, fakeScorer(OK_SCORE), fakeBudget(false));
    expect(result).toEqual({ ok: false, error: "rate_limited" });
    expect(supabase.events).toEqual(["begin", "download", "budget", "clear"]);
    expect(scorer).not.toHaveBeenCalled();
  });

  it("clears its claim after a scorer failure so a retry can score", async () => {
    mockSupabase = createMockSupabase();
    const { reprocessClipPronunciation } = await loadModule();
    const failed = await reprocessClipPronunciation(
      { teacherId: "teacher-1", audioClipId: "clip-1" },
      { scorePronunciation: fakeScorer({ ok: false, error: "provider_failed" }, mockSupabase.events), consumeRequestBudget: fakeBudget(true, mockSupabase.events) },
    );
    const retried = await reprocessClipPronunciation(
      { teacherId: "teacher-1", audioClipId: "clip-1" },
      { scorePronunciation: fakeScorer(OK_SCORE, mockSupabase.events), consumeRequestBudget: fakeBudget(true, mockSupabase.events) },
    );

    expect(failed).toEqual({ ok: false, error: "failed" });
    expect(retried).toEqual({ ok: true, scored: true });
    expect(mockSupabase.events).toEqual([
      "begin", "download", "budget", "azure", "clear",
      "begin", "download", "budget", "azure", "complete",
    ]);
  });

  it("clears its claim when completion fails", async () => {
    const { result, supabase } = await reprocess({ completeError: true });
    expect(result).toEqual({ ok: false, error: "failed" });
    expect(supabase.events).toEqual(["begin", "download", "budget", "azure", "complete", "clear"]);
  });

  it("returns already_scored after completion without clearing again", async () => {
    const { result, supabase } = await reprocess({ complete: "already_scored" });
    expect(result).toEqual({ ok: false, error: "already_scored" });
    expect(supabase.events).toEqual(["begin", "download", "budget", "azure", "complete"]);
  });

  it.each(["object_key", "reference_text"])("clears an incomplete claimed begin row missing %s", async (field) => {
    const { result, supabase } = await reprocess({ begin: { [field]: null } });
    expect(result).toEqual({ ok: false, error: "failed" });
    expect(supabase.events).toEqual(["begin", "clear"]);
  });

  it("logs a failed cleanup without secret request data and leaves repair possible", async () => {
    const { result, supabase } = await reprocess({ downloadOk: false, clearError: true });
    expect(result).toEqual({ ok: false, error: "failed" });
    expect(supabase.markerActive()).toBe(true);
    expect(mockLog).toHaveBeenCalledWith("warn", "audio.pronunciation_reprocess_cleanup_failed", {
      audioClipId: "clip-1", outcome: "error",
    });
    expect(JSON.stringify(mockLog.mock.calls)).not.toContain("teacher-1");
    expect(JSON.stringify(mockLog.mock.calls)).not.toContain("I wake up at seven.");
  });

  it("logs a not_found cleanup and leaves the active marker for manual repair", async () => {
    const { result, supabase } = await reprocess({ downloadOk: false, clear: "not_found" });
    expect(result).toEqual({ ok: false, error: "failed" });
    expect(supabase.markerActive()).toBe(true);
    expect(mockLog).toHaveBeenCalledWith("warn", "audio.pronunciation_reprocess_cleanup_failed", {
      audioClipId: "clip-1", outcome: "not_found",
    });
  });

  it("allows only one held scorer to run for a clip", async () => {
    mockSupabase = createMockSupabase();
    const { reprocessClipPronunciation } = await loadModule();
    let release!: () => void;
    const held = new Promise<void>((resolve) => { release = resolve; });
    const scorer = vi.fn(async () => {
      mockSupabase.events.push("azure");
      await held;
      return OK_SCORE;
    });
    const first = reprocessClipPronunciation(
      { teacherId: "teacher-1", audioClipId: "clip-1" },
      { scorePronunciation: scorer, consumeRequestBudget: fakeBudget() },
    );
    await vi.waitFor(() => expect(scorer).toHaveBeenCalledOnce());
    const second = await reprocessClipPronunciation(
      { teacherId: "teacher-1", audioClipId: "clip-1" },
      { scorePronunciation: scorer, consumeRequestBudget: fakeBudget() },
    );
    release();

    expect(second).toEqual({ ok: false, error: "unavailable" });
    await expect(first).resolves.toEqual({ ok: true, scored: true });
    expect(scorer).toHaveBeenCalledOnce();
  });

  it("passes repeat-attempt begin data to the scorer unchanged", async () => {
    const { scorer } = await reprocess({ begin: {
      object_key: "as-1/att-1/2/repeat_attempt-clip-1.webm",
      duration_ms: 3000,
      reference_text: "I am going to the park.",
    } });
    expect(scorer).toHaveBeenCalledWith(expect.objectContaining({
      referenceText: "I am going to the park.", durationMs: 3000,
    }));
  });

  it("clarifies wording with a tokenized claim and replaces the clip score", async () => {
    mockSupabase = createClarificationMock();
    const { clarifyMissionAudio } = await loadModule();
    const scorer = vi.fn(async (input: { referenceText: string }) => {
      expect(input.referenceText).toBe("I wake up at eight.");
      return OK_SCORE;
    });
    const budget = fakeBudget(true, mockSupabase.events);

    const result = await clarifyMissionAudio(
      {
        teacherId: "teacher-1",
        audioClipId: "clip-1",
        teacherConfirmedText: "  I wake up at eight.  ",
      },
      { scorePronunciation: scorer, consumeRequestBudget: budget },
    );

    expect(result).toEqual({ ok: true, scored: true });
    expect(mockSupabase.events).toEqual([
      "begin_clarification",
      "download",
      "budget",
      "complete_clarification",
    ]);
    expect(mockSupabase.rpc).toHaveBeenNthCalledWith(
      1,
      "begin_teacher_mission_audio_clarification",
      {
        p_teacher_id: "teacher-1",
        p_audio_clip_id: "clip-1",
        p_teacher_confirmed_text: "I wake up at eight.",
      },
    );
    expect(mockSupabase.rpc).toHaveBeenNthCalledWith(
      2,
      "complete_teacher_mission_audio_clarification",
      expect.objectContaining({
        p_teacher_id: "teacher-1",
        p_audio_clip_id: "clip-1",
        p_clarification_token: "clarification-token-1",
        p_teacher_confirmed_text: "I wake up at eight.",
      }),
    );
  });

  it("clears only its clarification token after provider failure", async () => {
    mockSupabase = createClarificationMock();
    const { clarifyMissionAudio } = await loadModule();

    const result = await clarifyMissionAudio(
      {
        teacherId: "teacher-1",
        audioClipId: "clip-1",
        teacherConfirmedText: "I wake up at eight.",
      },
      {
        scorePronunciation: vi.fn(async () => ({
          ok: false as const,
          error: "provider_failed" as const,
        })),
        consumeRequestBudget: fakeBudget(true, mockSupabase.events),
      },
    );

    expect(result).toEqual({ ok: false, error: "failed" });
    expect(mockSupabase.events).toEqual([
      "begin_clarification",
      "download",
      "budget",
      "clear_clarification",
    ]);
    expect(mockSupabase.rpc).toHaveBeenLastCalledWith(
      "clear_teacher_mission_audio_clarification",
      {
        p_teacher_id: "teacher-1",
        p_audio_clip_id: "clip-1",
        p_clarification_token: "clarification-token-1",
      },
    );
  });

  it("rejects blank clarification wording before claiming audio", async () => {
    mockSupabase = createClarificationMock();
    const { clarifyMissionAudio } = await loadModule();

    await expect(
      clarifyMissionAudio({
        teacherId: "teacher-1",
        audioClipId: "clip-1",
        teacherConfirmedText: "   ",
      }),
    ).resolves.toEqual({ ok: false, error: "invalid_text" });
    expect(mockSupabase.events).toEqual([]);
  });
});
