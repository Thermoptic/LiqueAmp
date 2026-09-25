// Checkpoint 2: profile-scoped storage and isolation.
// MY_LIQUE is the own `liqueamp` database; each friend scope is its own
// database, written only by the profile cache. These tests prove that no
// read or write can cross from one profile into another.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { DB_NAME, friendDbName, getDb, openFriendDb, ProfileNotAvailableError, resetDbForTests } from './db';
import { kv, personalRepositories, profileKvFor, repositories, repositoriesFor } from './repository';
import { getActiveScope, MY_LIQUE, ProfileScopeError, setActiveScope, type ProfileScope } from './scope';
import { useSettings } from '../../stores/settingsStore';
import { useThemes } from '../../stores/themeStore';
import { useLibrary } from '../../stores/libraryStore';
import { usePlaylists } from '../../stores/playlistStore';
import { useFavorites } from '../../stores/favoritesStore';
import { useHistory } from '../../stores/historyStore';
import { useQueue } from '../../stores/queueStore';
import { DEFAULT_SETTINGS, type Settings } from '../../types/settings';
import type { Category, Favorite, HistoryEntry, MediaItem, Playlist, RadioStation } from '../../types/media';
import type { LiqueAmpTheme } from '../../types/theme';
import { LIQUEAMP_DEFAULT } from '../themes/builtin';
import { deriveColors } from '../themes/base16';
import { applyImport, BACKUP_FORMAT, createBackup, parseBackup, planImport, type ExistingData } from '../backup/backup';
import { parseProfile, PROFILE_FORMAT } from '../profile/profile';
import { deleteFriendProfileCache, readFriendProfileCacheMeta, writeFriendProfileCache } from '../profile/profileCache';

// ---- fixtures: one distinct profile per owner ------------------------------------------

const now = '2026-09-25T12:00:00.000Z';

function theme(id: string, base09: string): LiqueAmpTheme {
  const palette = { ...LIQUEAMP_DEFAULT.palette, base09 };
  return { ...LIQUEAMP_DEFAULT, id, name: id, source: 'user', palette, colors: deriveColors(palette) };
}

interface Fixture {
  settings: Partial<Settings>;
  themes: LiqueAmpTheme[];
  categories: Category[];
  media: MediaItem[];
  playlists: Playlist[];
  favorites: Favorite[];
  stations: RadioStation[];
}

function fixture(owner: string, themeId: string, color: string): Fixture {
  const media: MediaItem = { id: `${owner}-m1`, provider: 'direct', title: `${owner} song`, sourceUrl: `https://${owner}.example/1.mp3`, playbackType: 'direct', categoryId: `${owner}-cat`, createdAt: now, updatedAt: now };
  return {
    settings: { activeThemeId: `${owner}-theme`, glowLevel: owner === 'own' ? 1 : 0.5, artwork: owner !== 'own', visualizer: { ...DEFAULT_SETTINGS.visualizer, type: owner === 'own' ? 'spectrum-bars' : 'waveform' }, eq: { ...DEFAULT_SETTINGS.eq, bass: owner === 'own' ? 0 : 6 } },
    themes: [theme(themeId, color)],
    categories: [{ id: `${owner}-cat`, name: `${owner} category`, sortOrder: 0, enabled: true }],
    media: [media],
    playlists: [{ id: `${owner}-pl`, name: `${owner} playlist`, items: [{ mediaId: media.id, addedAt: now }], createdAt: now, updatedAt: now }],
    favorites: [{ id: `station:${owner}-st`, type: 'station', refId: `${owner}-st`, addedAt: now }],
    stations: [{ id: `${owner}-st`, name: `${owner} radio`, streamUrl: `https://${owner}.example/radio.mp3`, genre: [], tags: [] }],
  };
}

const OWN = fixture('own', 'own-theme', '#ff7a3d');
const PELLE = fixture('pelle', 'pelle-theme', '#12ab34');
const ANDERS = fixture('anders', 'anders-theme', '#3456cd');
const PELLE_SCOPE: ProfileScope = { kind: 'friend', userId: 'pelle' };
const ANDERS_SCOPE: ProfileScope = { kind: 'friend', userId: 'anders' };

