// Retro music sources behind the Retro panel. The panel only talks to this
// interface; each system gets its own adapter (NES/NSF, C64/HVSC,
// Mega Drive/VGM, …). No source is connected yet: the music, its online
// sources and the in-browser decoders are added in a later step.

import type { MediaItem } from '../../types/media';

/** One playable retro tune, or a music file with several subtunes (see `subtuneCount`). */
export interface RetroTrack {
  /** Stable id within its source (a subtune of a file has its own id). */
  id: string;
  systemId: string;
  /** Tune title (for a whole file: the game or file title). */
  title: string;
  game?: string;
  composer?: string;
  /** NSF, SID, VGM, … */
  format: string;
  /** 1-based subtune number when this is one tune of a multi-tune file. */
  subtune?: number;
  /** For a whole file: how many subtunes it has; more than one opens the file's tune list. */
  subtuneCount?: number;
  /** Seconds, when the source knows it. */
  duration?: number;
  artwork?: string;
}

export interface RetroSearchOptions {
  signal?: AbortSignal;
  limit?: number;
}

/** What a system's source provides. Playback goes through LIQUEAMP's normal player via `toMediaItem`. */
export interface RetroSource {
  id: string;
  /** Shown in the panel footer, e.g. the archive's name. */
  name: string;
  search(query: string, options?: RetroSearchOptions): Promise<RetroTrack[]>;
  /** The subtunes of a multi-tune file, in order. */
  getTracks(file: RetroTrack, options?: RetroSearchOptions): Promise<RetroTrack[]>;
  getTrack(id: string, options?: RetroSearchOptions): Promise<RetroTrack | null>;
  /** The track as a LIQUEAMP media item: queue, favourites and playlists treat it like any other source. */
  toMediaItem(track: RetroTrack): MediaItem;
}

const registry = new Map<string, RetroSource>();

/** Connects a source to a system (none are registered yet). Returns an unregister function. */
export function registerRetroSource(systemId: string, source: RetroSource): () => void {
  registry.set(systemId, source);
  return () => {
    if (registry.get(systemId) === source) registry.delete(systemId);
  };
}

export function retroSourceFor(systemId: string): RetroSource | undefined {
  return registry.get(systemId);
}
