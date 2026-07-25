import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TranscriptionClient } from "@/server/audio/transcription";

const { mockLog } = vi.hoisted(() => ({ mockLog: vi.fn() }));

vi.mock("@/server/logging/logger", () => ({
  log: mockLog,
}));

type FakeTranscriptionClient = TranscriptionClient;

function createFakeClient(result: unknown): FakeTranscriptionClient {
  return {
    audio: {
      transcriptions: {
        create: vi.fn(async () => result) as TranscriptionClient["audio"]["transcriptions"]["create"],
      },
    },
  };
}

describe("transcribeAudioFile", () => {
  beforeEach(() => {
    mockLog.mockClear();
  });

  it("returns transcript text from an injected client", async () => {
    const { transcribeAudioFile } = await import("@/server/audio/transcription");
    const client = createFakeClient({ text: "I like apples." });

    const result = await transcribeAudioFile(
      {
        file: new Blob(["voice"], { type: "audio/webm" }),
        mimeType: "audio/webm",
        model: "test-transcribe",
      },
      { apiKey: "test-key", client },
    );

    expect(result).toEqual({
      ok: true,
      text: "I like apples.",
      koreanSpans: [],
    });
    expect(client.audio.transcriptions.create).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "test-transcribe",
      }),
    );
  });

  it("pins the transcription language to English so a mid-sentence Korean word doesn't flip the whole transcript to Korean", async () => {
    const { transcribeAudioFile } = await import("@/server/audio/transcription");
    const client = createFakeClient({ text: "I like apples." });

    await transcribeAudioFile(
      {
        file: new Blob(["voice"], { type: "audio/webm" }),
        mimeType: "audio/webm",
        model: "test-transcribe",
      },
      { apiKey: "test-key", client },
    );

    expect(client.audio.transcriptions.create).toHaveBeenCalledWith(
      expect.objectContaining({
        language: "en",
      }),
    );
  });

  it("keeps Korean script verbatim instead of deleting the student's answer", async () => {
    // Deleting the span used to yield "I like after school." — fluent, and
    // missing the actual answer, with nothing downstream able to tell.
    // Romanizing it in place was rejected too: the transcript is the evidence
    // record a teacher reads, so it must say what the child actually said.
    const { transcribeAudioFile } = await import("@/server/audio/transcription");
    const client = createFakeClient({ text: "I like 축구 after school." });

    const result = await transcribeAudioFile(
      {
        file: new Blob(["voice"], { type: "audio/webm" }),
        mimeType: "audio/webm",
      },
      { apiKey: "test-key", client },
    );

    expect(result).toEqual({
      ok: true,
      text: "I like 축구 after school.",
      koreanSpans: [{ hangul: "축구", romanized: "Chukgu" }],
    });
  });

  it("keeps a code-switched place name in the transcript", async () => {
    // The 2026-07-23 probe case: 거제도 survived the English language pin.
    const { transcribeAudioFile } = await import("@/server/audio/transcription");
    const client = createFakeClient({
      text: "I'm going to 거제도 this summer vacation.",
    });

    const result = await transcribeAudioFile(
      {
        file: new Blob(["voice"], { type: "audio/webm" }),
        mimeType: "audio/webm",
      },
      { apiKey: "test-key", client },
    );

    expect(result).toEqual({
      ok: true,
      text: "I'm going to 거제도 this summer vacation.",
      koreanSpans: [{ hangul: "거제도", romanized: "Geojedo" }],
    });
  });

  it("passes Korean-only provider output to the evaluator rather than rejecting it here", async () => {
    // Superseded 2026-07-25. This previously expected `empty_transcript`, on
    // the assumption that all-Hangul output always means "the student answered
    // in Korean". It can equally mean accented English the transcriber
    // mis-scripted ("바나나스" for *bananas*), and that blanket rejection left a
    // child permanently stuck on a turn. Telling the two apart is the
    // evaluator's job — it has both the phonetic rule and the non_english
    // path — so the transcript now reaches it verbatim, spans attached.
    const { transcribeAudioFile } = await import("@/server/audio/transcription");
    const client = createFakeClient({ text: "나는 방과 후에 축구를 좋아해요." });

    const result = await transcribeAudioFile(
      {
        file: new Blob(["voice"], { type: "audio/webm" }),
        mimeType: "audio/webm",
      },
      { apiKey: "test-key", client },
    );

    expect(result.ok).toBe(true);
    expect(result).toMatchObject({ text: "나는 방과 후에 축구를 좋아해요." });
  });

  it("passes a Korean answer in an English frame to the evaluator to judge (UAT 2026-07-24)", async () => {
    // "초콜릿 is better than 바닐라." has every content word in Korean and only
    // a comparative frame in English. Transcription deliberately does NOT
    // decide this case: it is syntactically indistinguishable from a valid
    // code-switch ("I like 축구.") by any string heuristic, so the transcript
    // and its spans reach the evaluator, which owns the non_english call.
    const { transcribeAudioFile } = await import("@/server/audio/transcription");
    const client = createFakeClient({ text: "초콜릿 is better than 바닐라." });

    const result = await transcribeAudioFile(
      {
        file: new Blob(["voice"], { type: "audio/webm" }),
        mimeType: "audio/webm",
      },
      { apiKey: "test-key", client },
    );

    expect(result).toEqual({
      ok: true,
      text: "초콜릿 is better than 바닐라.",
      koreanSpans: [
        { hangul: "초콜릿", romanized: "Chokolrit" },
        { hangul: "바닐라", romanized: "Banilra" },
      ],
    });
  });

  it("uses the configured transcription model when none is provided", async () => {
    const { transcribeAudioFile } = await import("@/server/audio/transcription");
    const client = createFakeClient({ text: "Hello Coco." });

    await transcribeAudioFile(
      {
        file: new Blob(["voice"], { type: "audio/webm" }),
        mimeType: "audio/webm",
      },
      { apiKey: "test-key", client, model: "env-transcribe" },
    );

    expect(client.audio.transcriptions.create).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "env-transcribe",
      }),
    );
  });

  it("maps missing API key before creating a provider request", async () => {
    const { transcribeAudioFile } = await import("@/server/audio/transcription");
    const client = createFakeClient({ text: "Should not run" });

    const result = await transcribeAudioFile(
      {
        file: new Blob(["voice"], { type: "audio/webm" }),
        mimeType: "audio/webm",
      },
      { apiKey: "", client },
    );

    expect(result).toEqual({ ok: false, error: "missing_api_key" });
    expect(client.audio.transcriptions.create).not.toHaveBeenCalled();
  });

  it("maps empty transcripts to a retryable adapter error", async () => {
    const { transcribeAudioFile } = await import("@/server/audio/transcription");
    const client = createFakeClient({ text: "   " });

    const result = await transcribeAudioFile(
      {
        file: new Blob(["voice"], { type: "audio/webm" }),
        mimeType: "audio/webm",
      },
      { apiKey: "test-key", client },
    );

    expect(result).toEqual({ ok: false, error: "empty_transcript" });
  });

  it("rejects a prompt echo using the exact prompt sent to the provider", async () => {
    const { TRANSCRIPTION_PROMPT, transcribeAudioFile } = await import(
      "@/server/audio/transcription"
    );
    const expectedPrompt =
      "The student is a Korean ESL learner speaking English. Transcribe the English words spoken. If the student says a Korean word, write it in Hangul exactly as spoken.";
    const client = createFakeClient({
      text: `Context: ${expectedPrompt}`,
    });

    const result = await transcribeAudioFile(
      {
        file: new Blob(["silence"], { type: "audio/webm" }),
        mimeType: "audio/webm",
      },
      { apiKey: "test-key", client },
    );

    expect(result).toEqual({ ok: false, error: "no_speech" });
    expect(TRANSCRIPTION_PROMPT).toBe(expectedPrompt);
    expect(client.audio.transcriptions.create).toHaveBeenCalledWith(
      expect.objectContaining({ prompt: TRANSCRIPTION_PROMPT }),
    );
    expect(mockLog).toHaveBeenCalledWith("error", "audio.transcription_failed", {
      error: "no_speech",
      reason: "prompt_echo",
    });
  });

  it("requests token logprobs so hallucinated audio can be rejected", async () => {
    const { transcribeAudioFile } = await import("@/server/audio/transcription");
    const client = createFakeClient({ text: "I like apples." });

    await transcribeAudioFile(
      {
        file: new Blob(["voice"], { type: "audio/webm" }),
        mimeType: "audio/webm",
      },
      { apiKey: "test-key", client },
    );

    // `include: ["logprobs"]` requires response_format "json" on
    // gpt-4o-mini-transcribe. "verbose_json" is whisper-1 only and 400s here.
    expect(client.audio.transcriptions.create).toHaveBeenCalledWith(
      expect.objectContaining({
        response_format: "json",
        include: ["logprobs"],
      }),
    );
  });

  it("does NOT reject a low-confidence transcript by default", async () => {
    // Regression pin for the 2026-07-24 production incident. Rejecting on the
    // -0.1 threshold blocked real students on good answers with no way past.
    // Shadow mode is the default and must stay the default until the logged
    // production distribution justifies a specific threshold.
    const { transcribeAudioFile } = await import("@/server/audio/transcription");
    const client = createFakeClient({
      text: "I will play soccer.",
      logprobs: [{ logprob: -0.0001 }, { logprob: -2.424 }],
    });

    const result = await transcribeAudioFile(
      {
        file: new Blob(["quiet"], { type: "audio/webm" }),
        mimeType: "audio/webm",
      },
      { apiKey: "test-key", client },
    );

    expect(result).toEqual({
      ok: true,
      text: "I will play soccer.",
      koreanSpans: [],
    });
  });

  it("records what it would have blocked while in shadow mode", async () => {
    // Shadow mode is only worth running if the would-have-blocked clips are
    // countable afterwards — that count is what re-sets the threshold.
    const { transcribeAudioFile } = await import("@/server/audio/transcription");
    const client = createFakeClient({
      text: "All right, guys",
      logprobs: [{ logprob: -0.0001 }, { logprob: -2.424 }],
    });

    await transcribeAudioFile(
      {
        file: new Blob(["mumble"], { type: "audio/webm" }),
        mimeType: "audio/webm",
      },
      { apiKey: "test-key", client },
    );

    expect(mockLog).toHaveBeenCalledWith("warn", "audio.transcript_confidence", {
      minLogprob: -2.424,
      tokenCount: 2,
      lowConfidence: true,
      blocked: false,
    });
    // Student content stays out of the logs on every path.
    const logged = mockLog.mock.calls.flat();
    expect(JSON.stringify(logged)).not.toContain("All right");
  });

  it("rejects a low-confidence transcript only when rejection is explicitly enabled", async () => {
    // The 2026-07-24 UAT failure: a deliberate mumble transcribed as
    // "All right, guys". Nothing in the text gives it away — only the
    // token-level uncertainty does. The detection still works; it is the
    // threshold that is not yet trustworthy enough to act on.
    const { transcribeAudioFile } = await import("@/server/audio/transcription");
    const client = createFakeClient({
      text: "All right, guys",
      logprobs: [
        { logprob: -0.0001 },
        { logprob: -0.174 },
        { logprob: -0.0001 },
      ],
    });

    const result = await transcribeAudioFile(
      {
        file: new Blob(["mumble"], { type: "audio/webm" }),
        mimeType: "audio/webm",
      },
      { apiKey: "test-key", client, rejectLowConfidence: true },
    );

    expect(result).toEqual({ ok: false, error: "low_confidence" });
    expect(mockLog).toHaveBeenCalledWith("error", "audio.transcription_failed", {
      error: "low_confidence",
      minLogprob: -0.174,
      tokenCount: 3,
    });
  });

  it("logs confidence for accepted transcripts too, so the pass side of the distribution is visible", async () => {
    // Without the accepted side there is no way to see how close genuine
    // answers run to the threshold — the false-positive risk this check
    // carries. Particularly the untested quiet/far-from-mic answer.
    const { transcribeAudioFile } = await import("@/server/audio/transcription");
    const client = createFakeClient({
      text: "I like apples.",
      logprobs: [{ logprob: -0.0001 }, { logprob: -0.02 }],
    });

    const result = await transcribeAudioFile(
      {
        file: new Blob(["voice"], { type: "audio/webm" }),
        mimeType: "audio/webm",
      },
      { apiKey: "test-key", client },
    );

    expect(result.ok).toBe(true);
    expect(mockLog).toHaveBeenCalledWith("info", "audio.transcript_confidence", {
      minLogprob: -0.02,
      tokenCount: 2,
      lowConfidence: false,
      blocked: false,
    });
  });

  it("accepts a genuine answer whose worst token is still confident", async () => {
    const { transcribeAudioFile } = await import("@/server/audio/transcription");
    const client = createFakeClient({
      text: "I will play soccer.",
      logprobs: [
        { logprob: -0.0001 },
        { logprob: -0.0004 },
        { logprob: -0 },
      ],
    });

    const result = await transcribeAudioFile(
      {
        file: new Blob(["voice"], { type: "audio/webm" }),
        mimeType: "audio/webm",
      },
      { apiKey: "test-key", client },
    );

    expect(result).toEqual({
      ok: true,
      text: "I will play soccer.",
      koreanSpans: [],
    });
  });

  it("accepts a transcript when the provider returned no logprobs at all", async () => {
    // Absence of the signal is not evidence of a hallucination. A provider or
    // model that omits logprobs must degrade to the previous behaviour, not
    // start rejecting every answer.
    const { transcribeAudioFile } = await import("@/server/audio/transcription");
    const client = createFakeClient({ text: "I will play soccer." });

    const result = await transcribeAudioFile(
      {
        file: new Blob(["voice"], { type: "audio/webm" }),
        mimeType: "audio/webm",
      },
      { apiKey: "test-key", client },
    );

    expect(result).toEqual({
      ok: true,
      text: "I will play soccer.",
      koreanSpans: [],
    });
  });

  it("still keeps a code-switched Korean word when the transcript is confident", async () => {
    // A Hangul span is unusual text but not an uncertain decode. Guard against
    // the confidence check quietly undoing the code-switching support.
    const { transcribeAudioFile } = await import("@/server/audio/transcription");
    const client = createFakeClient({
      text: "I'm going to 거제도 this summer vacation.",
      logprobs: [{ logprob: -0.0001 }, { logprob: -0.001 }],
    });

    const result = await transcribeAudioFile(
      {
        file: new Blob(["voice"], { type: "audio/webm" }),
        mimeType: "audio/webm",
      },
      { apiKey: "test-key", client },
    );

    expect(result).toEqual({
      ok: true,
      text: "I'm going to 거제도 this summer vacation.",
      koreanSpans: [{ hangul: "거제도", romanized: "Geojedo" }],
    });
  });

  it("maps provider failures without exposing provider details", async () => {
    const { transcribeAudioFile } = await import("@/server/audio/transcription");
    const client: FakeTranscriptionClient = {
      audio: {
        transcriptions: {
          create: vi.fn(async () => {
            throw new Error("provider unavailable");
          }) as TranscriptionClient["audio"]["transcriptions"]["create"],
        },
      },
    };

    const result = await transcribeAudioFile(
      {
        file: new Blob(["voice"], { type: "audio/webm" }),
        mimeType: "audio/webm",
      },
      { apiKey: "test-key", client },
    );

    expect(result).toEqual({ ok: false, error: "transcription_failed" });
  });
});

