// Checkpoint 8: ACTIVATE LIQUE. A friend's cloud Lique (read through RLS in
// the Supabase stand-in) is validated, cached in its own database and shown
// instead of MY_LIQUE — read-only — while queue, history and device settings
// stay the viewer's; RETURN TO MY LIQUE restores MY_LIQUE exactly.
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { IDBFactory } from 'fake-indexeddb';
import { createFakeSupabase } from '../../test/fakeSupabase';
import { createSupabaseAccountProvider } from '../cloud/supabaseAccount';
import { createSupabaseFriendDirectory } from '../cloud/supabaseFriends';
import { createSupabaseProfileStore } from '../cloud/supabaseProfiles';
import { getDb, openFriendDb, ProfileNotAvailableError, resetDbForTests } from '../storage/db';
import { kv, personalRepositories, profileKvFor, repositoriesFor } from '../storage/repository';
import { getActiveScope, MY_LIQUE, ProfileScopeError, scopeId, setActiveScope } from '../storage/scope';
import { PROFILE_FORMAT } from '../profile/profile';
import { LIQUEAMP_DEFAULT, BUILTIN_THEMES } from '../themes/builtin';
import { deriveColors } from '../themes/base16';
import { reloadProfileStores } from '../../stores/reloadProfileStores';
import { useAccount } from '../../stores/accountStore';
import { useFriends } from '../../stores/friendsStore';
import { pickSettings, useSettings } from '../../stores/settingsStore';
import { useThemes } from '../../stores/themeStore';
import { useLibrary } from '../../stores/libraryStore';
import { usePlaylists } from '../../stores/playlistStore';
import { myFavorites, useFavorites } from '../../stores/favoritesStore';
import { useQueue } from '../../stores/queueStore';
import { useHistory } from '../../stores/historyStore';
import { useUi } from '../../stores/uiStore';
import { FriendLiquesPanel } from '../../components/friends/FriendLiquesPanel';
import { Header } from '../../components/layout/Header';
import { accountError } from '../account/account';
import { prepareFriendLique } from './activation';
import { DEFAULT_SETTINGS, type Settings } from '../../types/settings';
import type { Category, Favorite, HistoryEntry, MediaItem, Playlist, RadioStation } from '../../types/media';
import type { LiqueAmpTheme } from '../../types/theme';

// ---- fixtures ------------------------------------------------------------------------------

const now = '2026-09-26T12:00:00.000Z';
const ME = '11111111-1111-4111-8111-111111111111';
const BOB = '22222222-2222-4222-8222-222222222222';
const CAROL = '33333333-3333-4333-8333-333333333333';
const DAVE = '44444444-4444-4444-8444-444444444444'; // not added
const EVE = '55555555-5555-4555-8555-555555555555'; // added, invalid Lique
const FRANK = '66666666-6666-4666-8666-666666666666'; // added, no Lique
const CALLBACK = 'https://thermoptic.github.io/LiqueAmp/auth/callback';
const BUILTIN_BASE16 = BUILTIN_THEMES.find((t) => t.id.startsWith('base16-'))!;

function customTheme(id: string, base09: string): LiqueAmpTheme {
  const palette = { ...LIQUEAMP_DEFAULT.palette, base09 };
  return { ...LIQUEAMP_DEFAULT, id, name: id, source: 'user', palette, colors: deriveColors(palette) };
}

interface Lique {
  settings: Partial<Settings>;
  themes: LiqueAmpTheme[];
  categories: Category[];
  media: MediaItem[];
  playlists: Playlist[];
  favorites: Favorite[];
  stations: RadioStation[];
}

function lique(owner: string, o: { themeId: string; themes: LiqueAmpTheme[]; visualizer: 'spectrum-bars' | 'waveform' | 'oscilloscope'; bass: number; glow: number; artwork: boolean }): Lique {
  const media: MediaItem = { id: `${owner}-m1`, provider: 'direct', title: `${owner} song`, sourceUrl: `https://${owner}.example/1.mp3`, playbackType: 'direct', categoryId: `${owner}-cat`, createdAt: now, updatedAt: now };
  return {
    settings: { activeThemeId: o.themeId, glowLevel: o.glow, artwork: o.artwork, visualizer: { ...DEFAULT_SETTINGS.visualizer, type: o.visualizer }, eq: { ...DEFAULT_SETTINGS.eq, bass: o.bass, preset: 'custom' } },
    themes: o.themes,
    categories: [{ id: `${owner}-cat`, name: `${owner} category`, sortOrder: 0, enabled: true }],
    media: [media],
    playlists: [{ id: `${owner}-pl`, name: `${owner} playlist`, items: [{ mediaId: media.id, addedAt: now }], createdAt: now, updatedAt: now }],
    favorites: [{ id: `station:${owner}-st`, type: 'station', refId: `${owner}-st`, addedAt: now }],
    stations: [{ id: `${owner}-st`, name: `${owner} radio`, streamUrl: `https://${owner}.example/radio.mp3`, genre: [], tags: [] }],
  };
}

