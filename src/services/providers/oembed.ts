// Provider metadata via the providers' official, public oEmbed endpoints
// (PROVIDERS §31). No API keys, no scraping. All three send CORS headers
// (verified 2026-09-23). Responses are validated and normalized here.

import { createId, nowIso } from '../../lib/id';
import type { MediaItem, PlaybackType, ProviderId } from '../../types/media';
import type { Detection } from './detect';
import { ProviderError } from './errors';

const ENDPOINT: Partial<Record<ProviderId, string>> = {
  youtube: 'https://www.youtube.com/oembed',
  'youtube-music': 'https://www.youtube.com/oembed',
  soundcloud: 'https://soundcloud.com/oembed',
  spotify: 'https://open.spotify.com/oembed',
};

export interface ProviderMetadata {
  title: string;
  artist?: string;
  artwork?: string;
}

const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : undefined);
const httpsUrl = (v: unknown) => {
  const s = str(v);
  try {
    return s && new URL(s).protocol === 'https:' ? s : undefined;
  } catch {
    return undefined;
  }
};

/** Normalizes an oEmbed response; provider quirks are handled here. */
export function normalizeOEmbed(provider: ProviderId, raw: unknown): ProviderMetadata | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  let title = str(r.title);
  let artist = str(r.author_name);
  if (!title) return null;
  // SoundCloud titles are "Track by Artist".
  if (provider === 'soundcloud' && artist && title.endsWith(` by ${artist}`)) title = title.slice(0, -` by ${artist}`.length);
  // Spotify's oEmbed has no artist field.
  if (provider === 'spotify') artist = undefined;
  return { title, artist, artwork: httpsUrl(r.thumbnail_url) };
}

export async function fetchOEmbed(detection: Detection, fetchImpl: typeof fetch = fetch): Promise<ProviderMetadata> {
  const provider = detection.provider!;
  const endpoint = ENDPOINT[provider];
  if (!endpoint) throw new ProviderError('UNSUPPORTED', 'No metadata source for this provider.');
  // YouTube Music ids are YouTube video ids; YouTube's oEmbed describes them.
  const target =
    provider === 'youtube-music' ? detection.normalizedUrl.replace('https://music.youtube.com/', 'https://www.youtube.com/') : detection.normalizedUrl;
  const url = new URL(endpoint);
  url.searchParams.set('url', target);
  url.searchParams.set('format', 'json');
  let res: Response;
  try {
    res = await fetchImpl(url.href, { referrerPolicy: 'no-referrer' });
  } catch {
    throw new ProviderError('NETWORK_ERROR', navigator.onLine ? 'The provider could not be reached for metadata.' : 'You are offline.');
  }
  if (res.status === 401 || res.status === 403) throw new ProviderError('PLAYBACK_UNAVAILABLE', 'This item is private or cannot be embedded.');
  if (res.status === 404 || res.status === 400) throw new ProviderError('NOT_FOUND', 'The provider does not know this link (removed, private or mistyped).');
  if (res.status === 429) throw new ProviderError('RATE_LIMITED', 'The provider is rate limiting requests. Try again shortly.');
  if (!res.ok) throw new ProviderError('UNKNOWN', `The provider answered HTTP ${res.status}.`);
  const meta = normalizeOEmbed(provider, await res.json().catch(() => null));
  if (!meta) throw new ProviderError('UNKNOWN', 'The provider returned metadata LIQUEAMP could not read.');
  return meta;
}

/**
 * How an item of this provider is played. Single videos, tracks, sets,
 * albums and playlists use the official embedded players; YouTube playlists
 * and channels open on YouTube.
 */
export function providerPlaybackType(detection: Detection): PlaybackType {
  const id = detection.providerItemId ?? '';
  if (detection.provider === 'youtube' || detection.provider === 'youtube-music') return id.includes(':video:') ? 'embed' : 'external';
  return 'embed';
}

/** Resolves a provider link into a normalized MediaItem (PROVIDERS §7). */
export async function resolveProvider(detection: Detection, fetchImpl: typeof fetch = fetch): Promise<MediaItem> {
  if (detection.confidence === 'low') throw new ProviderError('INVALID_URL', detection.reason ?? 'This link does not point to a playable item.');
  const meta = await fetchOEmbed(detection, fetchImpl);
  const now = nowIso();
  return {
    id: createId('media'),
    provider: detection.provider!,
    title: meta.title,
    artist: meta.artist,
    artwork: meta.artwork ?? null,
    sourceUrl: detection.normalizedUrl,
    streamUrl: null,
    playbackType: providerPlaybackType(detection),
    createdAt: now,
    updatedAt: now,
    metadata: { providerItemId: detection.providerItemId, metadataSource: 'oembed' },
  };
}
