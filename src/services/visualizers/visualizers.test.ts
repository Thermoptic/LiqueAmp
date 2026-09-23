import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_VISUALIZER, sanitizeVisualizer, VISUALIZER_IDS } from '../../types/visualizer';
import type { AnalysisFrame } from '../analysis/analysis';
import { applyFloor, bandEdges, bandLevels, PeakHold, smooth } from './common';
import { triggerIndex } from './oscilloscope';
import { visualizerRegistry } from './registry';
import { buildRenderConfig, VisualizerRenderer, type AnalysisSource } from './renderer';
import type { Palette, RenderConfig } from './types';

const PALETTE: Palette = { primary: '#f00', secondary: '#ff0', dim: '#333', text: '#999', glow: '#f00', acrossFrequency: false };
const CONFIG: RenderConfig = buildRenderConfig(DEFAULT_VISUALIZER, PALETTE, { reducedMotion: false, glowAmount: 0.6 }, 1);

/** A 2D context that records which drawing calls were made. */
function fakeContext() {
  const calls: string[] = [];
  const target: Record<string | symbol, unknown> = { canvas: document.createElement('canvas') };
  const ctx = new Proxy(target, {
    get(t, key) {
      if (key === 'calls') return calls;
      if (key in t) return t[key];
      return (..._args: unknown[]) => {
        calls.push(String(key));
        return { addColorStop() {} };
      };
    },
    set(t, key, value) {
      t[key] = value;
      return true;
    },
  });
  return ctx as unknown as CanvasRenderingContext2D & { calls: string[] };
}

function frame(level: number, timestamp = 16): AnalysisFrame {
  const frequency = new Uint8Array(1024).fill(Math.round(level * 255));
  const waveform = Float32Array.from({ length: 2048 }, (_, i) => level * Math.sin((2 * Math.PI * i) / 64));
  return { timestamp, frequency, waveform, rms: level, peak: level, bass: level, mid: level, treble: level, sampleRate: 48000, isPlaying: true, isLive: false };
}

describe('frequency bands', () => {
  it('log edges are strictly increasing and stay inside the FFT', () => {
    for (const count of [8, 64, 160]) {
      const edges = bandEdges(count, 1024, 48000, 'log');
      expect(edges).toHaveLength(count + 1);
      for (let i = 1; i < edges.length; i++) expect(edges[i]).toBeGreaterThan(edges[i - 1]!);
      expect(edges[count]).toBeLessThanOrEqual(1024);
    }
  });

  it('log spacing gives the low end more bands than linear', () => {
    const log = bandEdges(32, 1024, 48000, 'log');
    const linear = bandEdges(32, 1024, 48000, 'linear');
    // the middle band starts far lower on a log scale
    expect(log[16]).toBeLessThan(linear[16]!);
  });

  it('band level is the loudest bin in the band', () => {
    const bins = new Uint8Array(16);
    bins[5] = 255;
    bins[6] = 51;
    const edges = Uint16Array.from([0, 4, 8, 16]);
    expect(Array.from(bandLevels(bins, edges, new Float32Array(3)))).toEqual([0, 1, 0]);
  });
});

