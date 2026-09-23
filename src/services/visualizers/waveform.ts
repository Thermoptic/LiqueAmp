import { computePeak } from '../analysis/features';
import { frameDelta } from './common';
import type { RenderConfig, Visualizer, VisualizerCapabilities, VisualizerFrame } from './types';

const COL = 2;
const GAP = 1;
/** One column per this many ms of audio → a few seconds of history. */
const STEP_MS = 40;

export const WAVEFORM_CAPS: VisualizerCapabilities = { smoothing: false, mirror: false, scale: false, peakHold: false, glow: true };

/**
 * Scrolling amplitude waveform (VIS §14): the peak of the real time-domain
 * signal over each 40 ms step, drawn around a centerline, newest on the
 * right. Nothing is interpolated or invented between measured steps.
 */
export class Waveform implements Visualizer {
  readonly id = 'waveform' as const;
  readonly name = 'Waveform';
  readonly capabilities = WAVEFORM_CAPS;

  private ctx: CanvasRenderingContext2D | null = null;
  private width = 0;
  private height = 0;
  /** Measured peaks, oldest first; the newest is always the last element. */
  private history = new Float32Array(0);
  private stepPeak = 0;
  private stepElapsed = 0;
  private last = 0;

  initialize(ctx: CanvasRenderingContext2D) {
    this.ctx = ctx;
  }

  resize(width: number, height: number) {
    this.width = width;
    this.height = height;
    const cols = Math.max(1, Math.floor((width + GAP) / (COL + GAP)));
    if (cols !== this.history.length) {
      // keep the newest columns when the size changes
      const next = new Float32Array(cols);
      const keep = Math.min(cols, this.history.length);
      next.set(this.history.subarray(this.history.length - keep), cols - keep);
      this.history = next;
    }
  }

  render(frame: VisualizerFrame, config: RenderConfig) {
    const ctx = this.ctx;
    const n = this.history.length;
    if (!ctx || !n || this.width <= 0 || this.height <= 0) return;
    const dt = frameDelta(this.last, frame.timestamp);
    this.last = frame.timestamp;

    this.stepPeak = Math.max(this.stepPeak, Math.min(1, computePeak(frame.waveform) * config.amplitudeGain));
    this.stepElapsed += dt;
    while (this.stepElapsed >= STEP_MS) {
      this.history.copyWithin(0, 1);
      this.history[n - 1] = this.stepPeak;
      this.stepElapsed -= STEP_MS;
      this.stepElapsed = Math.min(this.stepElapsed, STEP_MS * 4);
      this.stepPeak = 0;
    }

    const { width: w, height: h } = this;
    const mid = Math.round(h / 2);
    const p = config.palette;
    ctx.clearRect(0, 0, w, h);
    ctx.globalAlpha = config.alpha;
    ctx.fillStyle = p.dim;
    ctx.fillRect(0, mid, w, 1);

    const x0 = w - n * (COL + GAP) + GAP;
    ctx.beginPath();
    for (let i = 0; i < n; i++) {
      const v = this.history[i]!;
      const half = Math.round(v * (h / 2 - 1));
      if (half > 0) ctx.rect(x0 + i * (COL + GAP), mid - half, COL, half * 2 + 1);
    }
    if (p.acrossFrequency && p.primary !== p.secondary) {
      // dual: older history fades toward the secondary color
      const g = ctx.createLinearGradient(0, 0, w, 0);
      g.addColorStop(0, p.secondary);
      g.addColorStop(1, p.primary);
      ctx.fillStyle = g;
    } else {
      ctx.fillStyle = p.primary;
    }
    if (config.glow > 0) {
      ctx.shadowColor = p.glow;
      ctx.shadowBlur = config.glow;
    }
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.globalAlpha = 1;
  }

  destroy() {
    this.ctx = null;
    this.history = new Float32Array(0);
  }
}