const ownQueue = { entries: [{ entryId: 'e1', item: OWN.media[0] }], currentId: 'e1', history: [], played: [] };
const ownHistory: HistoryEntry = { id: 'h-own', mediaId: 'own-m1', startedAt: now, durationPlayed: 60, item: OWN.media[0]! };

async function seedOwn() {
  await kv.set('settings', { volume: 0.4, muted: false, shuffle: true });
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

/** Caches a friend's profile the only sanctioned way: serialized → parseProfile → writeFriendProfileCache. */
async function cacheFriend(userId: string, f: Fixture, revision = 1) {
  const text = JSON.stringify({
    format: PROFILE_FORMAT,
    meta: { schemaVersion: 1, ownerUserId: userId, revision, updatedAt: now, visibility: 'FRIENDS' },
    data: { settings: f.settings, themes: f.themes, categories: f.categories, media: f.media, playlists: f.playlists, favorites: f.favorites, stations: f.stations },
  });
  const parsed = parseProfile(text);
  if (!parsed.ok) throw new Error(parsed.error);
  await writeFriendProfileCache(userId, parsed.profile);
}

/** Every record of the own database. */
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
  for (const name of db.objectStoreNames) {
    const keys = await db.getAllKeys(name);
    const values = await db.getAll(name);
    out[name] = keys.map((k, i) => [String(k), values[i]]);
  }
  return out;
}

async function hydrateProfileStores() {
  await Promise.all([
    useSettings.getState().hydrate(),
    useThemes.getState().hydrate(),
    useLibrary.getState().hydrate(),
    usePlaylists.getState().hydrate(),
    useFavorites.getState().hydrate(),
  ]);
}

/** What the stores currently show, as a comparable summary. */
function visible() {
  const s = useSettings.getState();
  return {
    activeThemeId: s.activeThemeId,
    glowLevel: s.glowLevel,
    artwork: s.artwork,
    visualizer: s.visualizer.type,
    bass: s.eq.bass,
    volume: s.volume,
    themes: useThemes.getState().themes.filter((t) => t.source !== 'builtin').map((t) => t.id),
    categories: useLibrary.getState().categories.map((c) => c.id),
    media: useLibrary.getState().media.map((m) => m.id),
    playlists: usePlaylists.getState().playlists.map((p) => p.id),
    favorites: useFavorites.getState().favorites.map((f) => f.id),
    stations: Object.keys(useFavorites.getState().stations),
  };
}

function expectShows(f: Fixture) {
  const v = visible();
  expect(v.activeThemeId).toBe(f.settings.activeThemeId);
  expect(v.artwork).toBe(f.settings.artwork);
  expect(v.visualizer).toBe(f.settings.visualizer!.type);
  expect(v.bass).toBe(f.settings.eq!.bass);
  expect(v.themes).toEqual(f.themes.map((t) => t.id));
  expect(v.categories).toEqual(f.categories.map((c) => c.id));
  expect(v.media).toEqual(f.media.map((m) => m.id));
  expect(v.playlists).toEqual(f.playlists.map((p) => p.id));
  expect(v.favorites).toEqual(f.favorites.map((x) => x.id));
  expect(v.stations).toEqual(f.stations.map((s) => s.id));
}

const settle = async () => {
  for (let i = 0; i < 5; i++) await new Promise((r) => setTimeout(r, 0));
};

beforeEach(async () => {
  await resetDbForTests();
  globalThis.indexedDB = new IDBFactory();
  setActiveScope(MY_LIQUE);
  useSettings.setState({ ...DEFAULT_SETTINGS, hydrated: false, profileScope: MY_LIQUE });
  useThemes.setState({ scope: MY_LIQUE });
  useLibrary.setState({ scope: MY_LIQUE, categories: [], media: [] });
  usePlaylists.setState({ scope: MY_LIQUE, playlists: [] });
  useFavorites.setState({ scope: MY_LIQUE, favorites: [], stations: {} });
});

afterEach(() => setActiveScope(MY_LIQUE));

// ---- 1 -----------------------------------------------------------------------------------

