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
