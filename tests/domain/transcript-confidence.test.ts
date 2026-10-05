import { describe, expect, it } from "vitest";
import {
  LOW_CONFIDENCE_LOGPROB_THRESHOLD,
  summarizeTranscriptConfidence,
  isLowConfidenceTranscript,
} from "@/domain/audio/transcript-confidence";

/**
 * Values below are the real measured distribution from 2026-07-24, scoring six
 * of the user's own recordings (3 deliberate mumbles, 3 genuine answers) three
 * times each with the production call shape. See
 * docs/local/tasks/2026-07-24-mumble-uat.md (local-only) for how the recordings were made.
 *
 * The single most important fact these tests encode: AVERAGE logprob does not
 * separate the two classes. One real mumble averaged -0.041 — better than some
 * genuine speech — while transcribing as "I don't like to survive to 2005
 * slaughter." Its worst single token was -0.174. Every genuine answer had a
 * worst token of -0.000. Rejection must key on the minimum, never the mean.
 */
describe("summarizeTranscriptConfidence", () => {
  it("reports the worst single token, not the average", () => {
    // Shape of the failing case: mostly confident tokens with one bad one,
    // which is exactly what averaging hides.
    const summary = summarizeTranscriptConfidence([
      { logprob: -0.0001 },
      { logprob: -0.0001 },
      { logprob: -0.174 },
      { logprob: -0.0001 },
    ]);

    expect(summary).not.toBeNull();
    expect(summary?.minLogprob).toBeCloseTo(-0.174, 5);
    expect(summary?.tokenCount).toBe(4);
  });

  it("returns null when the provider sent no logprobs", () => {
    // Older models and some response shapes omit the field entirely. Absence
    // is not evidence of low confidence — the check must simply not run.
    expect(summarizeTranscriptConfidence(undefined)).toBeNull();
    expect(summarizeTranscriptConfidence([])).toBeNull();
  });

  it("ignores malformed entries rather than treating them as confident", () => {
    const summary = summarizeTranscriptConfidence([
      { logprob: -0.5 },
      { logprob: null } as unknown as { logprob?: number },
      {},
    ]);

    expect(summary?.minLogprob).toBeCloseTo(-0.5, 5);
    expect(summary?.tokenCount).toBe(1);
  });

  it("returns null when every entry is malformed", () => {
    expect(summarizeTranscriptConfidence([{}])).toBeNull();
  });
});

describe("isLowConfidenceTranscript", () => {
  it("accepts the measured genuine answers", () => {
    // All 9 genuine-answer runs returned a worst token of -0.000.
    for (const minLogprob of [-0, -0.000001, -0.0004]) {
      expect(isLowConfidenceTranscript({ minLogprob, tokenCount: 8 })).toBe(
        false,
      );
    }
  });

  it("rejects the measured mumbles, including the tightest one", () => {
    // -0.174 is Mumble 3 run 1, the closest any mumble came to passing.
    // -4.362 is the worst observed.
    for (const minLogprob of [-0.174, -0.612, -2.424, -4.362]) {
      expect(isLowConfidenceTranscript({ minLogprob, tokenCount: 8 })).toBe(
        true,
      );
    }
  });

  it("places the threshold inside the measured gap", () => {
    // Genuine answers sat at -0.000, the tightest mumble at -0.174. Anything
    // in between separates all 18 runs; drifting outside that band breaks the
    // only empirical grounding this check has.
    expect(LOW_CONFIDENCE_LOGPROB_THRESHOLD).toBeLessThan(0);
    expect(LOW_CONFIDENCE_LOGPROB_THRESHOLD).toBeGreaterThan(-0.174);
  });

  it("does not reject when there is no confidence summary", () => {
    expect(isLowConfidenceTranscript(null)).toBe(false);
  });
});
