import { describe, expect, it } from 'vitest';
import { codecFromContentType, codecFromHls, parseBitrate } from '../../lib/codec';
import { streamInfoFromHeaders } from '../playback/nativeAudio';
import { isMirrorList, planDirectPlayback, resolveDirect } from './direct';
import { ProviderError } from './errors';
import type { MediaItem } from '../../types/media';

function fakeFetch(routes: Record<string, { status?: number; body?: string; type?: string } | 'fail'>): typeof fetch {
  return (async (input: RequestInfo | URL) => {
    const url = String(input);
    const route = routes[url];
    if (!route || route === 'fail') throw new TypeError('Failed to fetch');
    return new Response(route.body ?? '', { status: route.status ?? 200, headers: { 'content-type': route.type ?? 'audio/x-mpegurl' } });
  }) as typeof fetch;
}

const PLS = '[playlist]\nFile1=https://main.example.com/stream\nTitle1=Main\nLength1=-1\nFile2=https://mirror.example.com/stream\nLength2=-1\n';

function item(url: string, format?: string): MediaItem {
  return {
    id: 'i',
    provider: 'direct',
    title: 't',
    sourceUrl: url,
    streamUrl: url,
    playbackType: 'direct',
    createdAt: '',
    updatedAt: '',
    metadata: format ? { format } : undefined,
  };
}

describe('resolveDirect', () => {
  it('returns a single item for audio URLs without fetching', async () => {
    const res = await resolveDirect('https://example.com/music/Night_Drive.mp3', fakeFetch({}));
    expect(res.kind).toBe('audio');
    expect(res.items).toHaveLength(1);
    expect(res.items[0]!.title).toBe('Night Drive');
    expect(res.items[0]!.metadata?.format).toBe('audio');
  });

  it('keeps a station PLS of live mirrors as one radio item', async () => {
    const res = await resolveDirect('https://example.com/station.pls', fakeFetch({ 'https://example.com/station.pls': { body: PLS } }));
    expect(res.kind).toBe('playlist');
    expect(res.items).toHaveLength(1);
    const station = res.items[0]!;
    expect([station.title, station.playbackType, station.streamUrl]).toEqual(['Main', 'radio', 'https://example.com/station.pls']);
    expect(station.metadata).toMatchObject({ format: 'playlist', mirrors: 2 });
    expect(res.notes.join(' ')).toMatch(/2 stream mirrors/);
  });

  it('expands lists of different tracks/stations into separate items', async () => {
    const m3u = '#EXTM3U\n#EXTINF:200,Artist - One\nhttps://a.example.com/1.mp3\n#EXTINF:-1,Other Radio\nhttps://b.example.com/live\n';
    const res = await resolveDirect('https://example.com/mix.m3u', fakeFetch({ 'https://example.com/mix.m3u': { body: m3u } }));
    expect(res.items.map((i) => [i.title, i.playbackType])).toEqual([
      ['Artist - One', 'direct'],
      ['Other Radio', 'radio'],
    ]);
    expect(res.items[1]!.metadata?.playlistUrl).toBe('https://example.com/mix.m3u');
  });

  it('reports an unreadable playlist (no CORS) with guidance instead of failing silently', async () => {
    const err = await resolveDirect('https://example.com/station.pls', fakeFetch({ 'https://example.com/station.pls': 'fail' })).catch((e) => e);
    expect(err).toBeInstanceOf(ProviderError);
    expect(err.code).toBe('CORS_ERROR');
    expect(err.message).toMatch(/paste one of the stream URLs/);
  });

  it('reports 404 playlists as NOT_FOUND', async () => {
    const err = await resolveDirect('https://example.com/gone.m3u', fakeFetch({ 'https://example.com/gone.m3u': { status: 404 } })).catch((e) => e);
    expect(err.code).toBe('NOT_FOUND');
  });

  it('treats an .m3u8 station list as a playlist, and an HLS manifest as one stream', async () => {
    const list = await resolveDirect(
      'https://example.com/list.m3u8',
      fakeFetch({ 'https://example.com/list.m3u8': { body: '#EXTM3U\n#EXTINF:-1,A\nhttps://a.example.com/live\n' } }),
    );
    expect(list.kind).toBe('playlist');
    const hls = await resolveDirect(
      'https://example.com/live.m3u8',
      fakeFetch({ 'https://example.com/live.m3u8': { body: '#EXTM3U\n#EXT-X-TARGETDURATION:6\n' } }),
    );
    expect(hls.kind).toBe('hls');
    expect(hls.items[0]!.metadata?.format).toBe('hls');
  });

  it('plays an uninspectable .m3u8 as HLS and says so', async () => {
    const res = await resolveDirect('https://example.com/live.m3u8', fakeFetch({ 'https://example.com/live.m3u8': 'fail' }));
    expect(res.kind).toBe('hls');
    expect(res.notes.join(' ')).toMatch(/could not be inspected/);
  });

  it('handles a playlist URL that actually serves audio', async () => {
    const res = await resolveDirect(
      'https://example.com/listen.pls',
      fakeFetch({ 'https://example.com/listen.pls': { body: 'ID3', type: 'audio/mpeg' } }),
    );
    expect(res.kind).toBe('stream');
  });

  it('refuses URLs of other providers', async () => {
    await expect(resolveDirect('https://youtu.be/dQw4w9WgXcQ', fakeFetch({}))).rejects.toMatchObject({ code: 'UNSUPPORTED' });
  });
});

