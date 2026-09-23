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

export interface RadioDirectoryInfo {
  source: 'radio-browser';
  /** Directory-wide play clicks. Not listeners; never shown as such. */
  clicks?: number;
  votes?: number;
  /** Clicks in the last 24 h compared with the day before, as reported. */
  clickTrend?: number;
}

export interface RadioStation {
  id: string;
  name: string;
  /** The directly playable stream (e.g. Radio Browser `url_resolved`). */
  streamUrl: string;
  /** The URL as registered, which may be a .pls/.m3u (kept for re-resolving). */
  sourceUrl?: string;
  hls?: boolean;
  state?: string;
  directory?: RadioDirectoryInfo;
  homepage?: string;
  favicon?: string;
  artwork?: string;
  genre: string[];
  country?: string;
  countryCode?: string;
  language?: string;
  /** As declared by the directory; not measured. */
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
  /** Seconds actually listened (wall-clock time while playing). */
  durationPlayed: number;
  /** Only for items with a known, finite duration. */
  completionPercentage?: number;
  /**
   * Snapshot of what was played, so history can show and replay items that
   * are not in the library (radio stations, resolved URLs). Extension of
   * ARCH §21; see LIQUEAMP_IMPLEMENTATION_PLAN.md §3.
   */
  item: MediaItem;
}
