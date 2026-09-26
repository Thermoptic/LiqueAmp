import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, pickProfileSettings } from '../../types/settings';
import type { MediaItem, RadioStation } from '../../types/media';
import type { LiqueAmpProfile } from './profile';
import { applySharingDecisions, inspectUrl, sanitizeForSharing, undecided } from './sharing';
import { summarizeProfile } from './summary';
import { LIQUEAMP_DEFAULT } from '../themes/builtin';

const now = '2026-09-25T12:00:00.000Z';
const media = (id: string, url: string, extra: Partial<MediaItem> = {}): MediaItem => ({ id, provider: 'direct', title: id, sourceUrl: url, playbackType: 'direct', createdAt: now, updatedAt: now, ...extra });
const station = (id: string, streamUrl: string, extra: Partial<RadioStation> = {}): RadioStation => ({ id, name: id, streamUrl, genre: [], tags: [], ...extra });

function profile(): LiqueAmpProfile {
  return {
    format: 'liqueamp-profile',
    meta: { schemaVersion: 1, ownerUserId: 'u1', revision: 7, updatedAt: now, visibility: 'PRIVATE' },
    data: {
      settings: pickProfileSettings({ ...DEFAULT_SETTINGS, activeThemeId: 'base16-nord' }),
      themes: [{ ...LIQUEAMP_DEFAULT, id: 'mine', name: 'My Theme', source: 'user' }],
      categories: [{ id: 'c1', name: 'Jazz', sortOrder: 0, enabled: true }],
      media: [
        media('clean', 'https://radio.example/live.mp3'),
        media('secret', 'https://radio.example/live.mp3?token=abc123'),
        media('icecast', 'https://radio.example:8000/stream?sid=1&type=http'),
      ],
      playlists: [
        { id: 'p1', name: 'Mix', items: [{ mediaId: 'clean', addedAt: now }, { mediaId: 'secret', addedAt: now }], createdAt: now, updatedAt: now },
        { id: 'p2', name: 'Signed art', artwork: 'https://bucket.s3.amazonaws.com/a.jpg?X-Amz-Signature=abc&X-Amz-Credential=x', items: [], createdAt: now, updatedAt: now },
      ],
      favorites: [
        { id: 'media:secret', type: 'media', refId: 'secret', addedAt: now },
        { id: 'station:s-auth', type: 'station', refId: 's-auth', addedAt: now },
        { id: 'station:s-ok', type: 'station', refId: 's-ok', addedAt: now },
      ],
      stations: [station('s-auth', 'https://user:pa55@stream.example/radio'), station('s-ok', 'https://stream.example/ok.mp3')],
    },
  };
}

/** Deep-freezes, so any accidental mutation of the local profile throws. */
function frozen<T>(v: T): T {
  if (v && typeof v === 'object') {
    Object.values(v).forEach(frozen);
    Object.freeze(v);
  }
  return v;
}

describe('inspectUrl', () => {
  it.each([
    ['https://user:pw@host.example/stream', ['credentials-in-url']],
    ['https://user@host.example/stream', ['credentials-in-url']],
    ['https://host.example/s?token=x', ['secret-parameter']],
    ['https://host.example/s?Access_Token=x', ['secret-parameter']],
    ['https://host.example/s?api_key=x', ['secret-parameter']],
    ['https://host.example/s?key=x', ['secret-parameter']],
    ['https://host.example/s?auth=x', ['secret-parameter']],
    ['https://host.example/s?sig=x', ['secret-parameter']],
    ['https://host.example/s?x-api-key=x', ['secret-parameter']],
    ['https://host.example/s?streamToken=x', ['secret-parameter']],
    ['https://host.example/s#access_token=x', ['secret-parameter']],
    ['https://b.s3.amazonaws.com/f.mp3?X-Amz-Algorithm=AWS4&X-Amz-Credential=a&X-Amz-Signature=b', ['signed-url']],
    ['https://storage.googleapis.com/b/f?X-Goog-Signature=a', ['signed-url']],
    ['https://acct.blob.core.windows.net/c/f.mp3?sv=2020&se=2026&sp=r&sig=abc', ['signed-url']],
    ['https://d111.cloudfront.net/f.mp3?Expires=1&Signature=a&Key-Pair-Id=K', ['signed-url']],
    ['https://host.example/play/eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0In0.abcdefghij', ['jwt']],
  ])('%s → %j', (url, reasons) => {
    expect(inspectUrl(url)).toEqual(reasons);
  });

  it.each([
    'https://radio.example/live.mp3',
    'http://radio.example:8000/stream?sid=1&type=http', // Shoutcast stream id
    'https://www.youtube.com/watch?v=abc&list=PL1',
    'https://open.spotify.com/track/4cOdK2wGLETKBW3PvgPWqT?si=abc',
    'https://soundcloud.com/artist/track',
    'not a url',
  ])('%s is clean', (url) => {
    expect(inspectUrl(url)).toEqual([]);
  });
});

