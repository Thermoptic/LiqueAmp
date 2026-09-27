// YouTube playlists in the Resolve flow: detection, resolving (ids from the
// IFrame Player API, titles from oEmbed), saving as ONE playlist whose videos
// are playlist-only media.
import { beforeEach, describe, expect, it } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { resetDbForTests } from '../storage/db';
import { repositories } from '../storage/repository';
import { detectSource } from '../providers/detect';
import { validMedia, validPlaylist } from '../backup/validate';
import { collectionMedia, mediaIdentity, useLibrary } from '../../stores/libraryStore';
import { usePlaylists } from '../../stores/playlistStore';
import type { MediaItem, Playlist } from '../../types/media';
import { previewImport } from './importer';

const LIST = 'PLSrfzLXjOv32OCUA1vpSs0atSkso6Klcy';
const URL_WITH_LIST = `https://www.youtube.com/watch?v=-I1cEBVwkZw&list=${LIST}`;
const IDS = ['-I1cEBVwkZw', 'FqIWsFBRcxw', 'WYuI8V3BCK4', 'wS8ueCeUCFU'];

/** YouTube's oEmbed, faked: the playlist's title, each video's title; some videos refused. */
function oembed({ title = 'Jazz Classics' as string | null, refused = new Map<string, number>() } = {}): typeof fetch {
  return (async (input: string | URL | Request) => {
    const target = new URL(String(input)).searchParams.get('url')!;
    const u = new URL(target);
    if (u.pathname === '/playlist') {
      return title ? Response.json({ title, author_name: 'Curator', thumbnail_url: 'https://i.ytimg.com/pl.jpg' }) : new Response('', { status: 404 });
    }
    const v = u.searchParams.get('v')!;
    const status = refused.get(v);
    if (status) return new Response('', { status });
    return Response.json({ title: `Artist - Song ${v}`, author_name: 'Artist', thumbnail_url: `https://i.ytimg.com/vi/${v}/hq.jpg` });
  }) as typeof fetch;
}

const readIds = (ids: string[]) => async () => ids;

async function preview(url = URL_WITH_LIST, opts: Partial<Parameters<typeof previewImport>[1]> = {}) {
  return previewImport(url, { library: [], fetchImpl: oembed(), readPlaylistIds: readIds(IDS), ...opts });
}