describe('1 — own profile', () => {
  it('data written to MY_LIQUE reads back the same, through repositories and through the stores', async () => {
    await seedOwn();
    const r = repositoriesFor(MY_LIQUE);
    expect(await r.themes.getAll()).toEqual(OWN.themes);
    expect(await r.categories.getAll()).toEqual(OWN.categories);
    expect(await r.media.getAll()).toEqual(OWN.media);
    expect(await r.playlists.getAll()).toEqual(OWN.playlists);
    expect(await r.favorites.getAll()).toEqual(OWN.favorites);
    expect(await r.stations.getAll()).toEqual(OWN.stations);
    expect(repositories.media).toBe(r.media); // `repositories` is the own profile, explicitly
    await hydrateProfileStores();
    expectShows(OWN);
  });
});

// ---- 2 -----------------------------------------------------------------------------------

describe('2 — a friend scope never falls back to MY_LIQUE', () => {
  it('a friend without a local profile is "not available" — nothing from the own profile is returned', async () => {
    await seedOwn();
    const friend = repositoriesFor(PELLE_SCOPE);
    for (const repo of Object.values(friend)) await expect(repo.getAll()).rejects.toBeInstanceOf(ProfileNotAvailableError);
    await expect(friend.media.get('own-m1')).rejects.toBeInstanceOf(ProfileNotAvailableError);
    await expect(profileKvFor(PELLE_SCOPE).get('settings')).rejects.toBeInstanceOf(ProfileNotAvailableError);
    await expect(readFriendProfileCacheMeta('pelle')).rejects.toBeInstanceOf(ProfileNotAvailableError);
  });

  it('asking for it does not create an empty profile database', async () => {
    await expect(repositoriesFor(PELLE_SCOPE).media.getAll()).rejects.toBeInstanceOf(ProfileNotAvailableError);
    const names = (await indexedDB.databases()).map((d) => d.name);
    expect(names).not.toContain(friendDbName('pelle'));
  });

  it('stores hydrating a friend scope that is not available fail, and keep showing the own profile', async () => {
    await seedOwn();
    await hydrateProfileStores();
    setActiveScope(PELLE_SCOPE);
    for (const hydrate of [useThemes.getState().hydrate, useLibrary.getState().hydrate, usePlaylists.getState().hydrate, useFavorites.getState().hydrate, useSettings.getState().hydrate]) {
      await expect(hydrate()).rejects.toBeInstanceOf(ProfileNotAvailableError);
    }
    expectShows(OWN);
  });
});

// ---- 3 -----------------------------------------------------------------------------------

describe('3 — friend writes are blocked', () => {
  it('every write to a friend scope is rejected, with or without a cached profile, and MY_LIQUE is unchanged', async () => {
    await seedOwn();
    await cacheFriend('pelle', PELLE);
    const ownBefore = await dumpOwn();
    const friendBefore = await dumpFriend('pelle');

    for (const scope of [PELLE_SCOPE, ANDERS_SCOPE]) {
      setActiveScope(scope);
      const r = repositoriesFor(scope);
      await expect(r.playlists.put(OWN.playlists[0]!)).rejects.toBeInstanceOf(ProfileScopeError);
      await expect(r.media.putMany(OWN.media)).rejects.toBeInstanceOf(ProfileScopeError);
      await expect(r.themes.delete('pelle-theme')).rejects.toBeInstanceOf(ProfileScopeError);
      await expect(r.categories.clear()).rejects.toBeInstanceOf(ProfileScopeError);
      await expect(r.favorites.put(OWN.favorites[0]!)).rejects.toBeInstanceOf(ProfileScopeError);
      await expect(r.stations.put(OWN.stations[0]!)).rejects.toBeInstanceOf(ProfileScopeError);
      await expect(profileKvFor(scope).set('settings', { activeThemeId: 'x' })).rejects.toBeInstanceOf(ProfileScopeError);
    }
    setActiveScope(MY_LIQUE);
    expect(await dumpOwn()).toEqual(ownBefore);
    expect(await dumpFriend('pelle')).toEqual(friendBefore);
  });

  it('store actions on a friend profile are rejected and never land in MY_LIQUE', async () => {
    await seedOwn();
    await cacheFriend('pelle', PELLE);
    const ownBefore = await dumpOwn();
    setActiveScope(PELLE_SCOPE);
    await hydrateProfileStores();
    expectShows(PELLE);

    await expect(usePlaylists.getState().rename('pelle-pl', 'Mine now')).rejects.toBeInstanceOf(ProfileScopeError);
    await expect(useLibrary.getState().addCategory('New')).rejects.toBeInstanceOf(ProfileScopeError);
    await expect(useThemes.getState().saveTheme(theme('stolen', '#000000'))).rejects.toBeInstanceOf(ProfileScopeError);
    await expect(useFavorites.getState().toggleStation(PELLE.stations[0]!)).rejects.toBeInstanceOf(ProfileScopeError);
    const reported = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    useSettings.getState().update({ activeThemeId: 'amber-night' });
    await settle();
    expect(reported).toHaveBeenCalledWith('Profile settings were not saved:', expect.any(ProfileScopeError));
    reported.mockRestore();

    setActiveScope(MY_LIQUE);
    expect(await dumpOwn()).toEqual(ownBefore);
  });
});

