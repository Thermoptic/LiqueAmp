// Parsers for playlist/stream-list files (PROVIDERS §13–14). Pure functions:
// text in, entries out. Malformed input produces a readable error.

export interface PlaylistEntry {
  url: string;
  title?: string;
  /** Seconds; null = live/unknown (M3U `#EXTINF:-1`, PLS `Length=-1`). */
  duration: number | null;
}

export type PlaylistFormat = 'hls' | 'm3u' | 'pls' | 'unknown';

export class PlaylistParseError extends Error {}

/**
 * HLS manifests are also `.m3u8` files but describe one adaptive stream, not
 * a list of sources; they must be played, not expanded (PROVIDERS §13).
 */
export function isHlsManifest(text: string): boolean {
  return /#EXT-X-(TARGETDURATION|STREAM-INF|MEDIA-SEQUENCE|MEDIA:|VERSION|PLAYLIST-TYPE|INDEPENDENT-SEGMENTS)/i.test(text);
}

export function sniffPlaylist(text: string): PlaylistFormat {
  const body = text.replace(/^﻿/, '').trimStart();
  if (/^\[playlist\]/i.test(body)) return 'pls';
  if (isHlsManifest(body)) return 'hls';
  if (/^#EXTM3U/i.test(body) || /^(https?:)?\/\//im.test(body)) return 'm3u';
  return 'unknown';
}

function resolveEntryUrl(raw: string, baseUrl: string): string | null {
  try {
    const u = new URL(raw.trim(), baseUrl);
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.href : null;
  } catch {
    return null;
  }
}

/** Plain and extended M3U. Relative entries resolve against the playlist URL. */
export function parseM3U(text: string, baseUrl: string): PlaylistEntry[] {
  const entries: PlaylistEntry[] = [];
  let pending: { title?: string; duration: number | null } | null = null;
  for (const rawLine of text.replace(/^﻿/, '').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    if (line.startsWith('#')) {
      const m = /^#EXTINF:\s*(-?\d+(?:\.\d+)?)[^,]*,?(.*)$/i.exec(line);
      if (m) {
        const seconds = Number(m[1]);
        pending = { duration: seconds < 0 ? null : seconds, title: m[2]?.trim() || undefined };
      }
      continue;
    }
    const url = resolveEntryUrl(line, baseUrl);
    if (url) entries.push({ url, title: pending?.title, duration: pending?.duration ?? null });
    pending = null;
  }
  if (entries.length === 0) throw new PlaylistParseError('The playlist contains no playable http(s) entries.');
  return entries;
}

/** PLS ([playlist] / FileN / TitleN / LengthN). */
export function parsePLS(text: string, baseUrl: string): PlaylistEntry[] {
  const body = text.replace(/^﻿/, '');
  if (!/^\s*\[playlist\]/i.test(body)) throw new PlaylistParseError('Not a PLS file: missing [playlist] header.');
  const files = new Map<number, string>();
  const titles = new Map<number, string>();
  const lengths = new Map<number, number>();
  for (const rawLine of body.split(/\r?\n/)) {
    const m = /^\s*(File|Title|Length)(\d+)\s*=\s*(.*)$/i.exec(rawLine);
    if (!m) continue;
    const key = m[1]!.toLowerCase();
    const n = Number(m[2]);
    const value = m[3]!.trim();
    if (key === 'file') files.set(n, value);
    else if (key === 'title') titles.set(n, value);
    else lengths.set(n, Number(value));
  }
  const entries: PlaylistEntry[] = [];
  for (const n of [...files.keys()].sort((a, b) => a - b)) {
    const url = resolveEntryUrl(files.get(n)!, baseUrl);
    if (!url) continue;
    const len = lengths.get(n);
    entries.push({
      url,
      title: titles.get(n) || undefined,
      duration: len === undefined || !Number.isFinite(len) || len < 0 ? null : len,
    });
  }
  if (entries.length === 0) throw new PlaylistParseError('The PLS file contains no playable http(s) entries.');
  return entries;
}

export function parsePlaylist(text: string, baseUrl: string): { format: PlaylistFormat; entries: PlaylistEntry[] } {
  const format = sniffPlaylist(text);
  if (format === 'pls') return { format, entries: parsePLS(text, baseUrl) };
  if (format === 'm3u') return { format, entries: parseM3U(text, baseUrl) };
  if (format === 'hls') return { format, entries: [] };
  throw new PlaylistParseError('The file is not a recognised M3U, M3U8 or PLS playlist.');
}
