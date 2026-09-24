// Record validators for backup import (ARCH §28: validate before changing
// anything). Each returns a clean record containing only known fields, or
// null. Addresses are limited to http(s) so an edited backup cannot inject
// javascript: or data: links into the library.
import { PROVIDER_IDS } from '../../types/advanced';
import type { Category, Favorite, FavoriteType, HistoryEntry, MediaItem, PlaybackType, Playlist, PlaylistItem, ProviderId, RadioStation } from '../../types/media';
import type { LiqueAmpTheme } from '../../types/theme';
import { normalizeTheme, validateTheme } from '../themes/theme';

type Obj = Record<string, unknown>;

const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown, max = 2000): string | undefined => (typeof v === 'string' && v.trim() && v.length <= max ? v : undefined);
const optStr = (v: unknown, max = 2000): string | undefined => str(v, max);
const num = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);
const bool = (v: unknown): boolean | undefined => (typeof v === 'boolean' ? v : undefined);
const strList = (v: unknown, max = 50): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && !!x.trim() && x.length <= 100).slice(0, max) : []);

/** http(s) URL or undefined. */
export function httpUrl(v: unknown): string | undefined {
  const s = str(v, 4000);
  if (!s) return undefined;
  try {
    const u = new URL(s);
    return u.protocol === 'http:' || u.protocol === 'https:' ? s : undefined;
  } catch {
    return undefined;
  }
}

const isoDate = (v: unknown): string | undefined => {
  const s = str(v, 40);
  return s && !Number.isNaN(Date.parse(s)) ? s : undefined;
};

const PLAYBACK_TYPES: readonly PlaybackType[] = ['direct', 'radio', 'embed', 'external'];
const FAVORITE_TYPES: readonly FavoriteType[] = ['media', 'station', 'playlist'];

export function validMedia(v: unknown): MediaItem | null {
  if (!isObj(v)) return null;
  const id = str(v.id, 200);
  const title = str(v.title, 500);
  const sourceUrl = httpUrl(v.sourceUrl);
  const provider = PROVIDER_IDS.includes(v.provider as ProviderId) ? (v.provider as ProviderId) : undefined;
  const playbackType = PLAYBACK_TYPES.includes(v.playbackType as PlaybackType) ? (v.playbackType as PlaybackType) : undefined;
  if (!id || !title || !sourceUrl || !provider || !playbackType) return null;
  const now = new Date().toISOString();
  const item: MediaItem = {
    id,
    provider,
    title,
    sourceUrl,
    playbackType,
    createdAt: isoDate(v.createdAt) ?? now,
    updatedAt: isoDate(v.updatedAt) ?? now,
  };
  const artist = optStr(v.artist, 500);
  if (artist) item.artist = artist;
  const album = optStr(v.album, 500);
  if (album) item.album = album;
  const artwork = httpUrl(v.artwork);
  if (artwork) item.artwork = artwork;
  const streamUrl = httpUrl(v.streamUrl);
  if (streamUrl) item.streamUrl = streamUrl;
  const duration = num(v.duration);
  if (duration !== undefined && duration >= 0) item.duration = duration;
  const description = optStr(v.description, 5000);
  if (description) item.description = description;
  const categoryId = optStr(v.categoryId, 200);
  if (categoryId) item.categoryId = categoryId;
  const tags = strList(v.tags, 20);
  if (tags.length) item.tags = tags;
  const enabled = bool(v.enabled);
  if (enabled !== undefined) item.enabled = enabled;
  // Provider metadata is plain JSON from the provider (ids, formats); keep primitives only.
  if (isObj(v.metadata)) {
    const metadata: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(v.metadata)) {
      if (k.length <= 100 && (typeof val === 'string' || typeof val === 'number' || typeof val === 'boolean')) metadata[k] = val;
    }
    if (Object.keys(metadata).length) item.metadata = metadata;
  }
  return item;
}

export function validCategory(v: unknown): Category | null {
  if (!isObj(v)) return null;
  const id = str(v.id, 200);
  const name = str(v.name, 100);
  if (!id || !name) return null;
  const c: Category = { id, name, sortOrder: num(v.sortOrder) ?? 0, enabled: bool(v.enabled) ?? true };
  const description = optStr(v.description, 1000);
  if (description) c.description = description;
  const icon = optStr(v.icon, 100);
  if (icon) c.icon = icon;
  const color = optStr(v.color, 40);
  if (color) c.color = color;
  return c;
}

export function validPlaylist(v: unknown): Playlist | null {
  if (!isObj(v)) return null;
  const id = str(v.id, 200);
  const name = str(v.name, 200);
  if (!id || !name || !Array.isArray(v.items)) return null;
  const now = new Date().toISOString();
  const items: PlaylistItem[] = v.items.flatMap((it) => {
    if (!isObj(it)) return [];
    const mediaId = str(it.mediaId, 200);
    return mediaId ? [{ mediaId, addedAt: isoDate(it.addedAt) ?? now }] : [];
  });
  const p: Playlist = { id, name, items, createdAt: isoDate(v.createdAt) ?? now, updatedAt: isoDate(v.updatedAt) ?? now };
  const description = optStr(v.description, 1000);
  if (description) p.description = description;
  const artwork = httpUrl(v.artwork);
  if (artwork) p.artwork = artwork;
  return p;
}