// ---- 4 -----------------------------------------------------------------------------------

describe('4 — profile separation', () => {
  it('each scope returns only its own themes, playlists, categories, media, favourites, stations and settings', async () => {
    await seedOwn();
    await cacheFriend('pelle', PELLE);
    await cacheFriend('anders', ANDERS);

    for (const [scope, f] of [[MY_LIQUE, OWN], [PELLE_SCOPE, PELLE], [ANDERS_SCOPE, ANDERS]] as const) {
      const r = repositoriesFor(scope);
      expect(await r.themes.getAll()).toEqual(f.themes);
      expect(await r.categories.getAll()).toEqual(f.categories);
      expect(await r.media.getAll()).toEqual(f.media);
      expect(await r.playlists.getAll()).toEqual(f.playlists);
      expect(await r.favorites.getAll()).toEqual(f.favorites);
      expect(await r.stations.getAll()).toEqual(f.stations);

      setActiveScope(scope);
      await hydrateProfileStores();
      expectShows(f);
      expect(useSettings.getState().volume).toBe(0.4); // device settings are always this device's
    }
    expect((await readFriendProfileCacheMeta('pelle'))?.revision).toBe(1);
  });

  it('a cached profile of someone else cannot be stored under a friend’s id', async () => {
    const parsed = parseProfile(JSON.stringify({ format: PROFILE_FORMAT, meta: { schemaVersion: 1, ownerUserId: 'anders', revision: 1, updatedAt: now, visibility: 'FRIENDS' }, data: {} }));
    if (!parsed.ok) throw new Error(parsed.error);
    await expect(writeFriendProfileCache('pelle', parsed.profile)).rejects.toBeInstanceOf(ProfileScopeError);
  });

  it('a newer copy replaces the old one completely; deleting a copy removes it', async () => {
    await cacheFriend('pelle', PELLE, 1);
    await cacheFriend('pelle', { ...PELLE, playlists: [], media: [] }, 2);
    expect(await repositoriesFor(PELLE_SCOPE).playlists.getAll()).toEqual([]);
    expect((await readFriendProfileCacheMeta('pelle'))?.revision).toBe(2);

    setActiveScope(PELLE_SCOPE);
    await expect(deleteFriendProfileCache('pelle')).rejects.toBeInstanceOf(ProfileScopeError); // not while active
    setActiveScope(MY_LIQUE);
    await deleteFriendProfileCache('pelle');
    await expect(repositoriesFor(PELLE_SCOPE).media.getAll()).rejects.toBeInstanceOf(ProfileNotAvailableError);
  });
});

// ---- 5 -----------------------------------------------------------------------------------

describe('5 — the queue stays personal', () => {
  it('is the same queue in every scope, and queueing while a friend is active changes the own queue only', async () => {
    await seedOwn();
    await cacheFriend('pelle', PELLE);
    setActiveScope(PELLE_SCOPE);
    await useQueue.getState().hydrate();
    expect(useQueue.getState().entries.map((e) => e.entryId)).toEqual(['e1']);

    useQueue.getState().apply({ ...useQueue.getState(), entries: [...useQueue.getState().entries, { entryId: 'e2', item: PELLE.media[0]! }] });
    await settle();
    const stored = await kv.get<{ entries: Array<{ entryId: string }> }>('queue');
    expect(stored?.entries.map((e) => e.entryId)).toEqual(['e1', 'e2']);
    expect((await dumpFriend('pelle')).kv).not.toContainEqual(expect.arrayContaining(['queue']));
  });
});

