import type { RenderConfig, Visualizer, VisualizerCapabilities, VisualizerFrame } from './types';

export const OSCILLOSCOPE_CAPS: VisualizerCapabilities = { smoothing: false, mirror: false, scale: false, peakHold: false, glow: true };

/**
 * Oscilloscope (VIS §25): the actual time-domain samples across the width.
 * A rising zero-crossing trigger keeps periodic signals steady instead of
 * sliding, and the centerline never moves. No smoothing — it would stop
 * being the real waveform.
 */
export class Oscilloscope implements Visualizer {
  readonly id = 'oscilloscope' as const;
  readonly name = 'Oscilloscope';
  readonly capabilities = OSCILLOSCOPE_CAPS;

  private ctx: CanvasRenderingContext2D | null = null;
  private width = 0;
  private height = 0;

  initialize(ctx: CanvasRenderingContext2D) {
    this.ctx = ctx;
  }

  resize(width: number, height: number) {
    this.width = width;
    this.height = height;
  }

  render(frame: VisualizerFrame, config: RenderConfig) {
    const ctx = this.ctx;
    if (!ctx || this.width <= 0 || this.height <= 0) return;
    const { width: w, height: h } = this;
    const data = frame.waveform;
    const span = Math.floor(data.length / 2);
    const start = triggerIndex(data, span);
    const mid = h / 2;
    const amp = h / 2 - 2;
    const p = config.palette;

    ctx.clearRect(0, 0, w, h);
    ctx.globalAlpha = config.alpha;
    ctx.fillStyle = p.dim;
    ctx.fillRect(0, Math.round(mid), w, 1);

    ctx.beginPath();
    // at most ~one point per CSS pixel: more would not be visible
    const step = Math.max(1, span / w);
    for (let x = 0; x <= w; x++) {
      const i = start + Math.min(span - 1, Math.floor(x * step));
      const v = Math.max(-1, Math.min(1, data[i]! * config.amplitudeGain));
      const y = mid - v * amp;
      if (x === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.strokeStyle = p.acrossFrequency ? p.secondary : p.primary;
    ctx.lineWidth = 1.5;
    ctx.lineJoin = 'round';
    if (config.glow > 0) {
      ctx.shadowColor = p.glow;
      ctx.shadowBlur = config.glow * 0.6; // avoid excessive glow (VIS §25)
    }
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.globalAlpha = 1;
  }

  destroy() {
    this.ctx = null;
  }
}

/** First rising zero crossing within the first half, so a window of `span` samples fits. */
export function triggerIndex(data: Float32Array, span: number): number {
  const limit = Math.min(data.length - span, span);
  for (let i = 1; i <= limit; i++) if (data[i - 1]! < 0 && data[i]! >= 0) return i;
  return 0;
}