export function validFavorite(v: unknown): Favorite | null {
  if (!isObj(v)) return null;
  const type = FAVORITE_TYPES.includes(v.type as FavoriteType) ? (v.type as FavoriteType) : undefined;
  const refId = str(v.refId, 200);
  if (!type || !refId) return null;
  // The id is always derived, as in favoritesStore.
  return { id: `${type}:${refId}`, type, refId, addedAt: isoDate(v.addedAt) ?? new Date().toISOString() };
}

export function validStation(v: unknown): RadioStation | null {
  if (!isObj(v)) return null;
  const id = str(v.id, 200);
  const name = str(v.name, 300);
  const streamUrl = httpUrl(v.streamUrl);
  if (!id || !name || !streamUrl) return null;
  const s: RadioStation = { id, name, streamUrl, genre: strList(v.genre), tags: strList(v.tags) };
  const sourceUrl = httpUrl(v.sourceUrl);
  if (sourceUrl) s.sourceUrl = sourceUrl;
  const homepage = httpUrl(v.homepage);
  if (homepage) s.homepage = homepage;
  const favicon = httpUrl(v.favicon);
  if (favicon) s.favicon = favicon;
  const artwork = httpUrl(v.artwork);
  if (artwork) s.artwork = artwork;
  for (const key of ['state', 'country', 'countryCode', 'language', 'codec', 'description', 'lastChecked'] as const) {
    const val = optStr(v[key], 1000);
    if (val) s[key] = val;
  }
  const bitrate = num(v.bitrate);
  if (bitrate !== undefined) s.bitrate = bitrate;
  const hls = bool(v.hls);
  if (hls !== undefined) s.hls = hls;
  const online = bool(v.online);
  if (online !== undefined) s.online = online;
  if (isObj(v.directory) && v.directory.source === 'radio-browser') {
    s.directory = { source: 'radio-browser' };
    for (const key of ['clicks', 'votes', 'clickTrend'] as const) {
      const n = num(v.directory[key]);
      if (n !== undefined) s.directory[key] = n;
    }
  }
  return s;
}

export function validHistory(v: unknown): HistoryEntry | null {
  if (!isObj(v)) return null;
  const id = str(v.id, 200);
  const mediaId = str(v.mediaId, 200);
  const startedAt = isoDate(v.startedAt);
  const durationPlayed = num(v.durationPlayed);
  const item = validMedia(v.item);
  if (!id || !mediaId || !startedAt || durationPlayed === undefined || durationPlayed < 0 || !item) return null;
  const h: HistoryEntry = { id, mediaId, startedAt, durationPlayed, item };
  const endedAt = isoDate(v.endedAt);
  if (endedAt) h.endedAt = endedAt;
  const completion = num(v.completionPercentage);
  if (completion !== undefined) h.completionPercentage = Math.min(100, Math.max(0, completion));
  return h;
}

const THEME_FORMATS = ['base16', 'base24', 'tinted8', 'liqueamp'] as const;

/** Custom themes only; built-in themes ship with the app and are never imported. */
export function validTheme(v: unknown): LiqueAmpTheme | null {
  if (!isObj(v) || !isObj(v.colors) || v.source === 'builtin') return null;
  const id = str(v.id, 200);
  const name = str(v.name, 100);
  if (!id || !name) return null;
  const stringRecord = (r: unknown, max = 64) =>
    isObj(r) ? Object.fromEntries(Object.entries(r).filter(([k, val]) => k.length <= 40 && typeof val === 'string' && val.length <= 40).slice(0, max)) : undefined;
  const theme = normalizeTheme({
    id,
    name,
    version: num(v.version) ?? 1,
    source: v.source === 'imported' ? 'imported' : 'user',
    colors: v.colors as unknown as LiqueAmpTheme['colors'],
    effects: (isObj(v.effects) ? v.effects : undefined) as unknown as LiqueAmpTheme['effects'],
    palette: stringRecord(v.palette) as LiqueAmpTheme['palette'],
    mapping: stringRecord(v.mapping) as LiqueAmpTheme['mapping'],
    format: THEME_FORMATS.find((f) => f === v.format),
    author: optStr(v.author, 200),
    variant: v.variant === 'light' || v.variant === 'dark' ? v.variant : undefined,
    createdAt: isoDate(v.createdAt),
    updatedAt: isoDate(v.updatedAt),
  });
  // drop undefined optionals so stored records stay clean
  for (const key of Object.keys(theme) as Array<keyof LiqueAmpTheme>) if (theme[key] === undefined) delete theme[key];
  return validateTheme(theme).some((i) => i.level === 'error') ? null : theme;
}
