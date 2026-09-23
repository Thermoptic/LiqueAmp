import { applyFloor, frameDelta, PeakHold, smooth } from './common';
import type { RenderConfig, Visualizer, VisualizerCapabilities, VisualizerFrame } from './types';

const SEG_W = 5;
const SEG_GAP = 2;
const LABEL_W = 56;
const ROWS = ['bass', 'mid', 'treble'] as const;

export const MINIMAL_METER_CAPS: VisualizerCapabilities = { smoothing: true, mirror: false, scale: false, peakHold: true, glow: false };

/**
 * BASS / MID / TREBLE segment meters (VIS §24) — very little visual
 * information, for dense layouts and mobile. No glow by design (VIS §37).
 */
export class MinimalMeter implements Visualizer {
  readonly id = 'minimal-meter' as const;
  readonly name = 'Minimal Meter';
  readonly capabilities = MINIMAL_METER_CAPS;
  // dual color mode: bass/mid → primary, treble → secondary (VIS §80)

  private ctx: CanvasRenderingContext2D | null = null;
  private width = 0;
  private height = 0;
  private levels = new Float32Array(ROWS.length);
  private peaks = new PeakHold(ROWS.length, 800, 0.5);
  private last = 0;
  private font = '';

  initialize(ctx: CanvasRenderingContext2D) {
    this.ctx = ctx;
    const family = getComputedStyle(ctx.canvas).getPropertyValue('--la-font-mono').trim() || 'monospace';
    this.font = `10px ${family}`;
  }

  resize(width: number, height: number) {
    this.width = width;
    this.height = height;
  }

  render(frame: VisualizerFrame, config: RenderConfig) {
    const ctx = this.ctx;
    if (!ctx || this.width <= 0 || this.height <= 0) return;
    const dt = frameDelta(this.last, frame.timestamp);
    this.last = frame.timestamp;

    const p = config.palette;
    const rowH = Math.min(18, Math.floor(this.height / ROWS.length));
    const barH = Math.max(3, Math.min(10, rowH - 6));
    const y0 = Math.floor((this.height - rowH * ROWS.length) / 2);
    const labelW = this.width >= 220 ? LABEL_W : 0;
    const segs = Math.max(4, Math.floor((this.width - labelW + SEG_GAP) / (SEG_W + SEG_GAP)));

    ctx.clearRect(0, 0, this.width, this.height);
    ctx.globalAlpha = config.alpha;
    ctx.font = this.font;
    ctx.textBaseline = 'middle';

    ROWS.forEach((band, i) => {
      const level = (this.levels[i] = smooth(this.levels[i]!, applyFloor(frame[band], config.spectrumFloor), config.release, dt / 16.7));
      const peak = this.peaks.update(i, level, dt);
      const cy = y0 + i * rowH + rowH / 2;
      if (labelW) {
        ctx.fillStyle = p.text;
        ctx.fillText(band.toUpperCase(), 0, cy);
      }
      const on = Math.round(level * segs);
      const peakSeg = config.peakHold ? Math.min(segs - 1, Math.round(peak * segs) - 1) : -1;
      for (let s = 0; s < segs; s++) {
        const x = labelW + s * (SEG_W + SEG_GAP);
        ctx.fillStyle = s < on ? (p.acrossFrequency && band === 'treble' ? p.secondary : p.primary) : s === peakSeg ? p.secondary : p.dim;
        ctx.fillRect(x, Math.round(cy - barH / 2), SEG_W, barH);
      }
    });
    ctx.globalAlpha = 1;
  }

  destroy() {
    this.ctx = null;
  }
}

