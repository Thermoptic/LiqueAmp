import { beforeEach, describe, expect, it } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { resetDbForTests } from '../storage/db';
import { kv } from '../storage/repository';
import { useSettings } from '../../stores/settingsStore';
import { INITIAL_PLAYBACK, usePlayback } from '../../stores/playbackStore';
import { DEFAULT_SETTINGS } from '../../types/settings';
import { AudioAnalysis } from './analysis';
import { applyPreset, effectiveGains, EQ_PRESETS, setBand } from './eq';
import { bandEnergy, binForFrequency, computePeak, computeRms } from './features';
import { eqStatus } from '../../components/audio/EqControls';

describe('features', () => {
  it('RMS and peak of known signals', () => {
    expect(computeRms(new Float32Array(1024))).toBe(0);
    expect(computeRms(new Float32Array(1024).fill(0.5))).toBeCloseTo(0.5, 5);
    const sine = Float32Array.from({ length: 4800 }, (_, i) => Math.sin((2 * Math.PI * i) / 48));
    expect(computeRms(sine)).toBeCloseTo(Math.SQRT1_2, 2);
    expect(computePeak(Float32Array.from([0.1, -0.9, 0.3]))).toBeCloseTo(0.9, 5);
  });

  it('maps frequencies to FFT bins', () => {
    expect(binForFrequency(0, 1024, 48000)).toBe(0);
    expect(binForFrequency(24000, 1024, 48000)).toBe(1023);
    expect(binForFrequency(12000, 1024, 48000)).toBe(512);
  });

  it('measures band energy only inside the band', () => {
    const bins = new Uint8Array(1024);
    // energy only in the bass range (≈ bins 1–5 at 48 kHz)
    for (let i = binForFrequency(20, 1024, 48000); i <= binForFrequency(250, 1024, 48000); i++) bins[i] = 255;
    expect(bandEnergy(bins, 48000, 20, 250)).toBeCloseTo(1, 5);
    expect(bandEnergy(bins, 48000, 4000, 16000)).toBe(0);
  });
});

describe('EQ', () => {
  const eq = DEFAULT_SETTINGS.eq;

  it('applies presets and becomes custom when a band leaves every preset', () => {
    const bass = applyPreset(eq, 'bass');
    expect([bass.preset, bass.bass, bass.mid, bass.treble]).toEqual(['bass', 6, 0, 0]);
    expect(setBand(bass, 'mid', 3).preset).toBe('custom');
    expect(setBand(setBand(bass, 'bass', 0), 'mid', 0).preset).toBe('flat');
    expect(applyPreset(eq, 'nope')).toBe(eq);
    expect(new Set(EQ_PRESETS.map((p) => p.id)).size).toBe(EQ_PRESETS.length);
  });

  it('switching the EQ off applies zero gain without losing the settings', () => {
    const off = { ...applyPreset(eq, 'loudness'), enabled: false };
    expect(effectiveGains(off)).toEqual({ bass: 0, mid: 0, treble: 0 });
    expect(off.bass).toBe(5);
  });

  it('says honestly whether the EQ affects the current source (ARCH §32)', () => {
    expect(eqStatus('available', true)[0]).toBe('DSP ACTIVE');
    expect(eqStatus('cors-blocked', true)[0]).toMatch(/NOT APPLIED/);
    expect(eqStatus('provider-restricted', true)[0]).toMatch(/PROVIDER/);
    expect(eqStatus('available', false)[0]).toBe('EQ OFF');
  });

  it('stored EQ values are validated and clamped', async () => {
    await resetDbForTests();
    globalThis.indexedDB = new IDBFactory();
    await kv.set('settings', { eq: { enabled: 'yes', bass: 40, mid: -3.6, treble: 'x', preset: 7 } });
    await useSettings.getState().hydrate();
    expect(useSettings.getState().eq).toEqual({ enabled: true, preset: 'custom', bass: 12, mid: -4, treble: 0 });
  });
});

describe('AudioAnalysis', () => {
  function fakeAnalyser(fill: number) {
    return {
      fftSize: 256,
      frequencyBinCount: 128,
      context: { sampleRate: 48000 },
      getByteFrequencyData(a: Uint8Array) {
        a.fill(fill);
      },
      getFloatTimeDomainData(a: Float32Array) {
        a.fill(fill / 255);
      },
    } as unknown as AnalyserNode;
  }

  beforeEach(() => usePlayback.setState({ ...INITIAL_PLAYBACK, status: 'playing', isLive: true }));

  it('returns null — never generated data — when there is no readable audio', () => {
    expect(new AudioAnalysis(() => null).read()).toBeNull();
  });

  it('reads normalized features and reuses its buffers between frames', () => {
    const analyser = fakeAnalyser(255);
    const a = new AudioAnalysis(() => analyser);
    const first = a.read(1)!;
    const buffers = [first.frequency, first.waveform];
    expect(first.bass).toBeCloseTo(1, 5);
    expect(first.rms).toBeCloseTo(1, 5);
    expect(first.isPlaying).toBe(true);
    expect(first.isLive).toBe(true);
    const second = a.read(2)!;
    expect(second).toBe(first);
    expect([second.frequency, second.waveform]).toEqual(buffers);
    expect(second.frequency).toBe(buffers[0]);
  });
});