/**
 * Guards the 2026-07-25 UAT blocker. A child answered the bare English word
 * "Bananas." and the transcriber, biased by TRANSCRIPTION_PROMPT's "Korean ESL
 * learner" framing, wrote it as "바나나스" — all Hangul, no Latin letter. The
 * transcript was then blanked here and rejected as `empty_transcript`, so the
 * student saw "I didn't hear you. Try again." forever with no way past.
 *
 * Prompt rewording was measured and rejected: across four real clips it never
 * fixed "바나나스", and every candidate that softened the Korean framing broke
 * code-switch retention (김밥 -> "kimbap", 민준 -> "Min-jun").
 *
 * The romanization already carries the cue the evaluator needs
 * ("바나나스" -> "Bananaseu" ~ bananas), and the evaluator already owns this
 * judgement — it has both the phonetic accented-English rule and the
 * non_english path for a genuinely Korean answer. So an all-Hangul transcript
 * must reach it with its spans intact instead of dying at this gate.
 */
describe("all-Hangul transcripts reach the evaluator (UAT 2026-07-25)", () => {
  beforeEach(() => {
    mockLog.mockClear();
  });

  it("returns accented English written in Hangul instead of rejecting it as empty", async () => {
    const { transcribeAudioFile } = await import("@/server/audio/transcription");
    const client = createFakeClient({ text: "바나나스" });

    const result = await transcribeAudioFile(
      {
        file: new Blob(["voice"], { type: "audio/webm" }),
        mimeType: "audio/webm",
      },
      { apiKey: "test-key", client },
    );

    expect(result).toEqual({
      ok: true,
      text: "바나나스",
      koreanSpans: [{ hangul: "바나나스", romanized: "Bananaseu" }],
    });
  });

  it("still returns a genuinely Korean answer so the evaluator can call it non_english", async () => {
    // Not rejected here either: deciding code-switch vs Korean-answer is a
    // syntactic judgement that belongs to the evaluator, per the NOTE in
    // hangul-romanization.ts. This layer must not re-litigate it.
    const { transcribeAudioFile } = await import("@/server/audio/transcription");
    const client = createFakeClient({ text: "나는 방과 후에 축구를 좋아해요." });

    const result = await transcribeAudioFile(
      {
        file: new Blob(["voice"], { type: "audio/webm" }),
        mimeType: "audio/webm",
      },
      { apiKey: "test-key", client },
    );

    expect(result.ok).toBe(true);
  });

  it("still rejects a genuinely empty transcript", async () => {
    const { transcribeAudioFile } = await import("@/server/audio/transcription");
    const client = createFakeClient({ text: "   " });

    const result = await transcribeAudioFile(
      {
        file: new Blob(["voice"], { type: "audio/webm" }),
        mimeType: "audio/webm",
      },
      { apiKey: "test-key", client },
    );

    expect(result).toEqual({ ok: false, error: "empty_transcript" });
  });
});
