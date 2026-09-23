// Normalized domain model. See LIQUEAMP_IMPLEMENTATION_PLAN.md §3 for how
// conflicts between ARCHITECTURE and PROVIDERS were resolved.

export type ProviderId =
  | 'direct'
  | 'radio'
  | 'youtube'
  | 'youtube-music'
  | 'spotify'
  | 'soundcloud';

/** How an item is stored/classified (PROVIDERS §7, MASTER §15). */
export type PlaybackType = 'direct' | 'radio' | 'embed' | 'external';

/** How the engine can actually play an item right now (PROVIDERS §33). */
export type PlaybackMode = 'native-audio' | 'embedded' | 'external' | 'unsupported';

export interface MediaItem {
  id: string;
  provider: ProviderId;

  title: string;
  artist?: string;
  album?: string;

  artwork?: string | null;

  /** Original URL as entered/imported. Never discarded (PROVIDERS §8). */
  sourceUrl: string;

  playbackType: PlaybackType;

  streamUrl?: string | null;

  /** Seconds. null = live / unknown length. */
  duration?: number | null;

  description?: string;

  categoryId?: string | null;

  tags?: string[];

  enabled?: boolean;

  /** Provider-specific data lives here, not in the common fields. */
  metadata?: Record<string, unknown>;

  createdAt: string;
  updatedAt: string;
}

export interface RadioStation {
  id: string;
  name: string;
  streamUrl: string;
  homepage?: string;
  favicon?: string;
  artwork?: string;
  genre: string[];
  country?: string;
  countryCode?: string;
  language?: string;
  codec?: string;
  /** kbps as declared by the directory; not measured. */
  bitrate?: number;
  /** Only set when a source provides a real live listener count. */
  listeners?: number;
  tags: string[];
  description?: string;
  online?: boolean;
  lastChecked?: string;
}

export interface Category {
  id: string;
  name: string;
  description?: string;
  icon?: string;
  color?: string;
  sortOrder: number;
  enabled: boolean;
}

export interface PlaylistItem {
  mediaId: string;
  addedAt: string;
}

export interface Playlist {
  id: string;
  name: string;
  description?: string;
  artwork?: string;
  items: PlaylistItem[];
  createdAt: string;
  updatedAt: string;
}

export type FavoriteType = 'media' | 'station' | 'playlist';

export interface Favorite {
  /** `${type}:${refId}` so an entity can only be favorited once. */
  id: string;
  type: FavoriteType;
  refId: string;
  addedAt: string;
}

export interface HistoryEntry {
  id: string;
  mediaId: string;
  startedAt: string;
  endedAt?: string;
  /** Seconds actually played. */
  durationPlayed: number;
  completionPercentage?: number;
}