describe('planDirectPlayback', () => {
  it('returns playlist entries as ordered mirrors', async () => {
    const plan = await planDirectPlayback(item('https://example.com/station.pls', 'playlist'), fakeFetch({ 'https://example.com/station.pls': { body: PLS } }));
    expect(plan).toEqual([
      { url: 'https://main.example.com/stream', format: 'audio' },
      { url: 'https://mirror.example.com/stream', format: 'audio' },
    ]);
  });

  it('uses the declared format, falling back to detection', async () => {
    expect(await planDirectPlayback(item('https://example.com/live.m3u8', 'hls'), fakeFetch({}))).toEqual([
      { url: 'https://example.com/live.m3u8', format: 'hls' },
    ]);
    expect(await planDirectPlayback(item('https://example.com/stream'), fakeFetch({}))).toEqual([
      { url: 'https://example.com/stream', format: 'audio' },
    ]);
  });
});

describe('isMirrorList', () => {
  const live = (title?: string) => ({ url: 'https://x/live', title, duration: null });
  it('treats all-live PLS files and single-title M3U lists as mirrors', () => {
    expect(isMirrorList('pls', [live('A'), live('B')])).toBe(true);
    expect(isMirrorList('m3u', [live('Radio'), live('radio ')])).toBe(true);
    expect(isMirrorList('m3u', [live('One'), live('Two')])).toBe(false);
    expect(isMirrorList('pls', [live('A'), { url: 'https://x/a.mp3', duration: 180 }])).toBe(false);
  });
});

describe('stream metadata', () => {
  it('maps content types and HLS codecs to labels', () => {
    expect(codecFromContentType('audio/mpeg')).toBe('MP3');
    expect(codecFromContentType('audio/aacp')).toBe('AAC');
    expect(codecFromContentType('audio/ogg; codecs=opus')).toBe('OPUS');
    expect(codecFromContentType('application/octet-stream')).toBeUndefined();
    expect(codecFromHls('mp4a.40.2')).toBe('AAC');
    expect(parseBitrate('128')).toBe(128);
    expect(parseBitrate('192,192')).toBe(192);
    expect(parseBitrate('abc')).toBeUndefined();
  });

  it('reads Icecast headers only when present', () => {
    const info = streamInfoFromHeaders(new Headers({ 'content-type': 'audio/mpeg', 'icy-br': '128', 'icy-name': 'Groove Salad' }));
    expect(info).toEqual({ source: 'http-headers', contentType: 'audio/mpeg', codec: 'MP3', bitrateKbps: 128, stationName: 'Groove Salad', genre: undefined });
    expect(streamInfoFromHeaders(new Headers({ 'content-type': 'text/html' }))).toBeUndefined();
  });
});
