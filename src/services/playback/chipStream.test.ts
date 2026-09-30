// ChipStream: audio rendered in the page, scheduled into Web Audio. A fake
// AudioContext (time moved by hand) and a synthetic tone stand in for the
// browser and the emulator.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ChipStream, type ChipRenderer, type ChipStreamEvents } from './chipStream';

const RATE = 8000;

/** A tone of `freq` Hz that stops at `silentAt` seconds; seekable, with snapshots. */
function tone(silentAt = Infinity, freq = 220): ChipRenderer & { pos: number; skipped: number; restored: number } {
  const r = {
    sampleRate: RATE,
    pos: 0,
    skipped: 0,
    restored: 0,
    sample(i: number) {
      return i / RATE < silentAt ? 0.5 * Math.sin((2 * Math.PI * freq * i) / RATE) : 0;
    },
    restart() {
      r.pos = 0;
    },
    render(out: Float32Array) {
      for (let i = 0; i < out.length; i++) out[i] = r.sample(r.pos + i);
      r.pos += out.length;
    },
    skip(n: number) {
      r.pos += n;
      r.skipped += n;
    },
    snapshot: () => r.pos,
    restore(state: unknown) {
      r.pos = state as number;
      r.restored++;
    },
    fork: (): ChipRenderer => tone(silentAt, freq),
    level: () => r.sample(r.pos),
  };
  return r;
}

function fakeContext() {
  const started: { at: number; length: number; stopped: boolean }[] = [];
  const gains: number[] = [];
  const ctx = {
    currentTime: 0,
    createGain: () => ({ connect() {}, disconnect() {}, gain: { setTargetAtTime: (v: number) => gains.push(v) } }),
    createBuffer: (_c: number, length: number) => ({ length, copyToChannel() {} }),
    createBufferSource() {
      const rec = { at: 0, length: 0, stopped: false };
      return {
        buffer: null as { length: number } | null,
        onended: null,
        connect() {},
        disconnect() {},
        start(at: number) {
          rec.at = at;
          rec.length = this.buffer!.length;
          started.push(rec);
        },
        stop() {
          rec.stopped = true;
        },
      };
    },
  };
  return { ctx, started, gains };
}

function events() {
  const log: string[] = [];
  const e: ChipStreamEvents & { log: string[]; clock: number; duration: number } = {
    log,
    clock: 0,
    duration: 0,
    onStatus: (s) => log.push(s),
    onClock: (t, d) => {
      e.clock = t;
      e.duration = d;
    },
    onDuration: (d) => log.push(`duration ${d.toFixed(2)}`),
    onEnded: () => log.push('ended'),
  };
  return e;
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

/** Moves the audio clock and the page's timers together. */
async function advance(ctx: { currentTime: number }, seconds: number) {
  for (let t = 0; t < seconds; t += 0.04) {
    ctx.currentTime += 0.04;
    await vi.advanceTimersByTimeAsync(40);
  }
}

describe('ChipStream', () => {
  it('plays: schedules blocks back to back a little ahead, and reports the position', async () => {
    const { ctx, started } = fakeContext();
    const e = events();
    const s = new ChipStream(ctx as never, {} as AudioNode, tone(), 60, e);
    s.play();
    expect(e.log).toEqual(['playing']);
    await advance(ctx, 2);
    // contiguous: each block starts where the previous one ends
    for (let i = 1; i < started.length; i++) expect(started[i]!.at).toBeCloseTo(started[i - 1]!.at + started[i - 1]!.length / RATE, 9);
    expect(started.at(-1)!.at - ctx.currentTime).toBeLessThan(1); // rendered ahead, not the whole tune
    expect(s.position).toBeGreaterThan(1.8);
    expect(s.position).toBeLessThan(2.1);
    s.dispose();
  });

  it('pause keeps the position and the unheard audio; resume continues exactly there', async () => {
    const { ctx, started } = fakeContext();
    const e = events();
    const r = tone();
    const s = new ChipStream(ctx as never, {} as AudioNode, r, 60, e);
    s.play();
    await advance(ctx, 1);
    s.pause();
    const at = s.position;
    const renderedAhead = r.pos / RATE;
    expect(renderedAhead).toBeGreaterThan(at);
    // the blocks not yet heard are stopped (they are kept to play on resume)
    expect(started.filter((b) => b.at + b.length / RATE > ctx.currentTime).every((b) => b.stopped)).toBe(true);
    await advance(ctx, 3);
    expect(s.position).toBe(at);
    s.play();
    await advance(ctx, 1);
    expect(s.position).toBeGreaterThan(at + 0.9);
    expect(s.position).toBeLessThan(at + 1.1);
    expect(e.log).toEqual(['playing', 'paused', 'playing']);
    s.dispose();
  });

  it('seeks from the nearest snapshot (the scan keeps one every 10 s) and keeps playing', async () => {
    const { ctx } = fakeContext();
    const e = events();
    const r = tone();
    const s = new ChipStream(ctx as never, {} as AudioNode, r, 120, e);
    s.play();
    await advance(ctx, 3); // the background scan covers the tune meanwhile
    s.seek(95);
    expect(e.clock).toBe(95); // the bar shows the target at once
    await vi.advanceTimersByTimeAsync(50);
    expect(r.restored).toBe(1);
    expect(r.skipped).toBeLessThanOrEqual(10 * RATE + 1); // at most 10 s replayed
    expect(e.log.slice(-3)).toEqual(['paused', 'buffering', 'playing']);
    await advance(ctx, 1);
    expect(s.position).toBeGreaterThan(95.8);
    s.dispose();
  });

  it('fades out at the end of the play length and ends', async () => {
    const { ctx } = fakeContext();
    const e = events();
    const s = new ChipStream(ctx as never, {} as AudioNode, tone(), 8, e);
    s.play();
    await advance(ctx, 10);
    expect(e.log).toContain('ended');
    expect(s.position).toBe(8);
    s.dispose();
  });

  it('a tune that falls silent ends there: the scan finds it early and shortens the duration', async () => {
    const { ctx } = fakeContext();
    const e = events();
    const s = new ChipStream(ctx as never, {} as AudioNode, tone(20), 150, e);
    s.play();
    await advance(ctx, 1); // long before the silence is heard
    expect(e.log).toContain('duration 20.50');
    expect(s.duration).toBeCloseTo(20.5, 1);
    s.dispose();
  });

  it('a held tone is not mistaken for silence', async () => {
    const { ctx } = fakeContext();
    const e = events();
    // 100 Hz: a multiple of the 10 ms probe rate if the probes were even
    const s = new ChipStream(ctx as never, {} as AudioNode, tone(Infinity, 100), 60, e);
    s.play();
    await advance(ctx, 3);
    expect(e.log.some((l) => l.startsWith('duration'))).toBe(false);
    s.dispose();
  });

  it('applies volume and mute to its own gain', () => {
    const { ctx, gains } = fakeContext();
    const s = new ChipStream(ctx as never, {} as AudioNode, tone(), 60, events());
    s.setVolume(0.3, false);
    s.setVolume(0.3, true);
    expect(gains).toEqual([0.3, 0]);
    s.dispose();
  });
});
