import { describe, expect, it } from "vitest";
import {
  SILENCE_HYSTERESIS_MS,
  SILENCE_THRESHOLD,
  type SpeakingHysteresisState,
  updateSpeakingVisual,
} from "@/domain/character/mascot-speaking-state";

function state(
  lastAboveThresholdAt = 1_000,
  isSpeakingVisually = true,
): SpeakingHysteresisState {
  return { lastAboveThresholdAt, isSpeakingVisually };
}

describe("updateSpeakingVisual (MASCOT-02)", () => {
  it("marks the visual speaking and stores now when amplitude is above threshold", () => {
    const prior = state(900, false);

    const next = updateSpeakingVisual(SILENCE_THRESHOLD + 0.01, 1_200, prior);

    expect(next).toEqual({
      lastAboveThresholdAt: 1_200,
      isSpeakingVisually: true,
    });
  });

  it("keeps speaking through below-threshold silence inside the hysteresis window", () => {
    const prior = state(1_000, true);

    const next = updateSpeakingVisual(
      SILENCE_THRESHOLD - 0.01,
      1_000 + SILENCE_HYSTERESIS_MS - 1,
      prior,
    );

    expect(next.isSpeakingVisually).toBe(true);
    expect(next.lastAboveThresholdAt).toBe(1_000);
  });

  it("keeps speaking exactly at the hysteresis boundary", () => {
    const prior = state(1_000, true);

    const next = updateSpeakingVisual(
      SILENCE_THRESHOLD - 0.01,
      1_000 + SILENCE_HYSTERESIS_MS,
      prior,
    );

    expect(next.isSpeakingVisually).toBe(true);
  });

  it("turns speaking off strictly after the hysteresis boundary", () => {
    const prior = state(1_000, true);

    const next = updateSpeakingVisual(
      SILENCE_THRESHOLD - 0.01,
      1_000 + SILENCE_HYSTERESIS_MS + 1,
      prior,
    );

    expect(next).toEqual({
      lastAboveThresholdAt: 1_000,
      isSpeakingVisually: false,
    });
  });

  it("returns a new state object without mutating the input", () => {
    const prior = state(1_000, true);

    const next = updateSpeakingVisual(
      SILENCE_THRESHOLD - 0.01,
      1_000 + SILENCE_HYSTERESIS_MS + 1,
      prior,
    );

    expect(next).not.toBe(prior);
    expect(prior).toEqual({
      lastAboveThresholdAt: 1_000,
      isSpeakingVisually: true,
    });
  });
});
