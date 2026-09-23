import { beforeEach, describe, expect, it } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { resetDbForTests } from '../storage/db';
import { useFavorites } from '../../stores/favoritesStore';
import { shareOrCopy } from '../share';
import { MOODS, mergeByPopularity } from './moods';
import { RadioBrowserClient, stationUuid, toRadioStation } from './radioBrowser';
import { isInsecureForPage, stationToMediaItem } from './stations';

const RAW = {
  stationuuid: 'abc-123',
  name: '  Groove Salad  ',
  url: 'https://somafm.com/m3u/groovesalad.m3u',
  url_resolved: 'http://ice5.somafm.com/groovesalad-128-aac',
  homepage: 'https://somafm.com/groovesalad/',
  favicon: 'javascript:alert(1)',
  tags: 'Ambient, Chillout,ambient,,Downtempo',
  country: 'The United States Of America',
  countrycode: 'us',
  state: 'California',
  language: 'english',
  votes: 42,
  codec: 'aac',
  bitrate: 0,
  hls: 0,
  lastcheckok: 1,
  lastchecktime_iso8601: '2026-09-20T20:50:11Z',
  clickcount: 1234,
  clicktrend: -2,
};

describe('toRadioStation', () => {
  it('normalizes and validates directory data', () => {
    const s = toRadioStation(RAW)!;
    expect(s.id).toBe('rb:abc-123');
    expect(s.name).toBe('Groove Salad');
    expect(s.streamUrl).toBe('http://ice5.somafm.com/groovesalad-128-aac');
    expect(s.sourceUrl).toBe('https://somafm.com/m3u/groovesalad.m3u');
    expect(s.favicon).toBeUndefined(); // non-http favicon rejected
    expect(s.tags).toEqual(['ambient', 'chillout', 'downtempo']);
    expect(s.countryCode).toBe('US');
    expect(s.codec).toBe('AAC');
    expect(s.bitrate).toBeUndefined(); // 0 means unknown, not 0 kbps
    expect(s.online).toBe(true);
    expect(s.directory).toEqual({ source: 'radio-browser', clicks: 1234, votes: 42, clickTrend: -2 });
  });

  it('does not present technical tags as the genre', () => {
    const s = toRadioStation({ ...RAW, tags: 'aac,128k,Talk,news' })!;
    expect(s.genre).toEqual(['talk', 'news']);
    expect(s.tags).toContain('aac');
  });

  it('never maps directory clicks to listeners', () => {
    expect(toRadioStation(RAW)!.listeners).toBeUndefined();
  });

  it('rejects unusable entries', () => {
    expect(toRadioStation(null)).toBeNull();
    expect(toRadioStation({ ...RAW, stationuuid: '' })).toBeNull();
    expect(toRadioStation({ ...RAW, url: 'ftp://x', url_resolved: '' })).toBeNull();
    expect(toRadioStation({ ...RAW, name: 42 })).toBeNull();
  });

  it('falls back to the registered URL when url_resolved is missing', () => {
    expect(toRadioStation({ ...RAW, url_resolved: '' })!.streamUrl).toBe('https://somafm.com/m3u/groovesalad.m3u');
  });

  it('extracts the directory uuid', () => {
    expect(stationUuid(toRadioStation(RAW)!)).toBe('abc-123');
  });
});

describe('RadioBrowserClient', () => {
  type Handler = (url: string) => Response | Promise<Response>;
  function client(handler: Handler) {
    const calls: string[] = [];
    const impl = (async (input: RequestInfo | URL) => {
      const url = String(input);
      calls.push(url);
      return handler(url);
    }) as typeof fetch;
    return { c: new RadioBrowserClient(impl), calls };
  }
  const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });

  it('discovers servers, searches with the right parameters and caches results', async () => {
    const { c, calls } = client((url) => (url.includes('/json/servers') ? json([{ name: 'de1.api.radio-browser.info' }]) : json([RAW])));
    const first = await c.searchStations({ name: 'groove', order: 'votes' });
    await c.searchStations({ name: 'groove', order: 'votes' });
    expect(first).toHaveLength(1);
    const searches = calls.filter((u) => u.includes('/stations/search'));
    expect(searches).toHaveLength(1);
    const q = new URL(searches[0]!).searchParams;
    expect(q.get('name')).toBe('groove');
    expect(q.get('order')).toBe('votes');
    expect(q.get('reverse')).toBe('true');
    expect(q.get('hidebroken')).toBe('true');
  });

  it('fails over to another mirror on network errors', async () => {
    const { c, calls } = client((url) => {
      if (url.includes('/json/servers')) return json([{ name: 'a.api.radio-browser.info' }, { name: 'b.api.radio-browser.info' }]);
      if (calls.filter((u) => u.includes('/stations/')).length === 1) throw new TypeError('down');
      return json([RAW]);
    });
    expect(await c.searchStations({ name: 'x' })).toHaveLength(1);
    expect(calls.filter((u) => u.includes('/stations/'))).toHaveLength(2);
  });

  it('falls back to known servers when discovery fails', async () => {
    const { c, calls } = client((url) => {
      if (url.includes('/json/servers')) throw new TypeError('dns');
      return json([]);
    });
    await c.topTags();
    expect(calls.some((u) => /https:\/\/(de1|de2|fi1)\.api\.radio-browser\.info\/json\/tags/.test(u))).toBe(true);
  });

  it('reports rate limiting without hammering other mirrors', async () => {
    const { c, calls } = client((url) => (url.includes('/json/servers') ? json([{ name: 'a.api.radio-browser.info' }, { name: 'b.api.radio-browser.info' }]) : json({}, 429)));
    await expect(c.searchStations({})).rejects.toMatchObject({ code: 'RATE_LIMITED' });
    expect(calls.filter((u) => u.includes('/stations/'))).toHaveLength(1);
  });

  it('normalizes tags and countries, dropping empty ones', async () => {
    const { c } = client((url) => {
      if (url.includes('/json/servers')) return json([{ name: 'a.api.radio-browser.info' }]);
      if (url.includes('/json/tags')) return json([{ name: 'Jazz', stationcount: 10 }, { name: '', stationcount: 3 }, { name: 'x', stationcount: 0 }, { name: 'Radio', stationcount: 99 }]);
      return json([{ name: 'Sweden', iso_3166_1: 'se', stationcount: 500 }, { name: 'Nowhere', stationcount: 2 }]);
    });
    expect(await c.topTags()).toEqual([{ name: 'jazz', stationCount: 10 }]);
    expect(await c.countries()).toEqual([{ name: 'Sweden', code: 'SE', stationCount: 500 }]);
  });
});