describe('display response', () => {
  it('the floor maps quiet to zero and stretches the rest', () => {
    expect(applyFloor(0.2, 0.3)).toBe(0);
    expect(applyFloor(1, 0.3)).toBe(1);
    expect(applyFloor(0.65, 0.3)).toBeCloseTo(0.5, 5);
  });

  it('smoothing attacks instantly and releases independent of frame rate', () => {
    expect(smooth(0.2, 0.9, 0.9, 1)).toBe(0.9);
    const oneFrame = smooth(1, 0, 0.8, 1);
    const twoHalfFrames = smooth(smooth(1, 0, 0.8, 0.5), 0, 0.8, 0.5);
    expect(twoHalfFrames).toBeCloseTo(oneFrame, 6);
    expect(smooth(1, 0, 0, 1)).toBe(0);
  });

  it('peak hold hangs, then falls toward the level', () => {
    const p = new PeakHold(1, 500, 1);
    p.update(0, 0.8, 16);
    expect(p.update(0, 0.1, 400)).toBeCloseTo(0.8, 5); // still holding
    p.update(0, 0.1, 200); // hold used up
    expect(p.update(0, 0.1, 250)).toBeCloseTo(0.55, 5); // 1/s × 0.25 s
    expect(p.update(0, 0.1, 5000)).toBeCloseTo(0.1, 5); // never below the level
  });

  it('sensitivity lowers the floor and raises gain; intensity sets opacity', () => {
    const low = buildRenderConfig({ ...DEFAULT_VISUALIZER, sensitivity: 0, intensity: 0 }, PALETTE, { reducedMotion: false, glowAmount: 1 }, 1);
    const high = buildRenderConfig({ ...DEFAULT_VISUALIZER, sensitivity: 1, intensity: 1 }, PALETTE, { reducedMotion: false, glowAmount: 1 }, 1);
    expect(high.spectrumFloor).toBeLessThan(low.spectrumFloor);
    expect(high.amplitudeGain).toBeGreaterThan(low.amplitudeGain);
    expect(low.alpha).toBeCloseTo(0.35, 5);
    expect(high.alpha).toBe(1);
  });

  it('reduced motion turns off glow and peak hold and softens movement (VIS §53)', () => {
    const cfg = buildRenderConfig({ ...DEFAULT_VISUALIZER, smoothing: 0 }, PALETTE, { reducedMotion: true, glowAmount: 1 }, 2);
    expect(cfg.glow).toBe(0);
    expect(cfg.peakHold).toBe(false);
    expect(cfg.release).toBeGreaterThan(0.5);
  });

  it('glow follows the theme/user glow amount and device pixels', () => {
    expect(buildRenderConfig(DEFAULT_VISUALIZER, PALETTE, { reducedMotion: false, glowAmount: 0 }, 2).glow).toBe(0);
    expect(buildRenderConfig(DEFAULT_VISUALIZER, PALETTE, { reducedMotion: false, glowAmount: 0.5 }, 2).glow).toBeCloseTo(6, 5);
  });
});

describe('oscilloscope trigger', () => {
  it('starts at the first rising zero crossing', () => {
    const data = Float32Array.from([0.5, 0.2, -0.3, -0.1, 0.4, 0.6, -0.2, 0.1]);
    expect(triggerIndex(data, 4)).toBe(4);
    expect(triggerIndex(new Float32Array(8).fill(0.3), 4)).toBe(0);
  });
});

describe('settings', () => {
  it('stored visualizer settings are validated', () => {
    expect(sanitizeVisualizer({ type: 'nope' as never, intensity: 4, colorMode: 'rainbow' as never, glow: 'x' as never, scale: 'linear' })).toEqual({
      ...DEFAULT_VISUALIZER,
      intensity: 1,
      scale: 'linear',
    });
  });
});

describe('visualizers', () => {
  it('the registry has every visualizer in the initial set (VIS §98)', () => {
    expect(visualizerRegistry.getAll().map((d) => d.id)).toEqual([...VISUALIZER_IDS]);
    for (const def of visualizerRegistry.getAll()) expect(def.create().id).toBe(def.id);
  });

  it.each(VISUALIZER_IDS)('%s draws real signal and nothing invented for silence', (id) => {
    const make = () => {
      const ctx = fakeContext();
      const v = visualizerRegistry.get(id)!.create();
      v.initialize(ctx);
      v.resize(300, 60, 1);
      return { ctx, v };
    };
    const loud = make();
    for (let t = 16; t < 400; t += 16) loud.v.render(frame(0.9, t), CONFIG);
    expect(loud.ctx.calls.filter((c) => c === 'rect' || c === 'fillRect' || c === 'lineTo').length).toBeGreaterThan(0);

    if (id === 'oscilloscope' || id === 'minimal-meter') return; // a flat line / unlit segments are the true picture of silence
    const quiet = make();
    for (let t = 16; t < 400; t += 16) quiet.v.render(frame(0, t), CONFIG);
    // only baseline/unlit-cell drawing — no bars/columns
    expect(quiet.ctx.calls.filter((c) => c === 'rect')).toEqual([]);
  });
});

