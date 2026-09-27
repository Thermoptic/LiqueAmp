// URL import pipeline (PROVIDERS §10, MASTER §18):
// URL → normalize → detect provider → validate → resolve → preview → import.
// Nothing is saved here; the preview is committed by the caller.

import { mediaIdentity } from '../../stores/libraryStore';
import type { MediaItem, Playlist, ProviderId } from '../../types/media';
import { detectSource, InvalidUrlError, type Detection } from '../providers/detect';
import { resolveDirect, type DirectFormat } from '../providers/direct';
import { ProviderError } from '../providers/errors';
import { resolveProvider, resolveYouTubePlaylist, type PlaylistIdReader } from '../providers/oembed';

export type ImportStep = 'detecting' | 'resolving' | 'playlist';

export interface PreviewEntry {
  item: MediaItem;
  /** Already in the library (same id or same source); not selected by default. */
  duplicateOf?: MediaItem;
}

export type ImportKind = DirectFormat | 'provider' | 'youtube-playlist';

/** What a YouTube playlist resolved to; its available videos are the preview's entries, in order. */
export interface PlaylistPreview {
  listId: string;
  url: string;
  /** YouTube's title, or a fallback when YouTube did not give one (titleMissing). */
  title: string;
  titleMissing: boolean;
  /** Videos YouTube listed, available or not. */
  total: number;
  unavailable: { videoId: string; url: string; reason: string }[];
  /** A playlist already imported from the same YouTube list. */
  existing?: { id: string; name: string };
}

export type ImportPreview =
  | { status: 'ready'; detection: Detection; kind: ImportKind; entries: PreviewEntry[]; notes: string[]; playlist?: PlaylistPreview }
  | { status: 'error'; title: string; message: string };

export interface ImportOptions {
  library: MediaItem[];
  onStep?(step: ImportStep): void;
  fetchImpl?: typeof fetch;
  /** Providers switched off in /control are refused before any network request. */
  isProviderEnabled?(provider: ProviderId): boolean;
  /** Reads a YouTube playlist's video ids (the IFrame Player API, shown by the caller). */
  readPlaylistIds?: PlaylistIdReader;
  /** Existing playlists, to recognise a YouTube playlist imported before. */
  playlists?: readonly Playlist[];
}

const PLAYLIST_TITLE_FALLBACK = 'YouTube playlist';

/** Builds an import preview for a pasted URL. Never throws. */
export async function previewImport(
  input: string,
  { library, onStep, fetchImpl, isProviderEnabled, readPlaylistIds, playlists = [] }: ImportOptions,
): Promise<ImportPreview> {
  onStep?.('detecting');
  let detection: Detection;
  try {
    detection = detectSource(input);
  } catch (err) {
    return { status: 'error', title: 'INVALID URL', message: err instanceof InvalidUrlError ? err.message : String(err) };
  }
  if (detection.kind === 'unsupported') {
    return { status: 'error', title: 'UNSUPPORTED SOURCE', message: detection.reason ?? 'This address cannot be played in a browser.' };
  }
  if (detection.provider && isProviderEnabled?.(detection.provider) === false) {
    return { status: 'error', title: 'PROVIDER DISABLED', message: 'This provider is disabled in /control › Providers. Enable it there to import from it.' };
  }
  onStep?.('resolving');
  const byId = new Map(library.map((m) => [m.id, m]));
  const byIdentity = new Map(library.map((m) => [mediaIdentity(m), m]));
  const withDuplicates = (items: MediaItem[]): PreviewEntry[] =>
    items.map((item) => ({ item, duplicateOf: byId.get(item.id) ?? byIdentity.get(mediaIdentity(item)) }));
  try {
    // A YouTube link with list= is a playlist, also when it names a video in it.
    if (detection.listId && (detection.provider === 'youtube' || detection.provider === 'youtube-music') && readPlaylistIds) {
      onStep?.('playlist');
      const resolved = await resolveYouTubePlaylist(detection, readPlaylistIds, fetchImpl);
      if (resolved.videos.length === 0) {
        return {
          status: 'error',
          title: 'EMPTY PLAYLIST',
          message: 'YouTube listed no videos for this playlist. It may be empty, private, or a list YouTube does not share with embedded players.',
        };
      }
      const available = resolved.videos.flatMap((v) => ('item' in v ? [v.item] : []));
      const unavailable = resolved.videos.flatMap((v) => ('unavailable' in v ? [{ videoId: v.videoId, url: v.url, reason: v.unavailable }] : []));
      const existing = playlists.find((p) => p.source?.listId === resolved.listId);
      return {
        status: 'ready',
        detection: { ...detection, normalizedUrl: resolved.url, providerItemId: `${detection.provider}:playlist:${resolved.listId}` },
        kind: 'youtube-playlist',
        entries: withDuplicates(available),
        notes: [], // the dialog shows the available/unavailable counts itself
        playlist: {
          listId: resolved.listId,
          url: resolved.url,
          title: resolved.title ?? PLAYLIST_TITLE_FALLBACK,
          titleMissing: !resolved.title,
          total: resolved.videos.length,
          unavailable,
          ...(existing ? { existing: { id: existing.id, name: existing.name } } : {}),
        },
      };
    }
    if (detection.provider !== 'direct') {
      const item = await resolveProvider(detection, fetchImpl);
      const notes =
        item.playbackType === 'external'
          ? ['This link opens on the provider itself; LIQUEAMP keeps it in the library with its metadata.']
          : [];
      return { status: 'ready', detection, kind: 'provider', entries: withDuplicates([item]), notes };
    }
    const result = await resolveDirect(detection.normalizedUrl, fetchImpl);
    return { status: 'ready', detection: result.detection, kind: result.kind, entries: withDuplicates(result.items), notes: result.notes };
  } catch (err) {
    if (err instanceof ProviderError) return { status: 'error', title: err.title, message: err.message };
    return { status: 'error', title: 'IMPORT FAILED', message: String(err) };
  }
}

export interface ImportEdits {
  /** Only applied to a single item; callers pass it only for single-item imports. */
  title?: string;
  artist?: string;
  categoryId?: string | null;
}

/** Applies preview edits to the selected items before they are saved. */
export function applyEdits(items: MediaItem[], edits: ImportEdits): MediaItem[] {
  const single = items.length === 1;
  return items.map((item) => ({
    ...item,
    title: single && edits.title?.trim() ? edits.title.trim() : item.title,
    artist: single ? edits.artist?.trim() || item.artist : item.artist,
    categoryId: edits.categoryId ?? item.categoryId ?? null,
  }));
}
