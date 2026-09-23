import { usePlayback } from '../../stores/playbackStore';
import { BANDS, bandEnergy, computePeak, computeRms } from './features';

/** Normalized analysis frame (VIS §6). Present only when real audio exists. */
export interface AnalysisFrame {
  timestamp: number;
  /** Byte frequency data, 0…255 per bin (reused buffer — do not keep a reference). */
  frequency: Uint8Array;
  /** Time-domain samples, −1…1 (reused buffer). */
  waveform: Float32Array;
  rms: number;
  peak: number;
  bass: number;
  mid: number;
  treble: number;
  sampleRate: number;
  isPlaying: boolean;
  isLive: boolean;
}

export const DEFAULT_FFT_SIZE = 2048;
export const DEFAULT_SMOOTHING = 0.7;

/**
 * Reads real analysis data from the playback engine's AnalyserNode on demand
 * (visualizers call read() once per animation frame). Buffers and the frame
 * object are allocated once per analyser and reused (VIS §73); nothing here
 * touches React state. Returns null when there is no readable audio — there
 * is never a generated substitute (VIS §103).
 */
export class AudioAnalysis {
  private analyser: AnalyserNode | null = null;
  private frame: AnalysisFrame | null = null;

  constructor(private readonly source: () => AnalyserNode | null) {}

  read(now = performance.now()): AnalysisFrame | null {
    const analyser = this.source();
    if (!analyser) return null;
    if (analyser !== this.analyser || !this.frame || this.frame.frequency.length !== analyser.frequencyBinCount) {
      this.analyser = analyser;
      this.frame = {
        timestamp: now,
        frequency: new Uint8Array(analyser.frequencyBinCount),
        waveform: new Float32Array(analyser.fftSize),
        rms: 0,
        peak: 0,
        bass: 0,
        mid: 0,
        treble: 0,
        sampleRate: analyser.context.sampleRate,
        isPlaying: false,
        isLive: false,
      };
    }
    const f = this.frame;
    analyser.getByteFrequencyData(f.frequency as Uint8Array<ArrayBuffer>);
    analyser.getFloatTimeDomainData(f.waveform as Float32Array<ArrayBuffer>);
    const playback = usePlayback.getState();
    f.timestamp = now;
    f.rms = computeRms(f.waveform);
    f.peak = computePeak(f.waveform);
    f.bass = bandEnergy(f.frequency, f.sampleRate, BANDS.bass[0], BANDS.bass[1]);
    f.mid = bandEnergy(f.frequency, f.sampleRate, BANDS.mid[0], BANDS.mid[1]);
    f.treble = bandEnergy(f.frequency, f.sampleRate, BANDS.treble[0], BANDS.treble[1]);
    f.isPlaying = playback.status === 'playing';
    f.isLive = playback.isLive;
    return f;
  }
}
