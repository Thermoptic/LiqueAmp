// Direct stream provider (PROVIDERS §11–14): single audio files, Icecast/
// Shoutcast-style streams, HLS manifests and M3U/PLS playlist files.

import { createId, nowIso } from '../../lib/id';
import { titleFromUrl } from '../../lib/format';
import type { MediaItem } from '../../types/media';
import { detectSource, type Detection } from './detect';
import { ProviderError } from './errors';
import { parsePlaylist, PlaylistParseError, sniffPlaylist, type PlaylistEntry, type PlaylistFormat } from './playlists';

export type StreamFormat = 'audio' | 'hls';

/** One URL the engine may try; several exist when a playlist lists mirrors. */
export interface PlaybackCandidate {
  url: string;
  format: StreamFormat;
}

/** How the item was classified at import; drives resolution at playback time. */
export type DirectFormat = 'audio' | 'stream' | 'hls' | 'playlist';

const MAX_PLAYLIST_BYTES = 512 * 1024;
const MAX_CANDIDATES = 10;

function formatOfUrl(url: string): StreamFormat {
  try {
    return /\.m3u8$/i.test(new URL(url).pathname) ? 'hls' : 'audio';
  } catch {
    return 'audio';
  }
}

/**
 * Reads a playlist file. Needs CORS: most radio sites do not send it, so the
 * error tells the user what to do instead of failing silently.
 */
export async function fetchPlaylistText(url: string, fetchImpl: typeof fetch = fetch): Promise<{ text: string; contentType: string }> {
  let res: Response;
  try {
    res = await fetchImpl(url, { mode: 'cors', credentials: 'omit', cache: 'no-store', referrerPolicy: 'no-referrer' });
  } catch {
    if (typeof navigator !== 'undefined' && !navigator.onLine) throw new ProviderError('NETWORK_ERROR', 'You are offline.');
    throw new ProviderError(
      'CORS_ERROR',
      'The browser is not allowed to read this playlist file (the server does not send CORS headers), or the server is unreachable. Open the file and paste one of the stream URLs inside it instead.',
    );
  }
  if (res.status === 404) throw new ProviderError('NOT_FOUND', 'The server answered 404: the playlist file does not exist.');
  if (!res.ok) throw new ProviderError('NETWORK_ERROR', `The server refused the playlist request (HTTP ${res.status}).`);
  const contentType = res.headers.get('content-type') ?? '';
  // Some ".pls"/".m3u" URLs actually serve the audio stream itself.
  if (/^audio\//i.test(contentType) && !/mpegurl|scpls/i.test(contentType)) {
    void res.body?.cancel();
    return { text: '', contentType };
  }
  const reader = res.body?.getReader();
  if (!reader) return { text: await res.text(), contentType };
  const decoder = new TextDecoder();
  let text = '';
  let bytes = 0;
  while (bytes < MAX_PLAYLIST_BYTES) {
    const { done, value } = await reader.read();
    if (done) break;
    bytes += value.byteLength;
    text += decoder.decode(value, { stream: true });
  }
  void reader.cancel();
  return { text, contentType };
}

function baseItem(url: string, format: DirectFormat, extra: Partial<MediaItem> = {}): MediaItem {
  const now = nowIso();
  return {
    id: createId('media'),
    provider: 'direct',
    title: titleFromUrl(url),
    sourceUrl: url,
    streamUrl: url,
    playbackType: 'direct',
    createdAt: now,
    updatedAt: now,
    ...extra,
    metadata: { format, ...extra.metadata },
  };
}

function itemFromEntry(entry: PlaylistEntry, playlistUrl: string): MediaItem {
  return baseItem(entry.url, formatOfUrl(entry.url) === 'hls' ? 'hls' : entry.duration === null ? 'stream' : 'audio', {
    title: entry.title || titleFromUrl(entry.url),
    duration: entry.duration,
    playbackType: entry.duration === null ? 'radio' : 'direct',
    metadata: { playlistUrl },
  });
}

export interface DirectResolution {
  detection: Detection;
  /** What the URL turned out to be after inspection. */
  kind: DirectFormat;
  items: MediaItem[];
  /** Human-readable notes about limits of the inspection (never errors). */
  notes: string[];
}

/**
 * Resolves a direct-stream URL into normalized MediaItems (PROVIDERS §10).
 * Single streams are not fetched here — whether they play is only known at
 * playback time (CORS, codecs). Playlists are fetched and expanded.
 */
