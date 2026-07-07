/**
 * Mascot speaking-state hysteresis (MASCOT-02).
 *
 * Pure domain module — no DOM/Web Audio/timer imports. Takes primitive
 * amplitude/timestamp inputs so it is unit-testable without jsdom or a real
 * AnalyserNode.
 */

export const SILENCE_HYSTERESIS_MS = 200;
export const SILENCE_THRESHOLD = 0.05;

export type SpeakingHysteresisState = {
  lastAboveThresholdAt: number;
  isSpeakingVisually: boolean;
};

export function updateSpeakingVisual(
  amplitude: number,
  now: number,
  state: SpeakingHysteresisState,
): SpeakingHysteresisState {
  if (amplitude > SILENCE_THRESHOLD) {
    return { lastAboveThresholdAt: now, isSpeakingVisually: true };
  }
  if (now - state.lastAboveThresholdAt > SILENCE_HYSTERESIS_MS) {
    return { ...state, isSpeakingVisually: false };
  }
  return { ...state, isSpeakingVisually: true };
}