const OWN = lique('own', { themeId: 'own-theme', themes: [customTheme('own-theme', '#ff7a3d')], visualizer: 'spectrum-bars', bass: 0, glow: 1, artwork: false });
const BOB_LIQUE = lique('bob', { themeId: 'bob-theme', themes: [customTheme('bob-theme', '#12ab34')], visualizer: 'waveform', bass: 6, glow: 0.5, artwork: true });
const CAROL_LIQUE = lique('carol', { themeId: BUILTIN_BASE16.id, themes: [], visualizer: 'oscilloscope', bass: -4, glow: 0.2, artwork: true });
const DEVICE = { volume: 0.3, muted: true, shuffle: true, repeat: 'all' as const, motion: 'reduced' as const };
const ownQueue = { entries: [{ entryId: 'e1', item: OWN.media[0] }], currentId: 'e1', history: [], played: [] };
const ownHistory: HistoryEntry = { id: 'h-own', mediaId: 'own-m1', startedAt: now, durationPlayed: 60, item: OWN.media[0]! };

const profileText = (owner: string, l: Lique, meta: Record<string, unknown> = {}) =>
  JSON.stringify({
    format: PROFILE_FORMAT,
    meta: { schemaVersion: 1, ownerUserId: owner, revision: 1, updatedAt: now, visibility: 'PRIVATE', ...meta },
    data: { settings: l.settings, themes: l.themes, categories: l.categories, media: l.media, playlists: l.playlists, favorites: l.favorites, stations: l.stations },
  });

type Fake = ReturnType<typeof createFakeSupabase>;

async function account(fake: Fake, id: string, username: string, text?: string) {
  fake.signInAs(id, 'github');
  await createSupabaseAccountProvider(fake.client, { redirectTo: () => CALLBACK }).claimUsername(username);
  if (text) await createSupabaseProfileStore(fake.client).upload(id, { text, summary: {} as never, expectedRevision: 0 });
}

async function seedOwn() {
  await kv.set('settings', DEVICE);
  await profileKvFor(MY_LIQUE).set('settings', OWN.settings);
  await kv.set('queue', ownQueue);
  const r = repositoriesFor(MY_LIQUE);
  await r.themes.putMany(OWN.themes);
  await r.categories.putMany(OWN.categories);
  await r.media.putMany(OWN.media);
  await r.playlists.putMany(OWN.playlists);
  await r.favorites.putMany(OWN.favorites);
  await r.stations.putMany(OWN.stations);
  await personalRepositories.history.put(ownHistory);
}

/** Every record of the own database (MY_LIQUE, queue, history, device settings). */
async function dumpOwn() {
  const db = (await getDb())!;
  const out: Record<string, unknown> = {};
  for (const name of db.objectStoreNames) {
    const keys = await db.getAllKeys(name);
    const values = await db.getAll(name);
    out[name] = keys.map((k, i) => [String(k), values[i]]);
  }
  return out;
}

async function dumpFriend(userId: string) {
  const db = await openFriendDb(userId, { create: false });
  const out: Record<string, unknown> = {};
  for (const name of db.objectStoreNames) out[name] = await db.getAll(name);
  return out;
}

async function hasFriendDb(userId: string) {
  return openFriendDb(userId, { create: false }).then(
    () => true,
    (err: unknown) => (err instanceof ProfileNotAvailableError ? false : Promise.reject(err)),
  );
}

/** What the app shows right now. */
function shown() {
  const s = useSettings.getState();
  return {
    scope: scopeId(getActiveScope()),
    activeThemeId: s.activeThemeId,
    theme: useThemes.getState().getTheme(s.activeThemeId).palette.base09,
    glowLevel: s.glowLevel,
    artwork: s.artwork,
    visualizer: s.visualizer.type,
    bass: s.eq.bass,
    themes: useThemes.getState().themes.filter((t) => t.source !== 'builtin').map((t) => t.id),
    categories: useLibrary.getState().categories.map((c) => c.id),
    media: useLibrary.getState().media.map((m) => m.id),
    playlists: usePlaylists.getState().playlists.map((p) => p.id),
    favorites: useFavorites.getState().favorites.map((f) => f.id),
    stations: Object.keys(useFavorites.getState().stations),
  };
}

/** The viewer's personal and device state. */
function personal() {
  const s = useSettings.getState();
  return {
    queue: useQueue.getState().entries.map((e) => e.entryId),
    current: useQueue.getState().currentId,
    history: useHistory.getState().entries.map((h) => h.id),
    volume: s.volume,
    muted: s.muted,
    shuffle: s.shuffle,
    repeat: s.repeat,
    motion: s.motion,
  };
}

const settle = () => act(() => new Promise((r) => setTimeout(r, 10)));

/** Me with years of local LiqueAmp, signed in; Bob, Carol, Eve and Frank added; Dave exists but was not added. */
async function world() {
  const fake = createFakeSupabase();
  await account(fake, BOB, 'Bob', profileText(BOB, BOB_LIQUE));
  await account(fake, CAROL, 'Carol', profileText(CAROL, CAROL_LIQUE));
  await account(fake, DAVE, 'Dave', profileText(DAVE, BOB_LIQUE));
  await account(fake, EVE, 'Eve', JSON.stringify({ format: PROFILE_FORMAT, meta: { ownerUserId: EVE }, data: { settings: 'broken' } }));
  await account(fake, FRANK, 'Frank');
  await account(fake, ME, 'Johan');
  const directory = createSupabaseFriendDirectory(fake.client);
  for (const name of ['Bob', 'Carol', 'Eve', 'Frank']) await directory.add(name);
  await seedOwn();
  await reloadProfileStores();
  await Promise.all([useQueue.getState().hydrate(), useHistory.getState().hydrate()]);
  useFriends.getState().setDirectory(directory);
  await act(() => useAccount.getState().init(createSupabaseAccountProvider(fake.client, { redirectTo: () => CALLBACK })));
  await useFriends.getState().load(ME);
  return { fake, directory };
}

