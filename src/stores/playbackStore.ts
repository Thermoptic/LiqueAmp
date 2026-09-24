import { create } from 'zustand';
import type { MediaItem, PlaybackMode, ProviderId } from '../types/media';

export type PlaybackStatus = 'idle' | 'loading' | 'playing' | 'paused' | 'buffering' | 'error';

export type PlaybackErrorCode =
  | 'STREAM_UNAVAILABLE'
  | 'NETWORK_ERROR'
  | 'MEDIA_FORMAT_NOT_SUPPORTED'
  | 'PLAYBACK_BLOCKED'
  | 'MIXED_CONTENT'
  | 'PROVIDER_NOT_SUPPORTED'
  | 'INVALID_SOURCE'
  | 'PLAYLIST_UNREADABLE'
  | 'EMBED_BLOCKED'
  | 'PROVIDER_DISABLED'
  | 'MEDIA_DISABLED';

export interface PlaybackError {
  code: PlaybackErrorCode;
  /** Short uppercase headline, e.g. STREAM UNAVAILABLE. */
  title: string;
  message: string;
  provider?: ProviderId;
  recoverable: boolean;
}

/**
 * Whether real audio analysis (Web Audio) is possible for the current source.
 * - available: routed through the Web Audio graph
 * - cors-blocked: playing, but the server does not allow browser access to samples
 * - unsupported: Web Audio is not available in this browser
 * - provider-restricted: an official provider player plays it; no raw audio exists for the page
 * - inactive: nothing native is playing
 */
export type AnalysisAvailability = 'inactive' | 'available' | 'cors-blocked' | 'unsupported' | 'provider-restricted';

export type AudioEngineState = 'not-started' | 'running' | 'suspended' | 'unavailable';

/**
 * Technical stream metadata. Every field comes from the source itself
 * (HTTP response headers or the HLS manifest), never from guessing by file
 * extension. Fields are absent when the browser could not read them.
 */
export interface StreamInfo {
  /** e.g. MP3, AAC, OGG, HLS. */
  codec?: string;
  /** Declared bitrate in kbps. */
  bitrateKbps?: number;
  contentType?: string;
  /** Icecast/Shoutcast `icy-name`, only if the server exposes it to the browser. */
  stationName?: string;
  genre?: string;
  source: 'http-headers' | 'hls-manifest';
}

/**
 * Global playback session state (ARCH §6). Written only by the playback
 * engine; the UI reads it through selectors. Volume, mute, shuffle and repeat
 * are user settings and live in the settings store.
 */
export interface PlaybackState {
  currentItem: MediaItem | null;
  status: PlaybackStatus;
  mode: PlaybackMode | null;
  isLive: boolean;
  canSeek: boolean;
  error: PlaybackError | null;
  analysis: AnalysisAvailability;
  audioEngine: AudioEngineState;
  streamInfo: StreamInfo | null;
  /** The URL actually playing (may be a playlist mirror, not the item's own URL). */
  activeUrl: string | null;
  /** Increments on every load, so observers can tell replays of one item apart. */
  loadId: number;
  /** False when the current provider player does not let LIQUEAMP set volume (PROVIDERS §50). */
  canSetVolume: boolean;
}

export const INITIAL_PLAYBACK: PlaybackState = {
  currentItem: null,
  status: 'idle',
  mode: null,
  isLive: false,
  canSeek: false,
  error: null,
  analysis: 'inactive',
  audioEngine: 'not-started',
  streamInfo: null,
  activeUrl: null,
  loadId: 0,
  canSetVolume: true,
};

export const usePlayback = create<PlaybackState>(() => ({ ...INITIAL_PLAYBACK }));

/**
 * High-frequency position data, kept in its own store so that only the
 * components that show time re-render (~4×/s from `timeupdate`), not the
 * whole dashboard (ARCH §41).
 */
export interface PlaybackClock {
  currentTime: number;
  /** Seconds; Infinity for live streams, NaN when unknown. */
  duration: number;
  /** Seconds buffered ahead of the playhead, measured from the media element. */
  bufferedAhead: number;
}

export const usePlaybackClock = create<PlaybackClock>(() => ({ currentTime: 0, duration: Number.NaN, bufferedAhead: 0 }));
