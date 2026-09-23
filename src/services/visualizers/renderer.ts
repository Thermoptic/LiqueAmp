import type { AnalysisFrame } from '../analysis/analysis';
import type { VisualizerColorMode, VisualizerId, VisualizerSettings } from '../../types/visualizer';
import { visualizerRegistry } from './registry';
import type { Palette, RenderConfig, Visualizer } from './types';

/** VIS §40: never render more than 2 device pixels per CSS pixel. */
export const DPR_CAP = 2;
/** Reduced motion renders at a calm, low rate (VIS §53). */
const REDUCED_MOTION_FPS = 20;
/** After playback stops, keep rendering briefly so levels fall to rest. */
const SETTLE_MS = 1500;

export interface AnalysisSource {
  read(now: number): AnalysisFrame | null;
}

export interface RenderEnvironment {
  reducedMotion: boolean;
  /** Theme glow amount × the user's glow level (0 = no glow anywhere). */
  glowAmount: number;
}

/** Theme CSS variables → canvas colors for a color mode (VIS §35–36). */
export function resolvePalette(el: Element, mode: VisualizerColorMode): Palette {
  const css = getComputedStyle(el);
  const v = (name: string, fallback: string) => css.getPropertyValue(name).trim() || fallback;
  const visualizer = v('--la-visualizer', v('--la-primary', 'currentColor'));
  const base = {
    dim: v('--la-border', visualizer),
    text: v('--la-text-muted', visualizer),
    glow: v('--la-glow', visualizer),
    acrossFrequency: false,
  };
  switch (mode) {
    case 'accent':
      return { ...base, primary: v('--la-accent', visualizer), secondary: v('--la-accent-bright', visualizer) };
    case 'dual':
      return { ...base, primary: visualizer, secondary: v('--la-visualizer-secondary', visualizer), acrossFrequency: true };
    case 'mono': {
      const mono = v('--la-text-secondary', visualizer);
      return { ...base, primary: mono, secondary: v('--la-text', mono), glow: mono };
    }
    default:
      return { ...base, primary: visualizer, secondary: v('--la-visualizer-secondary', visualizer) };
  }
}

/**
 * Maps user settings to render parameters. Sensitivity and intensity only
 * change how real values are displayed, never the values (VIS §30–31).
 */
export function buildRenderConfig(settings: VisualizerSettings, palette: Palette, env: RenderEnvironment, dpr: number): RenderConfig {
  const smoothing = env.reducedMotion ? Math.max(settings.smoothing, 0.6) : settings.smoothing;
  return {
    spectrumFloor: 0.55 - 0.5 * settings.sensitivity,
    amplitudeGain: Math.pow(2, settings.sensitivity * 4 - 1),
    release: 0.95 * smoothing,
    alpha: 0.35 + 0.65 * settings.intensity,
    mirror: settings.mirror,
    scale: settings.scale,
    peakHold: settings.peakHold && !env.reducedMotion,
    // canvas shadowBlur is in device pixels, unaffected by the transform
    glow: settings.glow && !env.reducedMotion ? 6 * env.glowAmount * dpr : 0,
    palette,
  };
}

/**
 * Owns one canvas: sizing (ResizeObserver + capped DPR), the
 * requestAnimationFrame loop and the active visualizer's lifecycle
 * (VIS §41, §45, §48). A visualizer that throws is isolated and reported —
 * playback is never touched from here (VIS §104).
 */