const activate = (id: string) => act(() => useFriends.getState().activate(id));

/** Makes reads of one object store in friend databases fail (a storage error while switching). */
function failFriendReads(store: string) {
  const getAll = IDBObjectStore.prototype.getAll;
  return vi.spyOn(IDBObjectStore.prototype, 'getAll').mockImplementation(function (this: IDBObjectStore, ...args: Parameters<IDBObjectStore['getAll']>) {
    if (this.name === store && this.transaction.db.name.startsWith('liqueamp-friend:')) throw new DOMException('disk error', 'UnknownError');
    return getAll.apply(this, args);
  });
}
const returnHome = () => act(() => useFriends.getState().returnToMyLique());

beforeAll(() => {
  HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) {
    this.open = true;
  };
  HTMLDialogElement.prototype.close ??= function (this: HTMLDialogElement) {
    this.open = false;
  };
});

beforeEach(async () => {
  await resetDbForTests();
  globalThis.indexedDB = new IDBFactory();
  localStorage.clear();
  sessionStorage.clear();
  setActiveScope(MY_LIQUE);
  useFriends.setState({ active: null, activation: { status: 'idle' } });
  useFriends.getState().setDirectory(null);
  useSettings.setState({ ...DEFAULT_SETTINGS, hydrated: false, profileScope: MY_LIQUE });
  useThemes.setState({ scope: MY_LIQUE });
  useLibrary.setState({ scope: MY_LIQUE, categories: [], media: [] });
  usePlaylists.setState({ scope: MY_LIQUE, playlists: [] });
  useFavorites.setState({ scope: MY_LIQUE, favorites: [], stations: {}, own: null });
  useUi.setState({ toasts: [] });
});

afterEach(async () => {
  cleanup();
  await settle();
  setActiveScope(MY_LIQUE);
});

// ---- activation --------------------------------------------------------------------------------