describe('sanitizeForSharing', () => {
  it('reports every suspicious item, with its URLs and reasons, and changes nothing', () => {
    const p = frozen(profile());
    const { findings } = sanitizeForSharing(p);
    expect(findings.map((f) => f.key)).toEqual(['media:secret', 'station:s-auth', 'playlist:p2']);
    expect(findings[0]).toMatchObject({ kind: 'media', label: 'secret', urls: [{ field: 'sourceUrl', reasons: ['secret-parameter'] }] });
    expect(findings[1]!.urls[0]).toMatchObject({ field: 'streamUrl', reasons: ['credentials-in-url'] });
    expect(findings[2]!.urls[0]).toMatchObject({ field: 'artwork', reasons: ['signed-url'] });
  });

  it('undecided() lists the findings the user has not answered', () => {
    const { findings } = sanitizeForSharing(profile());
    expect(undecided(findings, { 'media:secret': 'share' }).map((f) => f.key)).toEqual(['station:s-auth', 'playlist:p2']);
    expect(undecided(findings, { 'media:secret': 'share', 'station:s-auth': 'exclude', 'playlist:p2': 'exclude' })).toEqual([]);
  });

  it('exclude removes the item and everything pointing at it — in a copy; share keeps it', () => {
    const p = frozen(profile());
    const { findings } = sanitizeForSharing(p);
    const shared = applySharingDecisions(p, findings, { 'media:secret': 'exclude', 'station:s-auth': 'exclude', 'playlist:p2': 'exclude' });
    expect(shared.data.media.map((m) => m.id)).toEqual(['clean', 'icecast']);
    expect(shared.data.stations.map((s) => s.id)).toEqual(['s-ok']);
    expect(shared.data.playlists.find((x) => x.id === 'p1')!.items.map((i) => i.mediaId)).toEqual(['clean']);
    expect(shared.data.playlists.find((x) => x.id === 'p2')!.artwork).toBeUndefined();
    expect(shared.data.favorites.map((f) => f.id)).toEqual(['station:s-ok']);
    expect(sanitizeForSharing(shared).findings).toEqual([]);
    // the local profile is untouched
    expect(p.data.media).toHaveLength(3);
    expect(p.data.playlists[1]!.artwork).toContain('X-Amz-Signature');

    const kept = applySharingDecisions(p, findings, { 'media:secret': 'share', 'station:s-auth': 'share', 'playlist:p2': 'share' });
    expect(kept.data).toEqual(p.data);
  });
});

describe('summarizeProfile', () => {
  it('derives the preview a Friend Lique needs', () => {
    expect(summarizeProfile(profile(), 'johan')).toEqual({
      username: 'johan',
      revision: 7,
      updatedAt: now,
      theme: { id: 'base16-nord', name: 'Nord', builtIn: true },
      visualizer: { type: 'spectrum-bars', enabled: true },
      counts: { playlists: 2, categories: 1, streams: 3, stations: 2 },
    });
  });

  it('names a custom theme from the profile, and falls back to the id', () => {
    const p = profile();
    expect(summarizeProfile({ ...p, data: { ...p.data, settings: { ...p.data.settings, activeThemeId: 'mine' } } }, 'j').theme).toEqual({ id: 'mine', name: 'My Theme', builtIn: false });
    expect(summarizeProfile({ ...p, data: { ...p.data, settings: { ...p.data.settings, activeThemeId: 'gone' } } }, 'j').theme.name).toBe('gone');
  });
});

// ---- checkpoint 10A: more documented credential patterns (D13) ----------------------------------

