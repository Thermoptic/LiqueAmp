// Radio Browser (radio-browser.info) client: a free, community-run station
// directory with CORS enabled. Responses are validated and normalized at this
// boundary; nothing outside this file sees the raw API shape (PROVIDERS §90).

import type { RadioStation } from '../../types/media';
import { ProviderError } from '../providers/errors';

const DISCOVERY_URL = 'https://all.api.radio-browser.info/json/servers';
/** Used when discovery fails; the directory publishes these hosts. */
const FALLBACK_SERVERS = ['de1.api.radio-browser.info', 'de2.api.radio-browser.info', 'fi1.api.radio-browser.info'];
const CACHE_TTL_MS = 5 * 60 * 1000;
const CACHE_MAX = 60;

export type StationOrder = 'clickcount' | 'votes' | 'name' | 'bitrate' | 'lastcheckok';

export interface StationQuery {
  name?: string;
  tag?: string;
  countryCode?: string;
  order?: StationOrder;
  limit?: number;
  offset?: number;
  /** Only stations whose last directory check succeeded. */
  onlineOnly?: boolean;
}

export interface TagCount {
  name: string;
  stationCount: number;
}

export interface CountryCount {
  name: string;
  code: string;
  stationCount: number;
}

const TECHNICAL_TAG = /^(mp3|aac\+?|aacp|he-?aac|ogg|opus|flac|hls|stream|radio|music|online|webradio|internet radio|\d+\s?k(bps)?|kbps|\d+)$/i;

// ---- validation helpers ------------------------------------------------------

type Raw = Record<string, unknown>;
const str = (v: unknown): string | undefined => (typeof v === 'string' && v.trim() ? v.trim() : undefined);
const num = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);
const httpUrl = (v: unknown): string | undefined => {
  const s = str(v);
  if (!s) return undefined;
  try {
    const u = new URL(s);
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.href : undefined;
  } catch {
    return undefined;
  }
};

/** Normalizes one Radio Browser station, or returns null if it is unusable. */
export function toRadioStation(raw: unknown): RadioStation | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Raw;
  const uuid = str(r.stationuuid);
  const name = str(r.name);
  const sourceUrl = httpUrl(r.url);
  const streamUrl = httpUrl(r.url_resolved) ?? sourceUrl;
  if (!uuid || !name || !streamUrl) return null;
  const tags = (str(r.tags) ?? '')
    .split(',')
    .map((t) => t.trim().toLowerCase())
    .filter((t, i, all) => t && all.indexOf(t) === i)
    .slice(0, 12);
  const bitrate = num(r.bitrate);
  const lastCheckOk = num(r.lastcheckok);
  return {
    id: `rb:${uuid}`,
    name,
    streamUrl,
    sourceUrl,
    hls: num(r.hls) === 1,
    homepage: httpUrl(r.homepage),
    favicon: httpUrl(r.favicon),
    // Directory tags sometimes hold technical noise ("aac", "128k"); keep it
    // as a tag but do not present it as the station's genre.
    genre: tags.filter((t) => !TECHNICAL_TAG.test(t)).slice(0, 3),
    tags,
    country: str(r.country),
    countryCode: str(r.countrycode)?.toUpperCase(),
    state: str(r.state),
    language: str(r.language),
    codec: str(r.codec)?.toUpperCase(),
    bitrate: bitrate && bitrate > 0 ? bitrate : undefined,
    online: lastCheckOk === undefined ? undefined : lastCheckOk === 1,
    lastChecked: str(r.lastchecktime_iso8601),
    directory: {
      source: 'radio-browser',
      clicks: num(r.clickcount),
      votes: num(r.votes),
      clickTrend: num(r.clicktrend),
    },
  };
}

export function stationUuid(station: RadioStation): string | null {
  return station.id.startsWith('rb:') ? station.id.slice(3) : null;
}

// ---- client ------------------------------------------------------------------

export class RadioBrowserClient {
  private servers: string[] | null = null;
  private current = 0;
  private cache = new Map<string, { at: number; data: unknown }>();

  constructor(private readonly fetchImpl: typeof fetch = (...args) => fetch(...args)) {}

  /** Directory mirror currently used, once discovery has run (for /control diagnostics). */
  get serverInUse(): string | null {
    return this.servers?.[this.current] ?? null;
  }

  /** Number of cached directory responses (5-minute cache). */
  get cachedResponses(): number {
    return this.cache.size;
  }