describe('ACTIVATE LIQUE', () => {
  it('1–8. the friend’s Lique becomes the source of every profile-scoped thing', async () => {
    await world();
    const mine = shown();
    expect(mine).toMatchObject({ scope: 'own', activeThemeId: 'own-theme', visualizer: 'spectrum-bars', playlists: ['own-pl'] });
    await activate(BOB);

    expect(useFriends.getState().active).toEqual({ userId: BOB, username: 'Bob', source: 'cloud' }); // 1
    expect(useFriends.getState().activation).toEqual({ status: 'idle' });
    expect(shown()).toEqual({
      scope: `friend:${BOB}`,
      activeThemeId: 'bob-theme', // 2 theme
      theme: '#12ab34', // 3 Bob's custom Base16 palette
      glowLevel: 0.5,
      artwork: true,
      visualizer: 'waveform', // 4
      bass: 6, // 5 EQ
      themes: ['bob-theme'],
      categories: ['bob-cat'], // 7
      media: ['bob-m1'], // 8 streams
      playlists: ['bob-pl'], // 6
      favorites: ['station:bob-st'],
      stations: ['bob-st'], // 8 stations
    });
  });

  it('3. a friend’s built-in Base16 theme becomes active as well', async () => {
    await world();
    await activate(CAROL);
    expect(useSettings.getState().activeThemeId).toBe(BUILTIN_BASE16.id);
    expect(useThemes.getState().getTheme(BUILTIN_BASE16.id).palette).toEqual(BUILTIN_BASE16.palette);
    expect(shown()).toMatchObject({ visualizer: 'oscilloscope', bass: -4, playlists: ['carol-pl'] });
  });

  it('9–13. MY_LIQUE, queue, history and device settings are untouched by activating', async () => {
    await world();
    const ownBefore = await dumpOwn();
    const personalBefore = personal();
    expect(personalBefore).toEqual({ queue: ['e1'], current: 'e1', history: ['h-own'], volume: 0.3, muted: true, shuffle: true, repeat: 'all', motion: 'reduced' });
    await activate(BOB);
    expect(personal()).toEqual(personalBefore); // 10–13
    expect(await dumpOwn()).toEqual(ownBefore); // 9
    // the friend's database holds profile data only — no queue, history or device settings
    const friend = await dumpFriend(BOB);
    expect(Object.keys(friend).sort()).toEqual(['categories', 'favorites', 'kv', 'media', 'playlists', 'stations', 'themes']);
  });

  it('14. every write to the friend’s Lique is refused, before anything changes — locally and in the cloud', async () => {
    const { fake } = await world();
    await activate(BOB);
    const friendBefore = await dumpFriend(BOB);
    const cloudBefore = JSON.stringify(fake.tables.profiles);
    const shownBefore = shown();

    await expect(useThemes.getState().saveTheme(customTheme('stolen', '#000000'))).rejects.toBeInstanceOf(ProfileScopeError);
    await expect(useThemes.getState().deleteTheme('bob-theme')).rejects.toBeInstanceOf(ProfileScopeError);
    await expect(usePlaylists.getState().rename('bob-pl', 'Mine now')).rejects.toBeInstanceOf(ProfileScopeError);
    await expect(usePlaylists.getState().create('New')).rejects.toBeInstanceOf(ProfileScopeError);
    await expect(usePlaylists.getState().addItems('bob-pl', OWN.media)).rejects.toBeInstanceOf(ProfileScopeError);
    await expect(useLibrary.getState().addCategory('New')).rejects.toBeInstanceOf(ProfileScopeError);
    await expect(useLibrary.getState().deleteCategory('bob-cat')).rejects.toBeInstanceOf(ProfileScopeError);
    await expect(useLibrary.getState().updateMedia('bob-m1', { title: 'renamed' })).rejects.toBeInstanceOf(ProfileScopeError);
    await expect(useLibrary.getState().addMedia(OWN.media)).rejects.toBeInstanceOf(ProfileScopeError);
    await expect(useFavorites.getState().remove('station', 'bob-st')).rejects.toBeInstanceOf(ProfileScopeError);
    const reported = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    act(() => useSettings.getState().update({ activeThemeId: 'amber-night', visualizer: { ...DEFAULT_SETTINGS.visualizer, type: 'spectrum-bars' }, eq: { ...DEFAULT_SETTINGS.eq, bass: 0 } }));
    expect(reported).toHaveBeenCalledWith('Profile settings were not saved:', expect.any(ProfileScopeError));
    reported.mockRestore();
    expect(useUi.getState().toasts.map((t) => t.message)).toEqual(['This Friend Lique is read-only. Return to My Lique to change your own.']);
    await settle();

    expect(shown()).toEqual(shownBefore); // not even on screen
    expect(await dumpFriend(BOB)).toEqual(friendBefore);
    expect(JSON.stringify(fake.tables.profiles)).toBe(cloudBefore); // nothing uploaded anywhere
  });

  it('device settings still change in a Friend Lique, and they are the viewer’s', async () => {
    await world();
    await activate(BOB);
    act(() => useSettings.getState().update({ volume: 0.9, shuffle: false }));
    await settle();
    expect(useSettings.getState()).toMatchObject({ volume: 0.9, shuffle: false, activeThemeId: 'bob-theme' });
    await returnHome();
    expect(useSettings.getState()).toMatchObject({ volume: 0.9, shuffle: false, activeThemeId: 'own-theme' });
    expect(await kv.get('settings')).toMatchObject({ volume: 0.9, shuffle: false });
  });

  it('15. adding a friend’s stream to the queue changes MY queue', async () => {
    await world();
    await activate(BOB);
    act(() => useQueue.getState().add([BOB_LIQUE.media[0]!]));
    await settle();
    expect(useQueue.getState().entries.map((e) => e.item.id)).toEqual(['own-m1', 'bob-m1']);
    expect(((await kv.get<typeof ownQueue>('queue'))?.entries ?? []).map((e) => e.item!.id)).toEqual(['own-m1', 'bob-m1']);
    await returnHome();
    expect(useQueue.getState().entries.map((e) => e.item.id)).toEqual(['own-m1', 'bob-m1']); // still mine after returning
  });

  it('16. favouriting a friend’s station or stream changes MY favourites, never theirs', async () => {
    await world();
    await activate(BOB);
    const friendBefore = await dumpFriend(BOB);
    expect(await act(() => useFavorites.getState().toggleOwnStation(BOB_LIQUE.stations[0]!))).toBe(true);
    expect(await act(() => useFavorites.getState().toggleOwnItem(BOB_LIQUE.media[0]!))).toBe(true);

    // shown: still Bob's favourites; the hearts: mine
    expect(useFavorites.getState().favorites.map((f) => f.id)).toEqual(['station:bob-st']);
    expect(myFavorites(useFavorites.getState()).map((f) => f.id).sort()).toEqual(['media:bob-m1', 'station:bob-st', 'station:own-st']);
    // stored: MY_LIQUE has them (with the station record and the one media item), Bob's copy is unchanged
    const own = repositoriesFor(MY_LIQUE);
    expect((await own.favorites.getAll()).map((f) => f.id).sort()).toEqual(['media:bob-m1', 'station:bob-st', 'station:own-st']);
    expect((await own.stations.getAll()).map((s) => s.id).sort()).toEqual(['bob-st', 'own-st']);
    expect((await own.media.getAll()).map((m) => m.id).sort()).toEqual(['bob-m1', 'own-m1']);
    expect((await own.playlists.getAll()).map((p) => p.id)).toEqual(['own-pl']); // nothing else was copied
    expect(await dumpFriend(BOB)).toEqual(friendBefore);

    // and back in MY_LIQUE they are my favourites
    await returnHome();
    expect(useFavorites.getState().favorites.map((f) => f.id).sort()).toEqual(['media:bob-m1', 'station:bob-st', 'station:own-st']);
    // unfavouriting works the same way
    await activate(BOB);
    expect(await act(() => useFavorites.getState().toggleOwnStation(BOB_LIQUE.stations[0]!))).toBe(false);
    expect((await own.favorites.getAll()).map((f) => f.id).sort()).toEqual(['media:bob-m1', 'station:own-st']);
  });
});

// ---- return ---------------------------------------------------------------------------------------

