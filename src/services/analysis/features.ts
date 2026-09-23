// Pure audio feature extraction from AnalyserNode data (VIS §12–13).
// All outputs are normalized to 0..1 so visualizers never depend on raw
// provider-specific levels.

export const BANDS = {
  bass: [20, 250],
  mid: [250, 4000],
  treble: [4000, 16000],
} as const;

/** Root mean square of time-domain samples (−1…1) → 0…1. */
export function computeRms(samples: Float32Array): number {
  if (samples.length === 0) return 0;
  let sum = 0;
  for (let i = 0; i < samples.length; i++) sum += samples[i]! * samples[i]!;
  return Math.min(1, Math.sqrt(sum / samples.length));
}

/** Largest absolute sample → 0…1. */
export function computePeak(samples: Float32Array): number {
  let peak = 0;
  for (let i = 0; i < samples.length; i++) {
    const v = Math.abs(samples[i]!);
    if (v > peak) peak = v;
  }
  return Math.min(1, peak);
}

/** Frequency (Hz) → FFT bin index for a given bin count and sample rate. */
export function binForFrequency(hz: number, binCount: number, sampleRate: number): number {
  const nyquist = sampleRate / 2;
  return Math.max(0, Math.min(binCount - 1, Math.round((hz / nyquist) * binCount)));
}

/**
 * Mean energy of byte frequency data (0…255, already dB-scaled by the
 * AnalyserNode) between two frequencies → 0…1.
 */
export function bandEnergy(bins: Uint8Array, sampleRate: number, lowHz: number, highHz: number): number {
  const from = binForFrequency(lowHz, bins.length, sampleRate);
  const to = Math.max(from, binForFrequency(highHz, bins.length, sampleRate));
  let sum = 0;
  for (let i = from; i <= to; i++) sum += bins[i]!;
  return sum / ((to - from + 1) * 255);
}
