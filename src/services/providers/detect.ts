// Central URL normalization + provider detection (PROVIDERS §9, §29).
// Specific providers are matched before the generic direct-stream fallback.

import type { ProviderId } from '../../types/media';

export type SourceKind =
  /** A single audio file / progressive stream with a known audio extension. */
  | 'audio'
  /** An HLS manifest (.m3u8), or a .m3u8 that still needs sniffing. */
  | 'hls'
  /** A list of sources (.m3u / .pls), to be fetched and parsed. */
  | 'playlist'
  /** A URL without a recognisable extension; may be a live stream (Icecast/Shoutcast). */
  | 'stream'
  /** A page on a known provider (YouTube, Spotify, SoundCloud). */
  | 'provider'
  | 'unsupported';

export interface Detection {
  provider: ProviderId | null;
  kind: SourceKind;
  confidence: 'high' | 'medium' | 'low';
  normalizedUrl: string;
  /** Stable provider identity for duplicate detection, e.g. "spotify:track:…". */
  providerItemId?: string;
  reason?: string;
}

export class InvalidUrlError extends Error {}

const TRACKING_PARAMS = /^(utm_\w+|fbclid|gclid|mc_cid|mc_eid|igshid)$/i;
const AUDIO_EXT = /\.(mp3|aac|m4a|mp4a|ogg|oga|opus|flac|wav|weba|webm)$/i;
const STREAM_HINT = /(^|\/)(stream|live|listen|radio|;|;stream\.\w+)$|\/;$|icecast|shoutcast/i;

/**
 * Trims, adds https:// to bare hostnames, lower-cases the host and removes
 * tracking parameters and fragments. Other query parameters are kept: stream
 * URLs often carry tokens that are required for playback.
 */