export async function resolveDirect(input: string, fetchImpl: typeof fetch = fetch): Promise<DirectResolution> {
  const detection = detectSource(input);
  if (detection.provider !== 'direct') {
    throw new ProviderError('UNSUPPORTED', detection.reason ?? 'This URL belongs to another provider.');
  }
  const url = detection.normalizedUrl;
  const notes: string[] = detection.reason ? [detection.reason] : [];

  if (detection.kind === 'audio' || detection.kind === 'stream') {
    return { detection, kind: detection.kind, items: [baseItem(url, detection.kind)], notes };
  }

  if (detection.kind === 'hls') {
    // .m3u8 may be an HLS stream or a UTF-8 M3U list; inspect when allowed.
    try {
      const { text } = await fetchPlaylistText(url, fetchImpl);
      if (text && sniffPlaylist(text) === 'm3u') return expand(detection, text, notes);
    } catch (err) {
      if (err instanceof ProviderError && err.code === 'NOT_FOUND') throw err;
      notes.push('The manifest could not be inspected (no CORS). It will be played as an HLS stream.');
    }
    return { detection, kind: 'hls', items: [baseItem(url, 'hls')], notes };
  }

  const { text, contentType } = await fetchPlaylistText(url, fetchImpl);
  if (!text) {
    notes.push(`The server returned audio (${contentType}) instead of a playlist file; it is played as a stream.`);
    return { detection, kind: 'stream', items: [baseItem(url, 'stream')], notes };
  }
  return expand(detection, text, notes);
}

/**
 * A station's playlist file usually lists mirrors of one live stream. Treat
 * it as one item so the engine can fall back between mirrors, instead of
 * expanding it into separate queue entries.
 */
export function isMirrorList(format: PlaylistFormat, entries: PlaylistEntry[]): boolean {
  if (entries.length === 0 || entries.some((e) => e.duration !== null)) return false;
  if (format === 'pls') return true;
  const titles = new Set(entries.map((e) => e.title?.trim().toLowerCase()).filter(Boolean));
  return titles.size <= 1;
}

function expand(detection: Detection, text: string, notes: string[]): DirectResolution {
  const url = detection.normalizedUrl;
  try {
    const parsed = parsePlaylist(text, url);
    if (parsed.format === 'hls') return { detection, kind: 'hls', items: [baseItem(url, 'hls')], notes };
    if (isMirrorList(parsed.format, parsed.entries)) {
      const titled = parsed.entries.find((e) => e.title)?.title;
      const station = baseItem(url, 'playlist', {
        title: titled ?? titleFromUrl(url),
        playbackType: 'radio',
        duration: null,
        metadata: { mirrors: parsed.entries.length },
      });
      if (parsed.entries.length > 1) notes.push(`Live station with ${parsed.entries.length} stream mirrors; if one fails the next is tried.`);
      return { detection, kind: 'playlist', items: [station], notes };
    }
    return { detection, kind: 'playlist', items: parsed.entries.map((e) => itemFromEntry(e, url)), notes };
  } catch (err) {
    if (err instanceof PlaylistParseError) throw new ProviderError('UNSUPPORTED', err.message);
    throw err;
  }
}

/**
 * Turns an item into URLs the engine can try, in order. A playlist-file item
 * (e.g. a station's .pls) resolves to its entries, which are treated as
 * mirrors: if one fails, the next is tried (PROVIDERS §13).
 */
export async function planDirectPlayback(item: MediaItem, fetchImpl: typeof fetch = fetch): Promise<PlaybackCandidate[]> {
  const url = item.streamUrl || item.sourceUrl;
  const declared = item.metadata?.format as DirectFormat | undefined;
  let format: DirectFormat = declared ?? 'stream';
  if (!declared) {
    const kind = detectSource(url).kind;
    if (kind === 'hls' || kind === 'playlist' || kind === 'audio') format = kind;
  }
  if (format === 'hls') return [{ url, format: 'hls' }];
  if (format !== 'playlist') return [{ url, format: 'audio' }];

  const { text } = await fetchPlaylistText(url, fetchImpl);
  if (!text) return [{ url, format: 'audio' }];
  try {
    const parsed = parsePlaylist(text, url);
    if (parsed.format === 'hls') return [{ url, format: 'hls' }];
    return parsed.entries.slice(0, MAX_CANDIDATES).map((e) => ({ url: e.url, format: formatOfUrl(e.url) }));
  } catch (err) {
    if (err instanceof PlaylistParseError) throw new ProviderError('UNSUPPORTED', err.message);
    throw err;
  }
}