describe('RETURN TO MY LIQUE', () => {
  it('17–19. restores MY_LIQUE exactly: own settings, theme and content; no friend data remains', async () => {
    await world();
    const shownBefore = shown();
    const settingsBefore = pickSettings(useSettings.getState());
    const ownBefore = await dumpOwn();
    await activate(BOB);
    await returnHome();

    expect(useFriends.getState().active).toBeNull();
    expect(getActiveScope()).toBe(MY_LIQUE);
    expect(shown()).toEqual(shownBefore); // 17
    expect(pickSettings(useSettings.getState())).toEqual(settingsBefore); // 18: every setting, exactly
    expect(JSON.stringify({ ...shown(), stores: [useThemes.getState().themes, useLibrary.getState(), usePlaylists.getState().playlists, useFavorites.getState()] })).not.toContain('bob'); // 19
    expect(await dumpOwn()).toEqual(ownBefore);
    expect([useSettings.getState().profileScope, useThemes.getState().scope, useLibrary.getState().scope, usePlaylists.getState().scope, useFavorites.getState().scope]).toEqual(Array(5).fill(MY_LIQUE));
    // own editing works again
    await usePlaylists.getState().rename('own-pl', 'Renamed');
    expect((await repositoriesFor(MY_LIQUE).playlists.get('own-pl'))?.name).toBe('Renamed');
  });

  it('20–21. another friend can be activated afterwards, or directly; only one is ever active', async () => {
    await world();
    await activate(BOB);
    await returnHome();
    await activate(CAROL); // 20
    expect(shown()).toMatchObject({ scope: `friend:${CAROL}`, playlists: ['carol-pl'] });
    await activate(BOB); // 21: straight from Carol to Bob
    expect(useFriends.getState().active?.userId).toBe(BOB);
    expect(shown()).toMatchObject({ scope: `friend:${BOB}`, playlists: ['bob-pl'], categories: ['bob-cat'], stations: ['bob-st'] });
    expect(JSON.stringify(shown())).not.toContain('carol');
  });

  it('rapid switching applies each step completely, in order, and corrupts nothing', async () => {
    await world();
    const ownBefore = await dumpOwn();
    const shownBefore = shown();
    await act(async () => {
      const steps = [useFriends.getState().activate(BOB), useFriends.getState().activate(CAROL), useFriends.getState().returnToMyLique(), useFriends.getState().activate(BOB), useFriends.getState().returnToMyLique()];
      await Promise.all(steps);
    });
    expect(useFriends.getState().active).toBeNull();
    expect(shown()).toEqual(shownBefore);
    expect(await dumpOwn()).toEqual(ownBefore);
    expect((await dumpFriend(BOB)).playlists).toEqual(BOB_LIQUE.playlists);
    expect((await dumpFriend(CAROL)).playlists).toEqual(CAROL_LIQUE.playlists);
  });
});

// ---- refused activations -------------------------------------------------------------------------

describe('activation is refused safely', () => {
  it('22. someone I have not added cannot be activated — neither from the list nor by a stale entry', async () => {
    await world();
    const ownBefore = await dumpOwn();
    await activate(DAVE);
    expect(useFriends.getState().activation).toEqual({ status: 'error', friendId: DAVE, message: 'Add them first to activate their Lique.' });
    // a stale list claims Dave: the server (RLS) still refuses his Lique
    useFriends.setState({ friends: [...useFriends.getState().friends, { userId: DAVE, username: 'Dave', addedAt: now }] });
    await activate(DAVE);
    expect(useFriends.getState().activation).toMatchObject({ status: 'error', friendId: DAVE });
    expect(getActiveScope()).toBe(MY_LIQUE);
    expect(useFriends.getState().active).toBeNull();
    expect(await hasFriendDb(DAVE)).toBe(false); // no empty database was created
    expect(await dumpOwn()).toEqual(ownBefore);
  });

  it('23. an invalid or missing Lique is not activated; MY_LIQUE stays, nothing is created', async () => {
    await world();
    const shownBefore = shown();
    await activate(EVE);
    expect(useFriends.getState().activation).toEqual({ status: 'error', friendId: EVE, message: 'Their Lique could not be read, so it was not activated.' });
    await activate(FRANK);
    expect(useFriends.getState().activation).toMatchObject({ status: 'error', friendId: FRANK });
    expect(shown()).toEqual(shownBefore);
    expect(await hasFriendDb(EVE)).toBe(false);
    expect(await hasFriendDb(FRANK)).toBe(false);
  });

  it('a Lique that fails while being switched to leaves MY_LIQUE fully in place (all or nothing)', async () => {
    await world();
    const shownBefore = shown();
    const failing = failFriendReads('playlists'); // the friend's copy cannot be read while switching
    await activate(BOB);
    failing.mockRestore();
    expect(useFriends.getState().activation).toMatchObject({ status: 'error', message: 'Their Lique could not be loaded, so nothing was switched.' });
    expect(useFriends.getState().active).toBeNull();
    expect(getActiveScope()).toBe(MY_LIQUE);
    expect(shown()).toEqual(shownBefore);
  });
});

// ---- offline, refresh, logout, removal --------------------------------------------------------------------