describe('VisualizerRenderer', () => {
  let queue: FrameRequestCallback[];
  let now: number;

  function fakeCanvas() {
    const ctx = fakeContext();
    const canvas = {
      width: 0,
      height: 0,
      getContext: () => ctx,
      getBoundingClientRect: () => ({ width: 200, height: 50 }),
    } as unknown as HTMLCanvasElement;
    return { canvas, ctx };
  }

  function runFrame(ms = 16) {
    now += ms;
    const callbacks = queue;
    queue = [];
    for (const cb of callbacks) cb(now);
  }

  beforeEach(() => {
    queue = [];
    now = 0;
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => queue.push(cb));
    vi.stubGlobal('cancelAnimationFrame', () => (queue = []));
    vi.spyOn(performance, 'now').mockImplementation(() => now);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('draws only real frames, sizes with a capped DPR and stops after playback stops', () => {
    vi.stubGlobal('devicePixelRatio', 3);
    const { canvas } = fakeCanvas();
    let current: AnalysisFrame | null = null;
    const source: AnalysisSource = { read: () => current };
    const r = new VisualizerRenderer(canvas, source, () => undefined);
    expect([canvas.width, canvas.height]).toEqual([400, 100]); // DPR capped at 2
    r.setVisualizer('spectrum-bars');
    r.configure(CONFIG, false);

    r.setActive(true);
    expect(r.running).toBe(true);
    runFrame(); // no audio yet → nothing rendered
    expect(r.stats.frameMs).toBe(0);
    current = frame(0.8, now);
    runFrame();
    expect(r.running).toBe(true);

    r.setActive(false);
    runFrame(1000);
    expect(r.running).toBe(true); // falling to rest
    runFrame(1000);
    expect(r.running).toBe(false); // loop fully stopped
    r.destroy();
  });

  it('switching visualizers destroys the old one first', () => {
    const { canvas } = fakeCanvas();
    const r = new VisualizerRenderer(canvas, { read: () => null }, () => undefined);
    r.setVisualizer('spectrum-bars');
    expect(r.visualizerId).toBe('spectrum-bars');
    r.setVisualizer('oscilloscope');
    expect(r.visualizerId).toBe('oscilloscope');
    r.destroy();
    expect(r.visualizerId).toBeNull();
    expect(canvas.width).toBe(0);
  });

  it('a visualizer that throws is isolated and reported, and the loop stops', () => {
    const { canvas } = fakeCanvas();
    const onError = vi.fn();
    const r = new VisualizerRenderer(canvas, { read: () => ({ ...frame(0.5, now), frequency: null as never }) }, onError);
    r.setVisualizer('spectrum-bars');
    r.configure(CONFIG, false);
    r.setActive(true);
    runFrame();
    expect(onError).toHaveBeenCalledOnce();
    expect(r.running).toBe(false);
    expect(r.visualizerId).toBeNull();
  });

  it('reduced motion limits the render rate', () => {
    const { canvas } = fakeCanvas();
    let reads = 0;
    const r = new VisualizerRenderer(canvas, { read: () => (reads++, frame(0.5, now)) }, () => undefined);
    r.setVisualizer('minimal-meter');
    r.configure(CONFIG, true);
    r.setActive(true);
    for (let i = 0; i < 60; i++) runFrame(1000 / 60);
    expect(reads).toBeGreaterThanOrEqual(19);
    expect(reads).toBeLessThanOrEqual(21);
    r.destroy();
  });
});