describe('D13 — checkpoint 10A', () => {
  it.each([
    // IPTV "Xtream Codes" paths: the account is in the path
    ['http://iptv.example:8080/live/johan/s3cret/123.ts', ['credentials-in-path']],
    ['http://iptv.example:8080/live/johan/s3cret/123.m3u8', ['credentials-in-path']],
    ['http://iptv.example:8080/movie/johan/s3cret/456.mkv', ['credentials-in-path']],
    ['http://iptv.example:8080/series/johan/s3cret/789.mp4', ['credentials-in-path']],
    ['http://iptv.example:8080/timeshift/johan/s3cret/120/2026-09-26:12-00/123.ts', ['credentials-in-path']],
    // login + password parameters
    ['http://iptv.example/get.php?username=johan&password=s3cret&type=m3u', ['secret-parameter']],
    ['https://radio.example/stream?user=johan&pass=s3cret', ['secret-parameter']],
    ['https://radio.example/stream?pass=s3cret', ['secret-parameter']],
    ['https://radio.example/stream?pw=s3cret', ['secret-parameter']],
    ['https://radio.example/stream?pwd=s3cret', ['secret-parameter']],
    ['https://radio.example/stream?u=johan&p=s3cret', ['secret-parameter']],
    ['https://radio.example/stream?authorization=Basic%20abc', ['secret-parameter']],
    // streaming-server signatures
    ['https://cdn.example/live.m3u8?md5=Xy3kQ&expires=1790000000', ['signed-url']],
    ['https://cdn.example/live.m3u8?st=Xy3kQ&e=1790000000', ['signed-url']],
    ['https://cdn.example/live.m3u8?hash=Xy3kQ&expires=1790000000', ['signed-url']],
    ['https://wowza.example/live/stream/playlist.m3u8?wmsAuthSign=c2VydmVyX3RpbWU9', ['signed-url']],
  ])('%s → %j', (url, reasons) => {
    expect(inspectUrl(url)).toEqual(reasons);
  });

  it('keeps every earlier detection', () => {
    expect(inspectUrl('https://u:p@host.example/s')).toEqual(['credentials-in-url']);
    expect(inspectUrl('https://host.example/s?token=x')).toEqual(['secret-parameter']);
    expect(inspectUrl('https://bucket.s3.amazonaws.com/a.mp3?X-Amz-Signature=abc&X-Amz-Credential=x')).toEqual(['signed-url']);
    expect(inspectUrl('https://acc.blob.core.windows.net/c/a.mp3?sv=2020&sp=r&sig=abc')).toEqual(['signed-url']);
    expect(inspectUrl('https://d.cloudfront.net/a.mp3?Expires=1&Signature=abc&Key-Pair-Id=K')).toEqual(['signed-url']);
    expect(inspectUrl('https://host.example/s?t=eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjMifQ.abcdefghijk')).toContain('jwt');
  });

  it.each([
    'https://radio.example:8000/stream',
    'https://radio.example:8000/stream?sid=1&type=http',
    'https://ice.example/live.mp3?user=jazzfm', // a mount or channel name, no password
    'https://cdn.example/art.jpg?hash=3f2a9c', // cache-busting hash without an expiry
    'https://cdn.example/live.m3u8?e=1790000000', // an expiry alone
    'https://radio.example/stream?p=2', // a page number
    'https://stations.example/live/jazz/128', // /live/… but not the USER/PASS/ID.ext shape
    'https://www.youtube.com/watch?v=abc123&t=42',
    'https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC',
    'https://streams.example/listen/live/radio.pls',
  ])('a normal stream URL is not flagged: %s', (url) => {
    expect(inspectUrl(url)).toEqual([]);
  });

  it('URLs and tokens written into descriptions and provider metadata are found; the text is never changed', () => {
    const p = profile();
    const withText = {
      ...p,
      data: {
        ...p.data,
        media: [
          media('described', 'https://radio.example/a.mp3', { description: 'Backup: https://radio.example/b.mp3?token=abc — thanks!', metadata: { mirror: 'http://iptv.example:8080/live/johan/s3cret/1.ts', count: 3 } }),
          media('jwt-note', 'https://radio.example/c.mp3', { description: 'key eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjMifQ.abcdefghijk' }),
          media('plain', 'https://radio.example/d.mp3', { description: 'Jazz all night. See https://radio.example/about for more.' }),
        ],
        stations: [station('st-text', 'https://stream.example/ok.mp3', { description: 'Members: https://stream.example/hq?user=a&pass=b' })],
        playlists: [],
        favorites: [],
      },
    };
    const { findings } = sanitizeForSharing(frozen(withText));
    const byKey = Object.fromEntries(findings.map((f) => [f.key, f.urls.map((u) => [u.field, u.reasons])]));
    expect(byKey).toEqual({
      'media:described': [
        ['description', ['secret-parameter']],
        ['metadata.mirror', ['credentials-in-path']],
      ],
      'media:jwt-note': [['description', ['jwt']]],
      'station:st-text': [['description', ['secret-parameter']]],
    });
    expect(withText.data.media[0]!.description).toBe('Backup: https://radio.example/b.mp3?token=abc — thanks!');
  });
});
