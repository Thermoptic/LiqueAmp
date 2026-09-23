import { applyFloor, bandEdges, bandLevels, frameDelta, PeakHold, smooth } from './common';
import type { RenderConfig, Visualizer, VisualizerCapabilities, VisualizerFrame } from './types';

const BAR = 3;
const GAP = 2;
const MAX_BARS = 160;

export const SPECTRUM_BARS_CAPS: VisualizerCapabilities = { smoothing: true, mirror: true, scale: true, peakHold: true, glow: true };

/**
 * Dense, technical frequency bars (VIS §17). Mirror mode puts the bass in
 * the middle and spreads treble to both edges, like the reference design.
 */
export class SpectrumBars implements Visualizer {
  readonly id = 'spectrum-bars' as const;
  readonly name = 'Spectrum Bars';
  readonly capabilities = SPECTRUM_BARS_CAPS;

  private ctx: CanvasRenderingContext2D | null = null;
  private width = 0;
  private height = 0;
  private bands = 0;
  private edges: Uint16Array = new Uint16Array(0);
  private raw = new Float32Array(0);
  private levels = new Float32Array(0);
  private peaks = new PeakHold(0);
  private edgesKey = '';
  private fill: CanvasGradient | string = '';
  private fillKey = '';
  private last = 0;

  initialize(ctx: CanvasRenderingContext2D) {
    this.ctx = ctx;
  }

  resize(width: number, height: number) {
    this.width = width;
    this.height = height;
    this.fillKey = '';
  }

  private layout(mirror: boolean) {
    const slots = Math.max(8, Math.min(MAX_BARS, Math.floor((this.width + GAP) / (BAR + GAP))));
    const bands = mirror ? Math.ceil(slots / 2) : slots;
    if (bands !== this.bands) {
      this.bands = bands;
      this.raw = new Float32Array(bands);
      this.levels = new Float32Array(bands);
      this.peaks = new PeakHold(bands);
      this.edgesKey = '';
    }
    return slots;
  }

  render(frame: VisualizerFrame, config: RenderConfig) {
    const ctx = this.ctx;
    if (!ctx || this.width <= 0 || this.height <= 0) return;
    const { width: w, height: h } = this;
    const dt = frameDelta(this.last, frame.timestamp);
    this.last = frame.timestamp;

    const slots = this.layout(config.mirror);
    const key = `${this.bands}:${frame.frequency.length}:${frame.sampleRate}:${config.scale}`;
    if (key !== this.edgesKey) {
      this.edges = bandEdges(this.bands, frame.frequency.length, frame.sampleRate, config.scale, this.edges);
      this.edgesKey = key;
    }
    bandLevels(frame.frequency, this.edges, this.raw);

    const p = config.palette;
    const fillKey = `${p.primary}|${p.secondary}|${p.acrossFrequency}|${config.mirror}|${w}|${h}`;
    if (fillKey !== this.fillKey) {
      this.fill = this.makeFill(ctx, config);
      this.fillKey = fillKey;
    }

    const totalW = slots * BAR + (slots - 1) * GAP;
    const x0 = Math.floor((w - totalW) / 2);
    const dtFrames = dt / 16.7;

    ctx.clearRect(0, 0, w, h);
    ctx.globalAlpha = config.alpha;

    // baseline
    ctx.fillStyle = p.dim;
    ctx.fillRect(x0, h - 1, totalW, 1);

    for (let band = 0; band < this.bands; band++) {
      this.levels[band] = smooth(this.levels[band]!, applyFloor(this.raw[band]!, config.spectrumFloor), config.release, dtFrames);
      this.peaks.update(band, this.levels[band]!, dt);
    }

    ctx.beginPath();
    for (let s = 0; s < slots; s++) {
      const bh = Math.round(this.levels[this.bandForSlot(s, slots, config.mirror)]! * (h - 2));
      if (bh > 0) ctx.rect(x0 + s * (BAR + GAP), h - 1 - bh, BAR, bh);
    }
    ctx.fillStyle = this.fill;
    if (config.glow > 0) {
      ctx.shadowColor = p.glow;
      ctx.shadowBlur = config.glow;
    }
    ctx.fill();
    ctx.shadowBlur = 0;

    if (config.peakHold) {
      ctx.fillStyle = p.secondary;
      for (let s = 0; s < slots; s++) {
        const peak = this.peaks.values[this.bandForSlot(s, slots, config.mirror)]!;
        if (peak > 0.02) ctx.fillRect(x0 + s * (BAR + GAP), h - 2 - Math.round(peak * (h - 2)), BAR, 1);
      }
    }
    ctx.globalAlpha = 1;
  }

  /** Slot → band. Mirrored: centre slots are band 0 (bass). */
  private bandForSlot(s: number, slots: number, mirror: boolean): number {
    if (!mirror) return s;
    const center = (slots - 1) / 2;
    return Math.min(this.bands - 1, Math.floor(Math.abs(s - center)));
  }

  private makeFill(ctx: CanvasRenderingContext2D, config: RenderConfig): CanvasGradient | string {
    const p = config.palette;
    if (p.primary === p.secondary) return p.primary;
    if (!p.acrossFrequency) {
      const g = ctx.createLinearGradient(0, this.height, 0, 0);
      g.addColorStop(0, p.primary);
      g.addColorStop(0.55, p.primary);
      g.addColorStop(1, p.secondary);
      return g;
    }
    const g = ctx.createLinearGradient(0, 0, this.width, 0);
    if (config.mirror) {
      g.addColorStop(0, p.secondary);
      g.addColorStop(0.5, p.primary);
      g.addColorStop(1, p.secondary);
    } else {
      g.addColorStop(0, p.primary);
      g.addColorStop(1, p.secondary);
    }
    return g;
  }

  destroy() {
    this.ctx = null;
    this.raw = this.levels = new Float32Array(0);
    this.bands = 0;
  }
}
