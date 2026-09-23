import { create } from 'zustand';
import type { MediaItem, PlaybackMode, ProviderId } from '../types/media';

export type PlaybackStatus = 'idle' | 'loading' | 'playing' | 'paused' | 'buffering' | 'error';

export interface PlaybackError {
  code: string;
  message: string;
  provider?: ProviderId;
  recoverable: boolean;
}

/**
 * Global playback session state (ARCH §6). Written only by the playback
 * engine (Phase 3); the UI reads it through selectors. Volume, mute, shuffle
 * and repeat are user settings and live in the settings store.
 */
export interface PlaybackState {
  currentItem: MediaItem | null;
  status: PlaybackStatus;
  mode: PlaybackMode | null;
  isLive: boolean;
  canSeek: boolean;
  error: PlaybackError | null;
}

export const usePlayback = create<PlaybackState>(() => ({
  currentItem: null,
  status: 'idle',
  mode: null,
  isLive: false,
  canSeek: false,
  error: null,
}));
