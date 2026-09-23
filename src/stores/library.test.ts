import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { resetDbForTests } from '../services/storage/db';
import { startHistoryRecorder, MIN_LISTEN_SECONDS } from '../services/playback/historyRecorder';
import { shuffled } from '../components/library/PlaylistsView';
import type { MediaItem, RadioStation } from '../types/media';
import { useLibrary, mediaIdentity } from './libraryStore';
import { usePlaylists } from './playlistStore';
import { useFavorites, isItemFavorite } from './favoritesStore';
import { useHistory } from './historyStore';
import { INITIAL_PLAYBACK, usePlayback, usePlaybackClock } from './playbackStore';

function item(id: string, extra: Partial<MediaItem> = {}): MediaItem {
  return { id, provider: 'direct', title: `Title ${id}`, sourceUrl: `https://x/${id}.mp3`, streamUrl: `https://x/${id}.mp3`, playbackType: 'direct', createdAt: '', updatedAt: '', ...extra };
}

const station: RadioStation = { id: 'rb:1', name: 'Test FM', streamUrl: 'https://fm/live', genre: [], tags: [] };

beforeEach(async () => {
  await resetDbForTests();
  globalThis.indexedDB = new IDBFactory();
  useLibrary.setState({ categories: [], media: [] });
  usePlaylists.setState({ playlists: [] });
  useFavorites.setState({ favorites: [], stations: {} });
  useHistory.setState({ entries: [] });
  usePlayback.setState({ ...INITIAL_PLAYBACK });
});

describe('library media', () => {
  it('stores each source once, by id or by source identity', async () => {
    const [a] = await useLibrary.getState().addMedia([item('a')]);
    const [again] = await useLibrary.getState().addMedia([item('a')]);
    const [sameSource] = await useLibrary.getState().addMedia([item('other-id', { streamUrl: 'https://x/a.mp3', sourceUrl: 'https://x/a.mp3' })]);
    expect(again).toBe(a);
    expect(sameSource!.id).toBe('a');
    expect(useLibrary.getState().media).toHaveLength(1);
    expect(mediaIdentity(item('y', { metadata: { providerItemId: 'spotify:track:1' } }))).toBe('spotify:track:1');
  });
});

describe('playlists', () => {
  it('creates, adds, reorders, removes and persists', async () => {
    const pl = await usePlaylists.getState().create('  Late Night ', [item('a'), item('b')]);
    expect(pl.name).toBe('Late Night');
    await usePlaylists.getState().addItems(pl.id, [item('c')]);
    await usePlaylists.getState().moveItem(pl.id, 2, 0);
    await usePlaylists.getState().removeItem(pl.id, 1);
    expect(usePlaylists.getState().resolve(pl.id).items.map((i) => i.id)).toEqual(['c', 'b']);

    usePlaylists.setState({ playlists: [] });
    await usePlaylists.getState().hydrate();
    expect(usePlaylists.getState().resolve(pl.id).items.map((i) => i.id)).toEqual(['c', 'b']);
  });

  it('references library media instead of copying it', async () => {
    const pl = await usePlaylists.getState().create('A', [item('a')]);
    await usePlaylists.getState().create('B', [item('a')]);
    expect(useLibrary.getState().media).toHaveLength(1);
    expect(usePlaylists.getState().playlists.find((p) => p.id === pl.id)!.items[0]!.mediaId).toBe('a');
  });

  it('allows the same item twice and skips missing media when resolving', async () => {
    const pl = await usePlaylists.getState().create('A', [item('a'), item('a')]);
    expect(pl.items).toHaveLength(2);
    await useLibrary.getState().removeMedia('a');
    expect(usePlaylists.getState().resolve(pl.id)).toEqual({ items: [], missing: 2 });
  });

  it('renames and deletes; rejects empty names', async () => {
    const pl = await usePlaylists.getState().create('A');
    await usePlaylists.getState().rename(pl.id, 'B');
    expect(usePlaylists.getState().playlists[0]!.name).toBe('B');
    await expect(usePlaylists.getState().rename(pl.id, '  ')).rejects.toThrow();
    await expect(usePlaylists.getState().create('')).rejects.toThrow();
    await usePlaylists.getState().remove(pl.id);
    expect(usePlaylists.getState().playlists).toHaveLength(0);
  });

  it('shuffled returns a permutation without mutating the input', () => {
    const list = [1, 2, 3, 4];
    const out = shuffled(list, () => 0);
    expect([...out].sort()).toEqual(list);
    expect(list).toEqual([1, 2, 3, 4]);
  });
});