describe('stations as media', () => {
  it('converts a station into a live radio MediaItem with a stable id', () => {
    const station = toRadioStation(RAW)!;
    const item = stationToMediaItem(station);
    expect(item.id).toBe(station.id);
    expect(item.provider).toBe('radio');
    expect(item.playbackType).toBe('radio');
    expect(item.duration).toBeNull();
    expect(item.streamUrl).toBe(station.streamUrl);
    expect(item.sourceUrl).toBe(station.sourceUrl);
    expect(item.metadata?.format).toBe('stream');
  });

  it('keeps playlist and HLS stream URLs resolvable', () => {
    const pls = stationToMediaItem(toRadioStation({ ...RAW, url_resolved: 'https://x.example.com/listen.pls' })!);
    expect(pls.metadata?.format).toBe('playlist');
    const hls = stationToMediaItem(toRadioStation({ ...RAW, hls: 1, url_resolved: 'https://x.example.com/live' })!);
    expect(hls.metadata?.format).toBe('hls');
  });

  it('flags http streams only on https pages', () => {
    expect(isInsecureForPage('http://a/stream', 'https:')).toBe(true);
    expect(isInsecureForPage('http://a/stream', 'http:')).toBe(false);
    expect(isInsecureForPage('https://a/stream', 'https:')).toBe(false);
  });
});

describe('moods', () => {
  it('each mood lists the real tags it searches', () => {
    for (const m of MOODS) expect(m.tags.length).toBeGreaterThan(0);
  });

  it('merges per-tag results without duplicates, most clicked first', () => {
    const a = { id: 'a', directory: { clicks: 5 } };
    const b = { id: 'b', directory: { clicks: 50 } };
    expect(mergeByPopularity([[a, b], [b]]).map((s) => s.id)).toEqual(['b', 'a']);
  });
});

describe('favourite stations', () => {
  beforeEach(async () => {
    await resetDbForTests();
    globalThis.indexedDB = new IDBFactory();
    useFavorites.setState({ favorites: [], stations: {} });
  });

  it('toggles, persists the station snapshot and restores after hydrate', async () => {
    const station = toRadioStation(RAW)!;
    expect(await useFavorites.getState().toggleStation(station)).toBe(true);
    expect(useFavorites.getState().isFavorite('station', station.id)).toBe(true);
    useFavorites.setState({ favorites: [], stations: {} });
    await useFavorites.getState().hydrate();
    expect(useFavorites.getState().isFavorite('station', station.id)).toBe(true);
    expect(useFavorites.getState().stations[station.id]?.name).toBe('Groove Salad');
    expect(await useFavorites.getState().toggleStation(station)).toBe(false);
    await useFavorites.getState().hydrate();
    expect(useFavorites.getState().favorites).toHaveLength(0);
  });
});

describe('shareOrCopy', () => {
  const data = { title: 'Radio', url: 'https://example.com' };

  it('uses the Web Share API when available', async () => {
    const nav = { share: async () => undefined, canShare: () => true } as unknown as Navigator;
    expect(await shareOrCopy(data, nav)).toBe('shared');
  });

  it('treats a dismissed share sheet as cancelled, not as an error', async () => {
    const nav = {
      share: async () => {
        throw new DOMException('dismissed', 'AbortError');
      },
    } as unknown as Navigator;
    expect(await shareOrCopy(data, nav)).toBe('cancelled');
  });

  it('falls back to copying the source URL', async () => {
    let copied = '';
    const nav = { clipboard: { writeText: async (t: string) => void (copied = t) } } as unknown as Navigator;
    expect(await shareOrCopy(data, nav)).toBe('copied');
    expect(copied).toBe('https://example.com');
  });
});