export function normalizeUrl(input: string): string {
  let raw = input.trim();
  if (!raw) throw new InvalidUrlError('Enter a URL.');
  if (/^spotify:/i.test(raw)) return raw;
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(raw) && /^(localhost|[\w-]+(\.[\w-]+)+)([/:?#]|$)/i.test(raw)) {
    // Like browsers: local hosts and IP addresses default to http, others to https.
    const local = /^(localhost|\d{1,3}(\.\d{1,3}){3})([/:?#]|$)/i.test(raw);
    raw = `${local ? 'http' : 'https'}://${raw}`;
  }
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new InvalidUrlError('This is not a valid URL.');
  }
  url.hash = '';
  url.hostname = url.hostname.toLowerCase();
  for (const key of [...url.searchParams.keys()]) {
    if (TRACKING_PARAMS.test(key)) url.searchParams.delete(key);
  }
  return url.href;
}

function youtubeId(url: URL): string | null {
  const host = url.hostname.replace(/^(www|m)\./, '');
  if (host === 'youtu.be') return url.pathname.slice(1).split('/')[0] || null;
  if (host !== 'youtube.com' && host !== 'music.youtube.com') return null;
  const v = url.searchParams.get('v');
  if (v) return v;
  const m = /^\/(shorts|live|embed)\/([\w-]{6,})/.exec(url.pathname);
  return m ? m[2]! : null;
}

function detectYouTube(url: URL): Detection | null {
  const host = url.hostname.replace(/^(www|m)\./, '');
  if (host !== 'youtube.com' && host !== 'youtu.be' && host !== 'music.youtube.com') return null;
  const provider: ProviderId = host === 'music.youtube.com' ? 'youtube-music' : 'youtube';
  const id = youtubeId(url);
  const list = url.searchParams.get('list');
  if (id) {
    const canonical = new URL(provider === 'youtube-music' ? 'https://music.youtube.com/watch' : 'https://www.youtube.com/watch');
    canonical.searchParams.set('v', id);
    return { provider, kind: 'provider', confidence: 'high', normalizedUrl: canonical.href, providerItemId: `${provider}:video:${id}` };
  }
  if (list) {
    const canonical = new URL(provider === 'youtube-music' ? 'https://music.youtube.com/playlist' : 'https://www.youtube.com/playlist');
    canonical.searchParams.set('list', list);
    return { provider, kind: 'provider', confidence: 'high', normalizedUrl: canonical.href, providerItemId: `${provider}:playlist:${list}` };
  }
  return { provider, kind: 'provider', confidence: 'low', normalizedUrl: url.href, reason: 'No video or playlist id found in this YouTube URL.' };
}

const SPOTIFY_TYPES = 'track|album|playlist|episode|show|artist';

function detectSpotify(raw: string): Detection | null {
  const uri = new RegExp(`^spotify:(${SPOTIFY_TYPES}):([A-Za-z0-9]+)$`, 'i').exec(raw);
  if (uri) {
    const type = uri[1]!.toLowerCase();
    return {
      provider: 'spotify',
      kind: 'provider',
      confidence: 'high',
      normalizedUrl: `https://open.spotify.com/${type}/${uri[2]}`,
      providerItemId: `spotify:${type}:${uri[2]}`,
    };
  }
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.hostname !== 'open.spotify.com') return null;
  const m = new RegExp(`^/(?:intl-[a-z-]+/)?(${SPOTIFY_TYPES})/([A-Za-z0-9]+)`, 'i').exec(url.pathname);
  if (!m) return { provider: 'spotify', kind: 'provider', confidence: 'low', normalizedUrl: url.href, reason: 'Unrecognised Spotify link.' };
  const type = m[1]!.toLowerCase();
  return {
    provider: 'spotify',
    kind: 'provider',
    confidence: 'high',
    normalizedUrl: `https://open.spotify.com/${type}/${m[2]}`,
    providerItemId: `spotify:${type}:${m[2]}`,
  };
}

function detectSoundCloud(url: URL): Detection | null {
  const host = url.hostname.replace(/^(www|m)\./, '');
  if (host !== 'soundcloud.com' && host !== 'on.soundcloud.com') return null;
  const canonical = new URL(url.pathname.replace(/\/+$/, ''), 'https://soundcloud.com');
  const segments = canonical.pathname.split('/').filter(Boolean);
  if (host === 'soundcloud.com' && segments.length === 0) {
    return { provider: 'soundcloud', kind: 'provider', confidence: 'low', normalizedUrl: canonical.href, reason: 'This is the SoundCloud home page, not a track.' };
  }
  return {
    provider: 'soundcloud',
    kind: 'provider',
    confidence: 'high',
    // on.soundcloud.com short links keep their host; they redirect to the real page.
    normalizedUrl: host === 'on.soundcloud.com' ? url.href.split('?')[0]! : canonical.href,
    providerItemId: host === 'soundcloud.com' ? `soundcloud:${segments.join('/')}` : undefined,
  };
}

/** Decides which provider handles a URL. Never fetches anything. */
export function detectSource(input: string): Detection {
  const trimmed = input.trim();
  const spotify = detectSpotify(trimmed);
  if (spotify) return spotify;

  const normalizedUrl = normalizeUrl(trimmed);
  const url = new URL(normalizedUrl);
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return { provider: null, kind: 'unsupported', confidence: 'high', normalizedUrl, reason: `"${url.protocol}" addresses cannot be played in a browser.` };
  }

  const specific = detectYouTube(url) ?? detectSpotify(normalizedUrl) ?? detectSoundCloud(url);
  if (specific) return specific;

  const path = url.pathname;
  if (/\.m3u8$/i.test(path)) return { provider: 'direct', kind: 'hls', confidence: 'high', normalizedUrl };
  if (/\.(m3u|pls)$/i.test(path)) return { provider: 'direct', kind: 'playlist', confidence: 'high', normalizedUrl };
  if (AUDIO_EXT.test(path)) return { provider: 'direct', kind: 'audio', confidence: 'high', normalizedUrl };
  // An explicit port (e.g. :8000) is typical of Icecast/Shoutcast servers.
  if (STREAM_HINT.test(path) || url.port) {
    return { provider: 'direct', kind: 'stream', confidence: 'medium', normalizedUrl };
  }
  return {
    provider: 'direct',
    kind: 'stream',
    confidence: 'low',
    normalizedUrl,
    reason: 'No audio file extension. It will be tried as a direct stream.',
  };
}
