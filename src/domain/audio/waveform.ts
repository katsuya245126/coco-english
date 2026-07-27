export type WaveformBarOptions = {
  height?: number;
  bars?: number;
  silenceThreshold?: number;
  sensitivity?: number;
};

const DEFAULT_HEIGHT = 32;
const DEFAULT_BARS = 28;
const DEFAULT_SILENCE_THRESHOLD = 3;
const MIN_BAR_HEIGHT = 2;
const BYTE_CENTER = 128;
const BYTE_HALF_RANGE = 128;
const VISUAL_EXPONENT = 0.35;
const VISUAL_SCALE = 1.1;

export function isMeaningfulWaveform(
  samples: Uint8Array | null,
  silenceThreshold = DEFAULT_SILENCE_THRESHOLD,
): boolean {
  if (!samples || samples.length === 0) return false;

  for (const sample of samples) {
    if (Math.abs(sample - BYTE_CENTER) > silenceThreshold) {
      return true;
    }
  }
  return false;
}

export function buildWaveformBars(
  samples: Uint8Array | null,
  options: WaveformBarOptions = {},
): number[] {
  const height = options.height ?? DEFAULT_HEIGHT;
  const bars = Math.max(2, options.bars ?? DEFAULT_BARS);
  const sensitivity = options.sensitivity ?? 1;
  const meaningful = isMeaningfulWaveform(samples, options.silenceThreshold);

  return Array.from({ length: bars }, (_, index) => {
    const sample =
      meaningful && samples && samples.length > 0
        ? samples[
            Math.min(
              samples.length - 1,
              Math.floor((index / (bars - 1)) * (samples.length - 1)),
            )
          ]
        : BYTE_CENTER;
    const rawAmplitude = Math.abs(sample - BYTE_CENTER) / BYTE_HALF_RANGE;
    const normalized = Math.min(
      1,
      Math.pow(rawAmplitude, VISUAL_EXPONENT) * VISUAL_SCALE * sensitivity,
    );
    const barHeight = Math.max(MIN_BAR_HEIGHT, normalized * (height * 0.86));
    return roundToEven(formatNumber(barHeight));
  });
}

function formatNumber(value: number): string {
  return Number(value.toFixed(2)).toString();
}

function roundToEven(value: string): number {
  const numericValue = Number(value);
  return Math.max(MIN_BAR_HEIGHT, Math.round(numericValue / 2) * 2);
}