describe('session safety', () => {
  it('offline: a copy validated earlier can be activated; one never fetched cannot, and nothing is created', async () => {
    const { fake } = await world();
    await activate(BOB);
    await returnHome();
    fake.setOffline(true);
    await activate(BOB);
    expect(useFriends.getState().active).toEqual({ userId: BOB, username: 'Bob', source: 'cache' });
    expect(shown()).toMatchObject({ playlists: ['bob-pl'], activeThemeId: 'bob-theme' });
    await returnHome();
    await activate(CAROL);
    expect(useFriends.getState().activation).toEqual({ status: 'error', friendId: CAROL, message: 'You’re offline and their Lique isn’t available on this device yet.' });
    expect(getActiveScope()).toBe(MY_LIQUE);
    expect(await hasFriendDb(CAROL)).toBe(false);
  });

  it('24. refresh: the active Lique is never stored, so a reload always starts in MY_LIQUE', async () => {
    await world();
    await activate(BOB);
    const ownDump = JSON.stringify(await dumpOwn());
    expect(ownDump).not.toContain(BOB); // nothing about the activation in the own database
    expect(JSON.stringify({ ...localStorage })).not.toContain(BOB);
    expect(JSON.stringify({ ...sessionStorage })).not.toContain(BOB);
    vi.resetModules();
    const fresh = await import('../storage/scope');
    expect(fresh.getActiveScope()).toEqual({ kind: 'own' }); // what a reload starts with
    const freshFriends = await import('../../stores/friendsStore');
    expect(freshFriends.useFriends.getState().active).toBeNull();
  });

  it('25. logging out while a Friend Lique is active returns to MY_LIQUE', async () => {
    await world();
    const shownBefore = shown();
    await activate(BOB);
    await act(() => useAccount.getState().signOut());
    await settle();
    expect(useFriends.getState().active).toBeNull();
    expect(getActiveScope()).toBe(MY_LIQUE);
    expect(shown()).toEqual(shownBefore);
    expect(useFriends.getState().friends).toEqual([]);
  });

  it('removing the active friend returns to MY_LIQUE and deletes their local copy', async () => {
    await world();
    await activate(BOB);
    await act(() => useFriends.getState().remove(BOB));
    expect(useFriends.getState().active).toBeNull();
    expect(getActiveScope()).toBe(MY_LIQUE);
    expect(await hasFriendDb(BOB)).toBe(false);
  });

  it('a friend removed elsewhere is noticed on the next list load: back to MY_LIQUE', async () => {
    const { directory } = await world();
    await activate(BOB);
    await directory.remove(BOB); // e.g. on another device
    await act(() => useFriends.getState().load(ME));
    expect(useFriends.getState().active).toBeNull();
    expect(getActiveScope()).toBe(MY_LIQUE);
  });
});

// ---- the panel -----------------------------------------------------------------------------------------------

describe('the FRIEND LIQUES panel', () => {
  it('Activate → FRIEND LIQUE ACTIVE @Bob with RETURN TO MY LIQUE → back', async () => {
    await world();
    render(
      <MemoryRouter>
        <FriendLiquesPanel />
      </MemoryRouter>,
    );
    const panel = () => screen.getByRole('region', { name: 'Friend Liques' });
    await act(async () => fireEvent.click(await within(panel()).findByRole('button', { name: '@Bob' })));
    const preview = screen.getByRole('region', { name: '@Bob’s Lique' });
    await act(async () => fireEvent.click(within(preview).getByRole('button', { name: 'Activate Lique' })));
    await act(() => new Promise((r) => setTimeout(r, 50))); // fetch, validate, cache, switch
    const banner = panel().querySelector<HTMLElement>('.friend-lique-active')!;
    expect(banner.getAttribute('role')).toBe('status');
    expect(banner.textContent).toContain('FRIEND LIQUE ACTIVE');
    expect(banner.textContent).toContain('@Bob');
    expect(within(preview).getByText('ACTIVE')).toBeTruthy();
    await act(async () => fireEvent.click(within(banner).getByRole('button', { name: 'Return to My Lique' })));
    await settle();
    expect(useFriends.getState().active).toBeNull();
    expect(within(panel()).queryByText('FRIEND LIQUE ACTIVE')).toBeNull();
    expect(useSettings.getState().activeThemeId).toBe('own-theme');
  });

  it('an activation error is shown in the preview and MY_LIQUE stays', async () => {
    await world();
    render(
      <MemoryRouter>
        <FriendLiquesPanel />
      </MemoryRouter>,
    );
    const panel = () => screen.getByRole('region', { name: 'Friend Liques' });
    await act(async () => fireEvent.click(await within(panel()).findByRole('button', { name: '@Eve' })));
    const preview = screen.getByRole('region', { name: '@Eve’s Lique' });
    await act(async () => fireEvent.click(within(preview).getByRole('button', { name: 'Activate Lique' })));
    await settle();
    expect(within(preview).getAllByRole('alert').map((e) => e.textContent)).toContain('Their Lique could not be read, so it was not activated.');
    expect(within(panel()).queryByText('FRIEND LIQUE ACTIVE')).toBeNull();
  });
});

// ---- checkpoint 9: lifecycle ------------------------------------------------------------------------------------

/** Every profile store, the active scope and the active friend agree on one profile. */
function expectEverywhere(scope: 'own' | string, active: string | null) {
  const id = scope === 'own' ? 'own' : `friend:${scope}`;
  expect({
    active: scopeId(getActiveScope()),
    settings: scopeId(useSettings.getState().profileScope),
    themes: scopeId(useThemes.getState().scope),
    library: scopeId(useLibrary.getState().scope),
    playlists: scopeId(usePlaylists.getState().scope),
    favorites: scopeId(useFavorites.getState().scope),
    friend: useFriends.getState().active?.userId ?? null,
  }).toEqual({ active: id, settings: id, themes: id, library: id, playlists: id, favorites: id, friend: active });
}

