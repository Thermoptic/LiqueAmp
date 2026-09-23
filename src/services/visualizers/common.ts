// Shared, allocation-free helpers for visualizers (VIS §73).
import type { FrequencyScale } from '../../types/visualizer';

export const MIN_HZ = 30;
export const MAX_HZ = 16000;

/**
 * FFT bin boundaries for `count` display bands (VIS §16, §33). Band i covers
 * bins [edges[i], edges[i+1]). Log spacing is the default because it is
 * musically useful; every band gets at least one bin, so low bands never
 * share (and duplicate) the same bin.
 */
export function bandEdges(count: number, binCount: number, sampleRate: number, scale: FrequencyScale, out?: Uint16Array): Uint16Array {
  const edges = out && out.length === count + 1 ? out : new Uint16Array(count + 1);
  const nyquist = sampleRate / 2;
  const maxHz = Math.min(MAX_HZ, nyquist);
  const toBin = (hz: number) => Math.round((hz / nyquist) * binCount);
  for (let i = 0; i <= count; i++) {
    const t = i / count;
    const hz = scale === 'log' ? MIN_HZ * Math.pow(maxHz / MIN_HZ, t) : MIN_HZ + (maxHz - MIN_HZ) * t;
    edges[i] = toBin(hz);
  }
  for (let i = 1; i <= count; i++) if (edges[i]! <= edges[i - 1]!) edges[i] = edges[i - 1]! + 1;
  // If forcing one bin per band pushed past the top, pull the tail back down.
  const limit = binCount;
  for (let i = count; i >= 0; i--) {
    const max = limit - (count - i);
    if (edges[i]! > max) edges[i] = Math.max(0, max);
  }
  return edges;
}

/** Peak of each band, 0…1, from byte frequency data. */
export function bandLevels(bins: Uint8Array, edges: Uint16Array, out: Float32Array): Float32Array {
  for (let i = 0; i < out.length; i++) {
    const from = edges[i]!;
    const to = Math.max(from + 1, edges[i + 1]!);
    let max = 0;
    for (let b = from; b < to && b < bins.length; b++) if (bins[b]! > max) max = bins[b]!;
    out[i] = max / 255;
  }
  return out;
}

/**
 * Sensitivity on dB-scaled values: everything below the floor is silence,
 * the rest is stretched to 0…1. Changes display response only (VIS §31).
 */
export function applyFloor(v: number, floor: number): number {
  return v <= floor ? 0 : Math.min(1, (v - floor) / (1 - floor));
}

/** Instant attack, frame-rate independent release (VIS §32, §75). */
export function smooth(prev: number, next: number, release: number, dtFrames: number): number {
  if (next >= prev) return next;
  const r = Math.pow(release, dtFrames);
  return next + (prev - next) * r;
}

/** Peak hold markers that hang briefly, then fall (VIS §77). */
export class PeakHold {
  values: Float32Array;
  private held: Float32Array;

  constructor(size: number, private holdMs = 600, private fallPerSecond = 0.8) {
    this.values = new Float32Array(size);
    this.held = new Float32Array(size);
  }

  update(i: number, level: number, dtMs: number): number {
    if (level >= this.values[i]!) {
      this.values[i] = level;
      this.held[i] = this.holdMs;
    } else if (this.held[i]! > 0) {
      this.held[i] = this.held[i]! - dtMs;
    } else {
      this.values[i] = Math.max(level, this.values[i]! - (this.fallPerSecond * dtMs) / 1000);
    }
    return this.values[i]!;
  }
}

/** Milliseconds since the previous frame, clamped so a stalled tab doesn't jump. */
export function frameDelta(prev: number, now: number): number {
  if (!prev) return 16.7;
  return Math.min(250, Math.max(1, now - prev));
}

/** Vertical (height) or horizontal (frequency) fill between two theme colors. */
export function makeFill(ctx: CanvasRenderingContext2D, width: number, height: number, from: string, to: string, horizontal: boolean): CanvasGradient | string {
  if (from === to) return from;
  const g = horizontal ? ctx.createLinearGradient(0, 0, width, 0) : ctx.createLinearGradient(0, height, 0, 0);
  g.addColorStop(0, from);
  g.addColorStop(1, to);
  return g;
}