describe('favourites', () => {
  it('favourites media by saving it to the library', async () => {
    expect(await useFavorites.getState().toggleMedia(item('a'))).toBe(true);
    expect(useLibrary.getState().media.map((m) => m.id)).toEqual(['a']);
    expect(isItemFavorite(item('a'), useFavorites.getState().favorites, {})).toBe(true);
    expect(await useFavorites.getState().toggleMedia(item('a'))).toBe(false);
  });

  it('a playing station is favourited as a station when known', async () => {
    useFavorites.getState().rememberStation(station);
    const radioItem = item('rb:1', { provider: 'radio', playbackType: 'radio', metadata: { stationId: 'rb:1' } });
    await useFavorites.getState().toggleItem(radioItem);
    const s = useFavorites.getState();
    expect(s.isFavorite('station', 'rb:1')).toBe(true);
    expect(isItemFavorite(radioItem, s.favorites, s.stations)).toBe(true);
    expect(useLibrary.getState().media).toHaveLength(0);
  });

  it('favourites playlists by id', async () => {
    await useFavorites.getState().togglePlaylist('pl-1');
    await useFavorites.getState().hydrate();
    expect(useFavorites.getState().isFavorite('playlist', 'pl-1')).toBe(true);
  });
});

describe('history recorder', () => {
  let t = 0;
  let stop: (() => void) | null = null;
  const advance = (ms: number) => {
    t += ms;
    usePlaybackClock.setState({ currentTime: usePlaybackClock.getState().currentTime + ms / 1000 });
  };
  const load = (m: MediaItem) => usePlayback.setState({ loadId: usePlayback.getState().loadId + 1, currentItem: m, status: 'loading' });
  const flush = () => new Promise((r) => setTimeout(r, 0));

  beforeEach(() => {
    t = 0;
    usePlaybackClock.setState({ currentTime: 0, duration: 200, bufferedAhead: 0 });
    stop = startHistoryRecorder(() => t);
  });
  afterEach(() => stop?.());

  function playFor(seconds: number) {
    for (let i = 0; i < seconds * 4; i++) advance(250);
  }

  it('records nothing for plays shorter than the minimum', async () => {
    load(item('a'));
    usePlayback.setState({ status: 'playing' });
    playFor(MIN_LISTEN_SECONDS - 1);
    load(item('b'));
    await flush();
    expect(useHistory.getState().entries).toHaveLength(0);
  });

  it('records one entry per play with listened time and completion', async () => {
    load(item('a', { duration: 200 }));
    usePlayback.setState({ status: 'playing' });
    playFor(10);
    usePlayback.setState({ status: 'buffering' }); // buffering is not listening
    for (let i = 0; i < 20; i++) advance(250);
    usePlayback.setState({ status: 'playing' });
    playFor(10);
    load(item('b'));
    await flush();
    const entries = useHistory.getState().entries;
    expect(entries).toHaveLength(1);
    expect(entries[0]!.mediaId).toBe('a');
    expect(entries[0]!.durationPlayed).toBe(20);
    expect(entries[0]!.endedAt).toBeDefined();
    expect(entries[0]!.item.title).toBe('Title a');
    expect(entries[0]!.completionPercentage).toBe(13); // 25 s of 200 s
  });

  it('pauses do not count and do not split the entry', async () => {
    load(item('a'));
    usePlayback.setState({ status: 'playing' });
    playFor(6);
    usePlayback.setState({ status: 'paused' });
    t += 60_000;
    usePlayback.setState({ status: 'playing' });
    playFor(4);
    stop?.();
    stop = null;
    await flush();
    const entries = useHistory.getState().entries;
    expect(entries).toHaveLength(1);
    expect(entries[0]!.durationPlayed).toBe(10);
  });

  it('live streams get no completion percentage', async () => {
    load(item('radio', { playbackType: 'radio', duration: null }));
    usePlayback.setState({ status: 'playing', isLive: true });
    usePlaybackClock.setState({ duration: Infinity });
    playFor(8);
    stop?.();
    stop = null;
    await flush();
    expect(useHistory.getState().entries[0]!.completionPercentage).toBeUndefined();
  });

  it('persists history and clears it', async () => {
    load(item('a'));
    usePlayback.setState({ status: 'playing' });
    playFor(6);
    stop?.();
    stop = null;
    await flush();
    useHistory.setState({ entries: [] });
    await useHistory.getState().hydrate();
    expect(useHistory.getState().entries).toHaveLength(1);
    await useHistory.getState().clear();
    await useHistory.getState().hydrate();
    expect(useHistory.getState().entries).toHaveLength(0);
  });
});