describe('YouTube playlist detection', () => {
  it('1. a normal video link is still a single video', async () => {
    const d = detectSource('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
    expect(d.listId).toBeUndefined();
    expect(d.providerItemId).toBe('youtube:video:dQw4w9WgXcQ');
    const p = await preview('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
    if (p.status !== 'ready') throw new Error(p.status);
    expect(p.kind).toBe('provider');
    expect(p.playlist).toBeUndefined();
    expect(p.entries.map((e) => e.item.sourceUrl)).toEqual(['https://www.youtube.com/watch?v=dQw4w9WgXcQ']);
  });

  it('2. list= makes it a playlist, also next to v=; the video identity is unchanged', () => {
    const d = detectSource(URL_WITH_LIST);
    expect(d.listId).toBe(LIST);
    expect(d.providerItemId).toBe('youtube:video:-I1cEBVwkZw'); // single-video playback is unaffected
    expect(detectSource(`https://www.youtube.com/playlist?list=${LIST}`).listId).toBe(LIST);
    expect(detectSource(`https://music.youtube.com/playlist?list=${LIST}`)).toMatchObject({ provider: 'youtube-music', listId: LIST });
    expect(detectSource('https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=bad%20id').listId).toBeUndefined();
  });

  it('without a playlist reader (not the Resolve dialog) a list link resolves as before', async () => {
    const p = await previewImport(URL_WITH_LIST, { library: [], fetchImpl: oembed() });
    if (p.status !== 'ready') throw new Error(p.status);
    expect([p.kind, p.entries.length, p.playlist]).toEqual(['provider', 1, undefined]);
  });
});

describe('resolving a YouTube playlist', () => {
  it('3–5. title, video count and every video, in YouTube order', async () => {
    const p = await preview();
    if (p.status !== 'ready') throw new Error(p.status);
    expect(p.kind).toBe('youtube-playlist');
    expect(p.playlist).toMatchObject({ listId: LIST, title: 'Jazz Classics', titleMissing: false, total: 4, unavailable: [] });
    expect(p.detection.normalizedUrl).toBe(`https://www.youtube.com/playlist?list=${LIST}`);
    expect(p.detection.providerItemId).toBe(`youtube:playlist:${LIST}`);
    expect(p.entries.map((e) => e.item.title)).toEqual(IDS.map((id) => `Artist - Song ${id}`));
    expect(p.entries.every((e) => e.item.playbackType === 'embed' && e.item.provider === 'youtube')).toBe(true);
  });

  it('reports unavailable videos instead of pretending they were resolved', async () => {
    const refused = new Map([
      ['FqIWsFBRcxw', 404], // removed
      ['wS8ueCeUCFU', 401], // private / embedding off
    ]);
    const p = await preview(URL_WITH_LIST, { fetchImpl: oembed({ refused }) });
    if (p.status !== 'ready') throw new Error(p.status);
    expect(p.playlist!.total).toBe(4);
    expect(p.entries.map((e) => e.item.metadata?.providerItemId)).toEqual(['youtube:video:-I1cEBVwkZw', 'youtube:video:WYuI8V3BCK4']);
    expect(p.playlist!.unavailable.map((u) => u.videoId)).toEqual(['FqIWsFBRcxw', 'wS8ueCeUCFU']);
    expect(p.playlist!.unavailable.every((u) => u.reason.length > 0)).toBe(true);
  });

  it('an empty playlist is an error, not an empty import', async () => {
    const p = await preview(URL_WITH_LIST, { readPlaylistIds: readIds([]) });
    expect(p).toMatchObject({ status: 'error', title: 'EMPTY PLAYLIST' });
  });

  it('a playlist of one video, and one without a title', async () => {
    const p = await preview(URL_WITH_LIST, { readPlaylistIds: readIds([IDS[0]!]), fetchImpl: oembed({ title: null }) });
    if (p.status !== 'ready') throw new Error(p.status);
    expect(p.entries).toHaveLength(1);
    expect(p.playlist).toMatchObject({ title: 'YouTube playlist', titleMissing: true, total: 1 });
  });

  it('a list the player cannot read is a readable error', async () => {
    const p = await preview(URL_WITH_LIST, {
      readPlaylistIds: async () => {
        throw new Error('YouTube did not return the playlist in time');
      },
    });
    expect(p.status).toBe('error');
    if (p.status === 'error') expect(p.message).toContain('could not read this playlist');
  });

  it('marks videos already in the library and a list imported before', async () => {
    const saved: MediaItem = { id: 'm-old', provider: 'youtube', title: 'Old', sourceUrl: 'https://www.youtube.com/watch?v=WYuI8V3BCK4', playbackType: 'embed', metadata: { providerItemId: 'youtube:video:WYuI8V3BCK4' }, createdAt: '', updatedAt: '' };
    const before: Playlist = { id: 'pl-1', name: 'My jazz', items: [], createdAt: '', updatedAt: '', source: { provider: 'youtube', listId: LIST, url: `https://www.youtube.com/playlist?list=${LIST}` } };
    const p = await preview(URL_WITH_LIST, { library: [saved], playlists: [before] });
    if (p.status !== 'ready') throw new Error(p.status);
    expect(p.entries.map((e) => e.duplicateOf?.id ?? null)).toEqual([null, null, 'm-old', null]);
    expect(p.playlist!.existing).toEqual({ id: 'pl-1', name: 'My jazz' });
  });
});

describe('saving a YouTube playlist', () => {
  beforeEach(async () => {
    await resetDbForTests();
    globalThis.indexedDB = new IDBFactory();
    useLibrary.setState({ categories: [], media: [] });
    usePlaylists.setState({ playlists: [] });
  });

  async function resolvedItems(ids = IDS) {
    const p = await preview(URL_WITH_LIST, { readPlaylistIds: readIds(ids) });
    if (p.status !== 'ready') throw new Error(p.status);
    return p.entries.map((e) => e.item);
  }
  const source = { provider: 'youtube' as const, listId: LIST, url: `https://www.youtube.com/playlist?list=${LIST}` };

  it('9–11. ONE playlist, every video an item, in YouTube order, with the edited name', async () => {
    const items = await resolvedItems();
    const created = await usePlaylists.getState().create('  My edited name ', items, { source });
    expect(usePlaylists.getState().playlists).toHaveLength(1);
    expect(created).toMatchObject({ name: 'My edited name', source });
    expect(usePlaylists.getState().resolve(created.id).items.map((m) => m.title)).toEqual(IDS.map((id) => `Artist - Song ${id}`));
    // stored, and it survives the backup/profile validation with its source
    const stored = await repositories.playlists.get(created.id);
    expect(validPlaylist(stored)).toEqual(created);
  });

  it('12. reuses media already in the library (by the existing identity) and does not hide them', async () => {
    const [first, ...rest] = await resolvedItems();
    const [existing] = await useLibrary.getState().addMedia([{ ...first!, id: 'm-existing' }]);
    const created = await usePlaylists.getState().create('List', [first!, ...rest], { source });
    expect(created.items[0]!.mediaId).toBe('m-existing');
    expect(useLibrary.getState().media).toHaveLength(4); // 1 existing + 3 new, no duplicate
    expect(useLibrary.getState().getMedia('m-existing')!.playlistOnly).toBeUndefined();
    expect(existing!.id).toBe('m-existing');
  });

  it('13–14. the new videos are playlist-only: Collection does not list them, the playlist is the one entry', async () => {
    const created = await usePlaylists.getState().create('List', await resolvedItems(), { source });
    const media = useLibrary.getState().media;
    expect(media.every((m) => m.playlistOnly === true)).toBe(true);
    expect(collectionMedia(media, usePlaylists.getState().playlists)).toEqual([]);
    expect(usePlaylists.getState().playlists.filter((p) => p.source)).toEqual([created]);
    // the flag survives the backup/profile validation
    expect(validMedia(await repositories.media.get(media[0]!.id))!.playlistOnly).toBe(true);
    // once no playlist refers to them they are listed again, so nothing becomes unreachable
    await usePlaylists.getState().remove(created.id);
    expect(collectionMedia(useLibrary.getState().media, usePlaylists.getState().playlists)).toHaveLength(4);
  });

  it('a video twice in the playlist is one media item referenced twice', async () => {
    const items = await resolvedItems([IDS[0]!, IDS[1]!, IDS[0]!]);
    const created = await usePlaylists.getState().create('Dupes', items, { source });
    expect(useLibrary.getState().media).toHaveLength(2);
    expect(created.items.map((i) => i.mediaId)).toEqual([created.items[0]!.mediaId, created.items[1]!.mediaId, created.items[0]!.mediaId]);
    expect(new Set(useLibrary.getState().media.map(mediaIdentity)).size).toBe(2);
  });

  it('resolving the same playlist twice reuses the saved videos', async () => {
    await usePlaylists.getState().create('Once', await resolvedItems(), { source });
    await usePlaylists.getState().create('Twice', await resolvedItems(), { source });
    expect(usePlaylists.getState().playlists).toHaveLength(2);
    expect(useLibrary.getState().media).toHaveLength(4);
  });

  it('an empty name is refused before anything is saved', async () => {
    await expect(usePlaylists.getState().create('   ', await resolvedItems(), { source })).rejects.toThrow('Playlist name is required.');
    expect(useLibrary.getState().media).toEqual([]);
    expect(usePlaylists.getState().playlists).toEqual([]);
  });

  it('a normal playlist (no source) is unchanged: its media are ordinary library items', async () => {
    await usePlaylists.getState().create('Manual', await resolvedItems());
    expect(useLibrary.getState().media.some((m) => m.playlistOnly)).toBe(false);
    expect(usePlaylists.getState().playlists[0]!.source).toBeUndefined();
  });
});

describe('validation of the new fields', () => {
  it('drops a malformed playlist source and non-boolean playlistOnly', () => {
    const base = { id: 'p', name: 'P', items: [], createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' };
    expect(validPlaylist({ ...base, source: { provider: 'spotify', listId: 'x', url: 'https://x' } })!.source).toBeUndefined();
    expect(validPlaylist({ ...base, source: { provider: 'youtube', listId: 'a b', url: 'https://x' } })!.source).toBeUndefined();
    expect(validPlaylist({ ...base, source: { provider: 'youtube', listId: 'PL1', url: 'javascript:alert(1)' } })!.source).toBeUndefined();
    const m = { id: 'm', provider: 'youtube', title: 'T', sourceUrl: 'https://www.youtube.com/watch?v=abcdefg', playbackType: 'embed' };
    expect(validMedia({ ...m, playlistOnly: 'yes' })!.playlistOnly).toBeUndefined();
    expect(validMedia({ ...m, playlistOnly: true })!.playlistOnly).toBe(true);
  });
});