// ---- 6 -----------------------------------------------------------------------------------

describe('6 — history stays personal', () => {
  it('listening while a friend is active is recorded in the own history; a friend profile has no history at all', async () => {
    await seedOwn();
    await cacheFriend('pelle', PELLE);
    setActiveScope(PELLE_SCOPE);
    await useHistory.getState().hydrate();
    expect(useHistory.getState().entries.map((e) => e.id)).toEqual(['h-own']);
    await useHistory.getState().upsert({ ...ownHistory, id: 'h-while-friend', item: PELLE.media[0]!, mediaId: 'pelle-m1' });

    setActiveScope(MY_LIQUE);
    expect((await personalRepositories.history.getAll()).map((h) => h.id).sort()).toEqual(['h-own', 'h-while-friend']);
    const friendDb = await openFriendDb('pelle', { create: false });
    expect([...friendDb.objectStoreNames]).not.toContain('history');
  });
});

// ---- 7 -----------------------------------------------------------------------------------

describe('7 — backup and restore cannot target a friend scope', () => {
  const file = (media: MediaItem[]) => {
    const r = parseBackup(JSON.stringify({ format: BACKUP_FORMAT, version: 1, data: { media, settings: { activeThemeId: 'amber-night', volume: 0.9 } } }));
    if (!r.ok) throw new Error(r.error);
    return r.backup;
  };
  const empty: ExistingData = { themes: [], categories: [], media: [], playlists: [], favorites: [], stations: [], history: [] };
  const imported: MediaItem = { ...OWN.media[0]!, id: 'imported', sourceUrl: 'https://imported.example/x.mp3' };

  it('an import while a friend is active is refused; neither profile changes', async () => {
    await seedOwn();
    await cacheFriend('pelle', PELLE);
    const ownBefore = await dumpOwn();
    const friendBefore = await dumpFriend('pelle');
    setActiveScope(PELLE_SCOPE);
    await expect(applyImport(planImport(file([imported]), empty, { mode: 'replace', settings: true, history: false }), 'replace')).rejects.toBeInstanceOf(ProfileScopeError);
    setActiveScope(MY_LIQUE);
    expect(await dumpOwn()).toEqual(ownBefore);
    expect(await dumpFriend('pelle')).toEqual(friendBefore);
  });

  it('an import in MY_LIQUE writes the own database only, never a cached friend', async () => {
    await seedOwn();
    await cacheFriend('pelle', PELLE);
    const friendBefore = await dumpFriend('pelle');
    await applyImport(planImport(file([imported]), empty, { mode: 'merge', settings: true, history: false }), 'merge');
    expect((await repositoriesFor(MY_LIQUE).media.getAll()).map((m) => m.id)).toContain('imported');
    expect(await dumpFriend('pelle')).toEqual(friendBefore);
  });

  it('a backup made while a friend profile is shown contains the own data and own profile settings', async () => {
    await seedOwn();
    await cacheFriend('pelle', PELLE);
    setActiveScope(PELLE_SCOPE);
    await hydrateProfileStores();
    const backup = await createBackup(useSettings.getState(), { includeHistory: true });
    expect(backup.data.settings?.activeThemeId).toBe(OWN.settings.activeThemeId);
    expect(backup.data.settings?.volume).toBe(0.4);
    expect(backup.data.media.map((m) => m.id)).toEqual(['own-m1']);
    expect(backup.data.playlists.map((p) => p.id)).toEqual(['own-pl']);
    expect(backup.data.history?.map((h) => h.id)).toEqual(['h-own']);
  });
});

// ---- 8 -----------------------------------------------------------------------------------