  private async discover(signal?: AbortSignal): Promise<string[]> {
    if (this.servers) return this.servers;
    try {
      const res = await this.fetchImpl(DISCOVERY_URL, { signal, referrerPolicy: 'no-referrer' });
      const list = (await res.json()) as unknown;
      const names = Array.isArray(list)
        ? [...new Set(list.map((s) => str((s as Raw)?.name)).filter((n): n is string => !!n && n.endsWith('.api.radio-browser.info')))]
        : [];
      // Spread load across mirrors as the directory asks.
      this.servers = names.length ? names.sort(() => Math.random() - 0.5) : FALLBACK_SERVERS;
    } catch (err) {
      if (signal?.aborted) throw err;
      this.servers = FALLBACK_SERVERS;
    }
    return this.servers;
  }

  /** GET with cache and failover to the next mirror on network/5xx errors. */
  private async get<T>(path: string, params: Record<string, string | number | boolean | undefined>, signal?: AbortSignal): Promise<T> {
    const query = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== '') query.set(k, String(v));
    const key = `${path}?${query}`;
    const hit = this.cache.get(key);
    if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.data as T;

    const servers = await this.discover(signal);
    let lastError: unknown;
    for (let attempt = 0; attempt < servers.length; attempt++) {
      const host = servers[(this.current + attempt) % servers.length]!;
      try {
        const res = await this.fetchImpl(`https://${host}${key}`, { signal, referrerPolicy: 'no-referrer' });
        if (res.status === 429) throw new ProviderError('RATE_LIMITED', 'The radio directory is rate limiting requests. Wait a moment and try again.');
        if (res.status >= 500) throw new ProviderError('NETWORK_ERROR', `Radio directory server error (HTTP ${res.status}).`);
        if (!res.ok) throw new ProviderError('UNKNOWN', `The radio directory answered HTTP ${res.status}.`);
        const data = (await res.json()) as T;
        this.current = (this.current + attempt) % servers.length;
        this.cache.set(key, { at: Date.now(), data });
        if (this.cache.size > CACHE_MAX) this.cache.delete(this.cache.keys().next().value!);
        return data;
      } catch (err) {
        if (signal?.aborted) throw err;
        if (err instanceof ProviderError && err.code === 'RATE_LIMITED') throw err;
        lastError = err;
      }
    }
    if (typeof navigator !== 'undefined' && !navigator.onLine) throw new ProviderError('NETWORK_ERROR', 'You are offline. The radio directory needs a network connection.');
    throw lastError instanceof ProviderError
      ? lastError
      : new ProviderError('NETWORK_ERROR', 'The radio directory (radio-browser.info) could not be reached.');
  }

  async searchStations(q: StationQuery, signal?: AbortSignal): Promise<RadioStation[]> {
    const order = q.order ?? 'clickcount';
    const raw = await this.get<unknown[]>(
      '/json/stations/search',
      {
        name: q.name?.trim(),
        tag: q.tag,
        tagExact: q.tag ? true : undefined,
        countrycode: q.countryCode,
        order,
        reverse: order !== 'name',
        hidebroken: q.onlineOnly ?? true,
        limit: q.limit ?? 60,
        offset: q.offset ?? 0,
      },
      signal,
    );
    return (Array.isArray(raw) ? raw : []).map(toRadioStation).filter((s): s is RadioStation => s !== null);
  }

  async topTags(limit = 80, signal?: AbortSignal): Promise<TagCount[]> {
    const raw = await this.get<unknown[]>('/json/tags', { order: 'stationcount', reverse: true, hidebroken: true, limit }, signal);
    return (Array.isArray(raw) ? raw : [])
      .map((t) => ({ name: str((t as Raw)?.name)?.toLowerCase(), stationCount: num((t as Raw)?.stationcount) ?? 0 }))
      .filter((t): t is TagCount => !!t.name && t.stationCount > 0 && !TECHNICAL_TAG.test(t.name));
  }

  async countries(signal?: AbortSignal): Promise<CountryCount[]> {
    const raw = await this.get<unknown[]>('/json/countries', { order: 'stationcount', reverse: true, hidebroken: true }, signal);
    return (Array.isArray(raw) ? raw : [])
      .map((c) => ({
        name: str((c as Raw)?.name),
        code: str((c as Raw)?.iso_3166_1)?.toUpperCase(),
        stationCount: num((c as Raw)?.stationcount) ?? 0,
      }))
      .filter((c): c is CountryCount => !!c.name && !!c.code && c.stationCount > 0);
  }

  /**
   * Tells the directory a station was played. Radio Browser asks clients to
   * do this; it feeds the public popularity ranking. Fire-and-forget.
   */
  reportClick(uuid: string): void {
    void this.discover()
      .then((servers) => this.fetchImpl(`https://${servers[this.current % servers.length]}/json/url/${encodeURIComponent(uuid)}`, { referrerPolicy: 'no-referrer' }))
      .catch(() => undefined);
  }
}

export const radioBrowser = new RadioBrowserClient();