export class VisualizerRenderer {
  private ctx: CanvasRenderingContext2D | null;
  private visualizer: Visualizer | null = null;
  private config: RenderConfig | null = null;
  private observer: ResizeObserver | null = null;
  private frameId = 0;
  private width = 0;
  private height = 0;
  private dpr = 1;
  private active = false;
  private settleUntil = 0;
  private minInterval = 0;
  private lastRender = 0;
  private destroyed = false;
  /** Measured, for diagnostics only (VIS §91–92). */
  stats = { fps: 0, frameMs: 0, frames: 0, windowStart: 0 };

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly source: AnalysisSource,
    private readonly onError: (error: unknown) => void,
  ) {
    this.ctx = canvas.getContext('2d');
    if (!this.ctx) throw new Error('Canvas 2D is not available');
    if (typeof ResizeObserver !== 'undefined') {
      this.observer = new ResizeObserver(() => this.measure());
      this.observer.observe(canvas);
    }
    this.measure();
  }

  get visualizerId(): VisualizerId | null {
    return this.visualizer?.id ?? null;
  }

  get running(): boolean {
    return this.frameId !== 0;
  }

  /** Switches visualizer: old one destroyed first, new one initialized (VIS §48). */
  setVisualizer(id: VisualizerId) {
    if (this.destroyed || this.visualizer?.id === id) return;
    this.visualizer?.destroy();
    this.visualizer = null;
    const def = visualizerRegistry.get(id);
    if (!def || !this.ctx) return;
    this.guard(() => {
      const v = def.create();
      v.initialize(this.ctx!);
      v.resize(this.width, this.height, this.dpr);
      this.visualizer = v;
      this.clear();
    });
  }

  configure(config: RenderConfig, reducedMotion: boolean) {
    this.config = config;
    this.minInterval = reducedMotion ? 1000 / REDUCED_MOTION_FPS : 0;
  }

  get devicePixelRatio() {
    return this.dpr;
  }

  /**
   * Whether real audio is flowing. Going inactive keeps drawing briefly so
   * the meters fall to rest, then the loop stops entirely.
   */
  setActive(active: boolean) {
    if (this.destroyed) return;
    this.active = active;
    if (active) this.start();
    else this.settleUntil = performance.now() + SETTLE_MS;
  }

  private start() {
    if (this.frameId || this.destroyed) return;
    this.stats.frames = 0;
    this.stats.windowStart = 0;
    this.frameId = requestAnimationFrame(this.tick);
  }

  private stop() {
    if (this.frameId) cancelAnimationFrame(this.frameId);
    this.frameId = 0;
  }

  private tick = (now: number) => {
    this.frameId = 0;
    if (this.destroyed) return;
    if (!this.active && now > this.settleUntil) return; // loop ends here
    this.frameId = requestAnimationFrame(this.tick);
    // a few ms of slack so 60 Hz frame jitter doesn't skip an extra frame
    if (this.minInterval && now - this.lastRender < this.minInterval - 4) return;
    this.lastRender = now;
    // hidden container (e.g. another mobile section): nothing to draw
    if (!this.visualizer || !this.config || this.width === 0 || this.height === 0) return;
    const frame = this.source.read(now);
    if (!frame) {
      this.clear();
      return;
    }
    const t0 = performance.now();
    this.guard(() => this.visualizer!.render(frame, this.config!));
    this.measureFrame(now, performance.now() - t0);
  };

  private measureFrame(now: number, cost: number) {
    const s = this.stats;
    s.frames++;
    s.frameMs = cost;
    if (!s.windowStart) s.windowStart = now;
    if (now - s.windowStart >= 1000) {
      s.fps = Math.round((s.frames * 1000) / (now - s.windowStart));
      s.frames = 0;
      s.windowStart = now;
    }
  }

  private measure() {
    const rect = this.canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, DPR_CAP);
    const width = Math.round(rect.width);
    const height = Math.round(rect.height);
    if (width === this.width && height === this.height && dpr === this.dpr) return;
    this.width = width;
    this.height = height;
    this.dpr = dpr;
    this.canvas.width = Math.max(1, Math.round(width * dpr));
    this.canvas.height = Math.max(1, Math.round(height * dpr));
    this.ctx?.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (this.visualizer) this.guard(() => this.visualizer!.resize(width, height, dpr));
  }

  private clear() {
    this.ctx?.clearRect(0, 0, this.width, this.height);
  }

  private guard(fn: () => void) {
    try {
      fn();
    } catch (error) {
      this.stop();
      this.visualizer = null;
      this.clear();
      this.onError(error);
    }
  }

  /** Stops the loop and releases everything (VIS §49, §54). */
  destroy() {
    this.destroyed = true;
    this.stop();
    this.observer?.disconnect();
    this.observer = null;
    this.visualizer?.destroy();
    this.visualizer = null;
    this.clear();
    this.ctx = null;
    // shrink the backing store so the GPU memory is released
    this.canvas.width = 0;
    this.canvas.height = 0;
  }
}
