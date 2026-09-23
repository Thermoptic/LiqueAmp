import type { AnalysisAvailability, AudioEngineState, PlaybackError, StreamInfo } from '../../stores/playbackStore';
import type { StreamFormat } from '../providers/direct';

export type BackendStatus = 'loading' | 'playing' | 'paused' | 'buffering';

export interface BackendMeta {
  /** Infinity for live streams, NaN when unknown. */
  duration: number;
  isLive: boolean;
  canSeek: boolean;
}

export interface BackendListener {
  onStatus(status: BackendStatus): void;
  onEnded(): void;
  onError(error: PlaybackError): void;
  onMeta(meta: BackendMeta): void;
  onClock(currentTime: number, duration: number, bufferedAhead: number): void;
  onAnalysis(analysis: AnalysisAvailability, engine: AudioEngineState): void;
  /** Real technical metadata when the source exposes it; null clears it. */
  onStreamInfo(info: StreamInfo | null): void;
}

/**
 * A playback mechanism the engine can drive. Phase 3 has one implementation
 * (native <audio>); embedded provider players will implement the same
 * contract. Backends never own queue or session state.
 */
export interface AudioBackend {
  setListener(listener: BackendListener): void;
  /** Called synchronously inside user gestures, before any await. */
  prime(): void;
  /** Prepares a source. Rejects with PlaybackFailure for known problems. */
  load(url: string, format: StreamFormat): Promise<void>;
  play(): Promise<void>;
  pause(): void;
  /** Stops and releases the current source. */
  stop(): void;
  seek(seconds: number): void;
  setVolume(volume: number, muted: boolean): void;
  readonly currentTime: number;
  /** False when the player does not let LIQUEAMP change volume (default true). */
  readonly volumeControl?: boolean;
  /** Native audio only: EQ gains in dB, applied when the source is routed through Web Audio. */
  setEq?(gains: { bass: number; mid: number; treble: number }): void;
  /** Native audio only: the analyser, while real samples are readable. */
  getAnalyser?(): AnalyserNode | null;
}