describe('8 — no cross-scope leakage', () => {
  it('switching scope never shows the other profile’s data, in either direction', async () => {
    await seedOwn();
    await cacheFriend('pelle', PELLE);
    await hydrateProfileStores();
    expectShows(OWN);
    setActiveScope(PELLE_SCOPE);
    await hydrateProfileStores();
    expectShows(PELLE);
    setActiveScope(ANDERS_SCOPE);
    await expect(useLibrary.getState().hydrate()).rejects.toBeInstanceOf(ProfileNotAvailableError); // Anders not cached
    setActiveScope(MY_LIQUE);
    await hydrateProfileStores();
    expectShows(OWN);
  });

  it('a store still holding a friend profile after a switch cannot write it into MY_LIQUE', async () => {
    await seedOwn();
    await cacheFriend('pelle', PELLE);
    const ownBefore = await dumpOwn();
    setActiveScope(PELLE_SCOPE);
    await hydrateProfileStores();
    setActiveScope(MY_LIQUE); // switched back, stores not rehydrated yet: they still hold Pelle's data
    await expect(usePlaylists.getState().rename('pelle-pl', 'leak')).rejects.toBeInstanceOf(ProfileScopeError);
    await expect(useLibrary.getState().updateMedia('pelle-m1', { title: 'leak' })).rejects.toBeInstanceOf(ProfileScopeError);
    expect(await dumpOwn()).toEqual(ownBefore);
  });

  it('a hydrate that finishes after the scope changed does not overwrite the newer profile', async () => {
    await seedOwn();
    await cacheFriend('pelle', PELLE);
    setActiveScope(PELLE_SCOPE);
    await hydrateProfileStores();
    setActiveScope(MY_LIQUE);
    const stale = usePlaylists.getState().hydrate(); // started in MY_LIQUE…
    setActiveScope(PELLE_SCOPE); // …but the scope changed before it finished
    await stale;
    expect(usePlaylists.getState().playlists.map((p) => p.id)).toEqual(['pelle-pl']);
    expect(usePlaylists.getState().scope).toEqual(PELLE_SCOPE);
  });

  it('the own database never contains friend data, and friend databases never contain own data', async () => {
    await seedOwn();
    await cacheFriend('pelle', PELLE);
    setActiveScope(PELLE_SCOPE);
    await hydrateProfileStores();
    setActiveScope(MY_LIQUE);
    await hydrateProfileStores();
    expect(JSON.stringify(await dumpOwn())).not.toContain('pelle');
    expect(JSON.stringify(await dumpFriend('pelle'))).not.toMatch(/own-|h-own/);
  });
});

// ---- 9 -----------------------------------------------------------------------------------

describe('9 — reload', () => {
  it('a fresh start is always in MY_LIQUE, and the active scope is never stored', async () => {
    await seedOwn();
    await cacheFriend('pelle', PELLE);
    setActiveScope(PELLE_SCOPE);
    expect(JSON.stringify(await dumpOwn())).not.toContain('friend:');

    vi.resetModules(); // what a reload does to module state
    const reloaded = await import('./scope');
    expect(reloaded.getActiveScope()).toEqual(reloaded.MY_LIQUE);
    expect(getActiveScope()).toEqual(PELLE_SCOPE); // (this module instance, unchanged)
  });
});

// ---- 10 ----------------------------------------------------------------------------------

describe('10 — the Checkpoint 1 migration still works, and only in MY_LIQUE', () => {
  it('migrates the old single settings record into the own profile; a cached friend is untouched', async () => {
    await kv.set('settings', { activeThemeId: 'base16-nord', volume: 0.33, glowLevel: 0.5 });
    await cacheFriend('pelle', PELLE);
    const friendBefore = await dumpFriend('pelle');

    await useSettings.getState().hydrate();
    expect(useSettings.getState().activeThemeId).toBe('base16-nord');
    expect(useSettings.getState().volume).toBe(0.33);
    expect(await profileKvFor(MY_LIQUE).get('settings')).toEqual({ activeThemeId: 'base16-nord', glowLevel: 0.5 });
    expect(await kv.get('settings')).toEqual({ activeThemeId: 'base16-nord', volume: 0.33, glowLevel: 0.5 });
    expect(await dumpFriend('pelle')).toEqual(friendBefore);
    expect((await getDb())!.name).toBe(DB_NAME);
  });
});