describe('checkpoint 9 — lifecycle', () => {
  it('1–3, 11–12. MY → A → B → A → MY: every store follows each step; neither side is contaminated', async () => {
    await world();
    const ownBefore = await dumpOwn();
    const ownShown = shown();
    expectEverywhere('own', null);

    await activate(BOB);
    expectEverywhere(BOB, BOB);
    const bobCopy = await dumpFriend(BOB);
    expect(await dumpOwn()).toEqual(ownBefore);

    await activate(CAROL);
    expectEverywhere(CAROL, CAROL);
    expect(shown()).toMatchObject({ playlists: ['carol-pl'], activeThemeId: BUILTIN_BASE16.id });
    expect(await dumpOwn()).toEqual(ownBefore);

    await activate(BOB);
    expectEverywhere(BOB, BOB);
    expect(shown()).toMatchObject({ playlists: ['bob-pl'], activeThemeId: 'bob-theme' });
    expect(JSON.stringify(shown())).not.toContain('carol');

    await returnHome();
    expectEverywhere('own', null);
    expect(shown()).toEqual(ownShown);
    expect(await dumpOwn()).toEqual(ownBefore); // 11: no friend data in MY_LIQUE
    // 12: no own data in a friend scope; re-fetching wrote the same copy again
    const bobNow = await dumpFriend(BOB);
    expect(bobNow.playlists).toEqual(bobCopy.playlists);
    expect(bobNow.media).toEqual(bobCopy.media);
    expect(JSON.stringify(bobNow)).not.toContain('own-');
    expect(JSON.stringify(await dumpFriend(CAROL))).not.toContain('own-');
  });

  it('a switch is shown in one step: no render ever mixes two profiles, and the banner comes with the content', async () => {
    await world();
    const renders: string[] = [];
    function Probe() {
      const scopes = [useSettings((s) => s.profileScope), useThemes((s) => s.scope), useLibrary((s) => s.scope), usePlaylists((s) => s.scope), useFavorites((s) => s.scope)].map(scopeId);
      const theme = useSettings((s) => s.activeThemeId);
      const playlists = usePlaylists((s) => s.playlists.map((p) => p.id).join());
      const active = useFriends((s) => s.active?.userId ?? 'none');
      renders.push(`${[...new Set(scopes)].join('|')} ${theme} ${playlists} ${active}`);
      return null;
    }
    render(<Probe />);
    await activate(BOB);
    await activate(CAROL);
    await returnHome();
    const consistent = [`own own-theme own-pl none`, `friend:${BOB} bob-theme bob-pl ${BOB}`, `friend:${CAROL} ${BUILTIN_BASE16.id} carol-pl ${CAROL}`];
    expect(renders.filter((r) => !consistent.includes(r))).toEqual([]);
    expect(renders.at(-1)).toBe('own own-theme own-pl none');
  });

  it('a failed switch from one friend to another keeps the first friend fully shown', async () => {
    await world();
    await activate(BOB);
    await returnHome();
    await activate(CAROL);
    const failing = failFriendReads('themes');
    await activate(BOB);
    failing.mockRestore();
    expectEverywhere(CAROL, CAROL);
    expect(useFriends.getState().activation).toMatchObject({ status: 'error', friendId: BOB, message: 'Their Lique could not be loaded, so nothing was switched.' });
  });

  it('a failed return keeps the Friend Lique shown and says so; retrying works', async () => {
    await world();
    await activate(BOB);
    const getAll = IDBObjectStore.prototype.getAll;
    const failing = vi.spyOn(IDBObjectStore.prototype, 'getAll').mockImplementation(function (this: IDBObjectStore, ...args: Parameters<IDBObjectStore['getAll']>) {
      if (this.name === 'playlists' && this.transaction.db.name === 'liqueamp') throw new DOMException('disk error', 'UnknownError');
      return getAll.apply(this, args);
    });
    await returnHome();
    failing.mockRestore();
    expectEverywhere(BOB, BOB); // not half-switched
    expect(useFriends.getState().activation).toEqual({ status: 'error', friendId: BOB, message: 'Your own Lique could not be loaded just now. Try Return to My Lique again.' });
    await returnHome();
    expectEverywhere('own', null);
  });

  it('4. logout: the Friend Lique ends BEFORE the session does; this account’s friend copies go; own data stays', async () => {
    const { fake } = await world();
    const ownBefore = await dumpOwn();
    await activate(BOB);
    await activate(CAROL);
    let scopeAtSignOut = '';
    const signOut = fake.client.auth.signOut;
    fake.client.auth.signOut = (options) => {
      scopeAtSignOut = scopeId(getActiveScope());
      return signOut(options);
    };
    await act(() => useAccount.getState().signOut());
    await settle();
    expect(scopeAtSignOut).toBe('own');
    expectEverywhere('own', null);
    expect(useFriends.getState()).toMatchObject({ friends: [], userId: null, selectedId: null, activation: { status: 'idle' } });
    expect(await hasFriendDb(BOB)).toBe(false);
    expect(await hasFriendDb(CAROL)).toBe(false);
    expect(await dumpOwn()).toEqual(ownBefore);
  });

  it('5. another account signing in: back to MY_LIQUE; nothing of the first account’s friends is inherited', async () => {
    const { fake } = await world();
    await activate(BOB);
    act(() => fake.signInAs(DAVE, 'google')); // a different account's session appears (e.g. from another tab)
    await settle();
    await settle();
    expectEverywhere('own', null);
    expect(useFriends.getState().friends.map((f) => f.userId)).not.toContain(BOB);
    expect(await hasFriendDb(BOB)).toBe(false);
  });

  it('a session that expires while a Friend Lique is shown returns to MY_LIQUE as well', async () => {
    const { fake } = await world();
    await activate(BOB);
    act(() => fake.expireSession());
    await settle();
    await settle();
    expectEverywhere('own', null);
  });

  it('logging out while an activation is still loading never leaves the Friend Lique active', async () => {
    await world();
    await act(async () => {
      const activating = useFriends.getState().activate(BOB);
      const loggingOut = useAccount.getState().signOut();
      await Promise.all([activating, loggingOut]);
    });
    await settle();
    expectEverywhere('own', null);
    expect(await hasFriendDb(BOB)).toBe(false);
  });

  it('6. removing a friend while their activation is still loading: not active, local copy gone', async () => {
    await world();
    await act(async () => {
      const activating = useFriends.getState().activate(BOB);
      const removing = useFriends.getState().remove(BOB);
      await Promise.all([activating, removing]);
    });
    expectEverywhere('own', null);
    expect(await hasFriendDb(BOB)).toBe(false);
    expect(useFriends.getState().friends.map((f) => f.userId)).not.toContain(BOB);
  });

  it('8. a local copy is only used offline by the account that fetched it', async () => {
    const { directory } = await world();
    await activate(BOB);
    await returnHome();
    const offline = { ...directory, readProfile: () => Promise.reject(accountError('offline')) };
    await expect(prepareFriendLique(offline, BOB, ME)).resolves.toEqual({ source: 'cache' });
    await expect(prepareFriendLique(offline, BOB, DAVE)).rejects.toMatchObject({ code: 'offline-unavailable' });
  });

  it('9. access revoked since the last visit: not activated, and the old local copy is deleted', async () => {
    const { directory } = await world();
    await activate(BOB);
    await returnHome();
    expect(await hasFriendDb(BOB)).toBe(true);
    await directory.remove(BOB); // e.g. removed on another device; this list still shows Bob
    await activate(BOB);
    expect(useFriends.getState().activation).toMatchObject({ status: 'error', friendId: BOB, message: expect.stringContaining('isn’t shared with you') });
    expectEverywhere('own', null);
    expect(await hasFriendDb(BOB)).toBe(false);
  });

  it('10. more mutation paths of a Friend Lique are refused: reorder, remove item, duplicate, category order, media removal, playlist favourite', async () => {
    await world();
    await activate(BOB);
    const friendBefore = await dumpFriend(BOB);
    const ownBefore = await dumpOwn();
    await expect(usePlaylists.getState().moveItem('bob-pl', 0, 1)).rejects.toBeInstanceOf(ProfileScopeError);
    await expect(usePlaylists.getState().removeItem('bob-pl', 0)).rejects.toBeInstanceOf(ProfileScopeError);
    await expect(usePlaylists.getState().remove('bob-pl')).rejects.toBeInstanceOf(ProfileScopeError);
    await expect(useThemes.getState().duplicateTheme('bob-theme')).rejects.toBeInstanceOf(ProfileScopeError);
    await expect(useThemes.getState().renameTheme('bob-theme', 'x')).rejects.toBeInstanceOf(ProfileScopeError);
    await expect(useLibrary.getState().moveCategory('bob-cat', 1)).rejects.toBeInstanceOf(ProfileScopeError);
    await expect(useLibrary.getState().setCategoryEnabled('bob-cat', false)).rejects.toBeInstanceOf(ProfileScopeError);
    await expect(useLibrary.getState().removeMedia('bob-m1')).rejects.toBeInstanceOf(ProfileScopeError);
    await expect(useFavorites.getState().togglePlaylist('bob-pl')).rejects.toBeInstanceOf(ProfileScopeError);
    expect(await dumpFriend(BOB)).toEqual(friendBefore);
    expect(await dumpOwn()).toEqual(ownBefore);
    expect(shown()).toMatchObject({ playlists: ['bob-pl'], categories: ['bob-cat'], media: ['bob-m1'] });
  });

  it('the header shows FRIEND LIQUE ACTIVE @Bob · READ ONLY with the way back, only while one is active', async () => {
    await world();
    render(
      <MemoryRouter>
        <Header />
      </MemoryRouter>,
    );
    expect(screen.queryByText('FRIEND LIQUE ACTIVE')).toBeNull();
    await activate(BOB);
    const indicator = screen.getByRole('status', { name: 'Friend Lique active: @Bob, read only' });
    expect(indicator.textContent).toContain('FRIEND LIQUE ACTIVE');
    expect(indicator.textContent).toContain('@Bob');
    expect(indicator.textContent).toContain('READ ONLY');
    await act(async () => fireEvent.click(within(indicator).getByRole('button', { name: 'Return to My Lique' })));
    await settle();
    expectEverywhere('own', null);
    expect(screen.queryByText('FRIEND LIQUE ACTIVE')).toBeNull();
  });
});
