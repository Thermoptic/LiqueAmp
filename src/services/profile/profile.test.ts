import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { getDb, resetDbForTests } from '../storage/db';
import { kv, profileKv, profileKvKey, repositories } from '../storage/repository';
import { MY_LIQUE, ProfileScopeError, getActiveScope, setActiveScope } from '../storage/scope';
import { useSettings } from '../../stores/settingsStore';
import { useThemes } from '../../stores/themeStore';
import { useLibrary } from '../../stores/libraryStore';
import { usePlaylists } from '../../stores/playlistStore';
import { useFavorites } from '../../stores/favoritesStore';
import { useHistory } from '../../stores/historyStore';
import { useQueue } from '../../stores/queueStore';
import { DEFAULT_SETTINGS, DEVICE_SETTING_KEYS, PROFILE_SETTING_KEYS, type Settings } from '../../types/settings';
import type { Category, Favorite, HistoryEntry, MediaItem, Playlist, RadioStation } from '../../types/media';
import { BUILTIN_THEMES, LIQUEAMP_DEFAULT } from '../themes/builtin';
import { deriveColors } from '../themes/base16';
import { applyImport, BACKUP_FORMAT, parseBackup, planImport, type ExistingData } from '../backup/backup';
import { createProfile, MAX_PROFILE_BYTES, parseProfile, PROFILE_FORMAT, serializeProfile } from './profile';

// ---- fixtures ------------------------------------------------------------------

const now = '2026-09-25T10:00:00.000Z';
const media = (id: string, extra: Partial<MediaItem> = {}): MediaItem => ({
  id,
  provider: 'direct',
  title: `Title ${id}`,
  sourceUrl: `https://streams.example/${id}.mp3`,
  playbackType: 'direct',
  categoryId: 'cat-1',
  createdAt: now,
  updatedAt: now,
  ...extra,
});
const category: Category = { id: 'cat-1', name: 'Ambient', sortOrder: 0, enabled: true };
const playlist: Playlist = { id: 'pl-1', name: 'Night', items: [{ mediaId: 'm1', addedAt: now }, { mediaId: 'm2', addedAt: now }], createdAt: now, updatedAt: now };
const station: RadioStation = { id: 'st-1', name: 'FIP', streamUrl: 'https://icecast.example/fip.mp3', genre: ['jazz'], tags: ['jazz'] };
const favorites: Favorite[] = [
  { id: 'station:st-1', type: 'station', refId: 'st-1', addedAt: now },
  { id: 'media:m1', type: 'media', refId: 'm1', addedAt: now },
];
// a custom theme in the version-2 (Base16 palette) model
const minePalette = { ...LIQUEAMP_DEFAULT.palette, base09: '#12ab34' };
const customTheme = { ...LIQUEAMP_DEFAULT, id: 'theme-mine', name: 'Mine', source: 'user' as const, palette: minePalette, colors: deriveColors(minePalette) };
const history: HistoryEntry = { id: 'h1', mediaId: 'm1', startedAt: now, durationPlayed: 42, item: media('m1') };

/** A full settings record as every version before the split stored it: one record, all fields, none default. */
const legacySettings: Settings = {
  activeThemeId: 'base16-nord',
  motion: 'reduced',
  glowLevel: 0.5,
  volume: 0.33,
  muted: true,
  shuffle: true,
  repeat: 'all',
  eq: { enabled: true, preset: 'custom', bass: 4, mid: -2, treble: 3 },
  visualizer: { ...DEFAULT_SETTINGS.visualizer, type: 'oscilloscope', mirror: false },
  shortcuts: false,
  artwork: false,
  providers: { ...DEFAULT_SETTINGS.providers, spotify: { enabled: false } },
  analysis: { fftSize: 4096, smoothing: 0.5 },
  render: { frameLimit: 30, dprCap: 1, debug: true },
};
const legacyQueue = { entries: [{ entryId: 'e1', item: media('m1') }], currentId: 'e1', history: [], played: [] };

/** Seeds a database the way an installation from before this checkpoint looks. */
async function seedLegacyInstallation() {
  await kv.set('settings', legacySettings);
  await kv.set('queue', legacyQueue);
  await repositories.categories.put(category);
  await repositories.media.putMany([media('m1'), media('m2')]);
  await repositories.playlists.put(playlist);
  await repositories.stations.put(station);
  for (const f of favorites) await repositories.favorites.put(f);
  await repositories.themes.put(customTheme);
  await repositories.history.put(history);
}

/** Every record in the database, per object store (kv as key → value). */
async function dumpDb(): Promise<Record<string, unknown>> {
  const db = (await getDb())!;
  const out: Record<string, unknown> = {};
  for (const name of db.objectStoreNames) {
    if (name === 'kv') {
      const keys = await db.getAllKeys('kv');
      const values = await db.getAll('kv');
      out.kv = Object.fromEntries(keys.map((k, i) => [String(k), values[i]]));
    } else {
      out[name] = await db.getAll(name);
    }
  }
  return out;
}

async function existing(): Promise<ExistingData> {
  const [themes, categories, m, playlists, favs, stations, hist] = await Promise.all([
    repositories.themes.getAll(),
    repositories.categories.getAll(),
    repositories.media.getAll(),
    repositories.playlists.getAll(),
    repositories.favorites.getAll(),
    repositories.stations.getAll(),
    repositories.history.getAll(),
  ]);
  return { themes, categories, media: m, playlists, favorites: favs, stations, history: hist };
}

const settle = async () => {
  for (let i = 0; i < 5; i++) await new Promise((r) => setTimeout(r, 0));
};

beforeEach(async () => {
  await resetDbForTests();
  globalThis.indexedDB = new IDBFactory();
  setActiveScope(MY_LIQUE);
  useSettings.setState({ ...DEFAULT_SETTINGS, hydrated: false });
});

afterEach(() => setActiveScope(MY_LIQUE));

// ---- settings split ----------------------------------------------------------------

describe('profile settings vs device settings', () => {
  it('every setting is either a profile or a device setting, never both', () => {
    const all = Object.keys(DEFAULT_SETTINGS).sort();
    const split = [...PROFILE_SETTING_KEYS, ...DEVICE_SETTING_KEYS].sort();
    expect(split).toEqual(all);
    expect(PROFILE_SETTING_KEYS.filter((k) => (DEVICE_SETTING_KEYS as readonly string[]).includes(k))).toEqual([]);
    expect([...PROFILE_SETTING_KEYS].sort()).toEqual(['activeThemeId', 'artwork', 'eq', 'glowLevel', 'visualizer']);
  });

  it('a device change writes only the device record, a profile change only the profile record', async () => {
    await useSettings.getState().hydrate();
    useSettings.getState().update({ volume: 0.2 });
    await settle();
    expect(await profileKv.get('settings')).toBeUndefined();
    expect(await kv.get<Partial<Settings>>('settings')).toMatchObject({ volume: 0.2 });

    const deviceBefore = await kv.get('settings');
    useSettings.getState().update({ activeThemeId: 'amber-night' });
    await settle();
    expect(await kv.get('settings')).toEqual(deviceBefore);
    const profile = await profileKv.get<Partial<Settings>>('settings');
    expect(profile?.activeThemeId).toBe('amber-night');
    expect(Object.keys(profile!).sort()).toEqual([...PROFILE_SETTING_KEYS].sort());
  });
});

// ---- migration ---------------------------------------------------------------------

describe('migration of existing installations', () => {
  it('keeps every setting value, and splits them into the two records', async () => {
    await seedLegacyInstallation();
    await useSettings.getState().hydrate();
    const s = useSettings.getState();
    for (const key of Object.keys(legacySettings) as Array<keyof Settings>) expect(s[key]).toEqual(legacySettings[key]);

    const profile = await profileKv.get<Partial<Settings>>('settings');
    expect(Object.keys(profile!).sort()).toEqual([...PROFILE_SETTING_KEYS].sort());
    for (const key of PROFILE_SETTING_KEYS) expect(profile![key]).toEqual(legacySettings[key]);
    // the old record is not deleted or emptied
    expect(await kv.get('settings')).toEqual(legacySettings);
  });

  it('is idempotent: running it again changes nothing', async () => {
    await seedLegacyInstallation();
    await useSettings.getState().hydrate();
    const afterFirst = await dumpDb();
    const stateFirst = { ...useSettings.getState() };

    useSettings.setState({ ...DEFAULT_SETTINGS, hydrated: false });
    await useSettings.getState().hydrate();
    await useSettings.getState().hydrate();
    expect(await dumpDb()).toEqual(afterFirst);
    expect({ ...useSettings.getState() }).toEqual(stateFirst);
  });

  it('does not migrate again once the profile record exists', async () => {
    await seedLegacyInstallation();
    await useSettings.getState().hydrate();
    useSettings.getState().update({ activeThemeId: 'amber-night' });
    await settle();

    useSettings.setState({ ...DEFAULT_SETTINGS, hydrated: false });
    await useSettings.getState().hydrate();
    // the old record still says base16-nord; the profile record wins
    expect(useSettings.getState().activeThemeId).toBe('amber-night');
  });

  it('device writes keep the profile fields the old record still holds', async () => {
    await seedLegacyInstallation();
    await useSettings.getState().hydrate();
    useSettings.getState().update({ volume: 0.9 });
    await settle();
    const device = await kv.get<Settings>('settings');
    expect(device?.volume).toBe(0.9);
    for (const key of PROFILE_SETTING_KEYS) expect(device![key]).toEqual(legacySettings[key]);
  });

  it('loses no data: hydrating every store leaves all existing records in place', async () => {
    await seedLegacyInstallation();
    const before = await dumpDb();

    await Promise.all([
      useSettings.getState().hydrate(),
      useThemes.getState().hydrate(),
      useLibrary.getState().hydrate(),
      useQueue.getState().hydrate(),
      useFavorites.getState().hydrate(),
      usePlaylists.getState().hydrate(),
      useHistory.getState().hydrate(),
    ]);
    await settle();

    const after = await dumpDb();
    const { [profileKvKey('settings')]: added, ...kvAfter } = after.kv as Record<string, unknown>;
    expect(added).toBeDefined();
    expect({ ...after, kv: kvAfter }).toEqual(before);
  });

  it('keeps custom themes, and built-in themes keep their ids and colors', async () => {
    await seedLegacyInstallation();
    await useThemes.getState().hydrate();
    const mine = useThemes.getState().themes.find((t) => t.id === 'theme-mine');
    expect(mine?.palette.base09).toBe('#12ab34');
    expect(mine?.colors).toEqual(deriveColors(mine!.palette));

    const builtinIds = BUILTIN_THEMES.map((t) => t.id);
    expect(builtinIds.slice(0, 2)).toEqual(['liqueamp-default', 'amber-night']);
    expect(builtinIds).toHaveLength(22);
    expect(builtinIds.filter((id) => id.startsWith('base16-'))).toHaveLength(20);
    for (const t of BUILTIN_THEMES) expect(t.colors).toEqual(deriveColors(t.palette));
    // built-ins are never stored, so a migration cannot change them
    expect((await repositories.themes.getAll()).map((t) => t.id)).toEqual(['theme-mine']);
  });
});

// ---- the profile model ---------------------------------------------------------

describe('LiqueAmpProfile', () => {
  it('contains the profile data, profile settings only, and no history or queue', async () => {
    await seedLegacyInstallation();
    await useSettings.getState().hydrate();
    const profile = await createProfile(useSettings.getState());

    expect(profile.format).toBe(PROFILE_FORMAT);
    expect(profile.meta).toMatchObject({ schemaVersion: 1, ownerUserId: null, revision: 0, visibility: 'PRIVATE' });
    expect(Object.keys(profile.data).sort()).toEqual(['categories', 'favorites', 'media', 'playlists', 'settings', 'stations', 'themes']);
    expect(Object.keys(profile.data.settings).sort()).toEqual([...PROFILE_SETTING_KEYS].sort());
    expect(profile.data.settings.activeThemeId).toBe('base16-nord');
    expect(profile.data.themes.map((t) => t.id)).toEqual(['theme-mine']);
    expect(profile.data.media.map((m) => m.id).sort()).toEqual(['m1', 'm2']);
    expect(profile.data.stations.map((s) => s.id)).toEqual(['st-1']);

    const json = serializeProfile(profile);
    expect(json).not.toContain('"history"');
    expect(json).not.toContain('"queue"');
    expect(json).not.toContain('"volume"');
    expect(json).not.toContain('"shuffle"');
    expect(JSON.parse(json)).toEqual(profile); // plain JSON, nothing runtime-only
  });

  it('round trip: serialize → parse → restore gives back the same profile data', async () => {
    await seedLegacyInstallation();
    await useSettings.getState().hydrate();
    const original = await createProfile(useSettings.getState());
    const text = serializeProfile(original);

    // a fresh device with its own device settings and personal data
    await resetDbForTests();
    globalThis.indexedDB = new IDBFactory();
    await kv.set('settings', { volume: 0.7, shuffle: false });
    await repositories.history.put({ ...history, id: 'h-own' });

    const parsed = parseProfile(text);
    if (!parsed.ok) throw new Error(parsed.error);
    const plan = planImport(parsed.profile.content, await existing(), { mode: 'replace', settings: true, history: false });
    await applyImport(plan, 'replace');

    useSettings.setState({ ...DEFAULT_SETTINGS, hydrated: false });
    await useSettings.getState().hydrate();
    const restored = await createProfile(useSettings.getState(), { updatedAt: original.meta.updatedAt });
    expect(restored.data).toEqual(original.data);
    // playlists still point at the restored media
    const mediaIds = new Set(restored.data.media.map((m) => m.id));
    for (const item of restored.data.playlists[0]!.items) expect(mediaIds.has(item.mediaId)).toBe(true);
    // the device keeps its own volume, and personal history is untouched
    expect(useSettings.getState().volume).toBe(0.7);
    expect((await repositories.history.getAll()).map((h) => h.id)).toEqual(['h-own']);
  });

  it('never takes history or device settings from a profile, even if present', () => {
    const smuggled = {
      format: PROFILE_FORMAT,
      meta: { schemaVersion: 1, ownerUserId: 'user-1', revision: 3, updatedAt: now, visibility: 'FRIENDS' },
      data: { settings: { ...legacySettings }, themes: [], categories: [], media: [media('m1')], playlists: [], favorites: [], stations: [], history: [history] },
    };
    const parsed = parseProfile(JSON.stringify(smuggled));
    if (!parsed.ok) throw new Error(parsed.error);
    expect(parsed.profile.content.history).toBeNull();
    expect(Object.keys(parsed.profile.content.settings!).sort()).toEqual([...PROFILE_SETTING_KEYS].sort());
    expect(parsed.profile.meta).toEqual(smuggled.meta);
  });

  it('treats a profile as untrusted input', () => {
    const base = { format: PROFILE_FORMAT, meta: { schemaVersion: 1, ownerUserId: null, revision: 0, updatedAt: now, visibility: 'PRIVATE' }, data: {} };
    const bad = (patch: object) => parseProfile(JSON.stringify({ ...base, ...patch }));
    expect(parseProfile('not json').ok).toBe(false);
    expect(bad({ format: BACKUP_FORMAT }).ok).toBe(false);
    expect(bad({ meta: { ...base.meta, schemaVersion: 99 } }).ok).toBe(false);
    expect(bad({ meta: { ...base.meta, revision: -1 } }).ok).toBe(false);
    expect(bad({ meta: { ...base.meta, visibility: 'EVERYONE' } }).ok).toBe(false);
    expect(bad({ meta: { ...base.meta, ownerUserId: '' } }).ok).toBe(false);
    expect(bad({ data: { media: 'x' } }).ok).toBe(false);
    expect(parseProfile('x'.repeat(MAX_PROFILE_BYTES + 1)).ok).toBe(false);

    const withInvalid = bad({ data: { media: [media('ok'), { ...media('js'), sourceUrl: 'javascript:alert(1)' }] } });
    if (!withInvalid.ok) throw new Error(withInvalid.error);
    expect(withInvalid.profile.content.media.items.map((m) => m.id)).toEqual(['ok']);
    expect(withInvalid.profile.content.media.invalid).toBe(1);
  });
});

// ---- backups -------------------------------------------------------------------------

describe('existing backups', () => {
  it('a format-1 backup with one flat settings object still imports, split into the two records', async () => {
    const file = { format: BACKUP_FORMAT, version: 1, exportedAt: now, app: 'LIQUEAMP', data: { settings: legacySettings, themes: [customTheme], categories: [category], media: [media('m1'), media('m2')], playlists: [playlist], favorites, stations: [station], history: [history] } };
    const parsed = parseBackup(JSON.stringify(file));
    if (!parsed.ok) throw new Error(parsed.error);
    const plan = planImport(parsed.backup, await existing(), { mode: 'merge', settings: true, history: true });
    await applyImport(plan, 'merge');

    await useSettings.getState().hydrate();
    for (const key of Object.keys(legacySettings) as Array<keyof Settings>) expect(useSettings.getState()[key]).toEqual(legacySettings[key]);
    expect(Object.keys((await kv.get<object>('settings'))!).sort()).toEqual([...DEVICE_SETTING_KEYS].sort());
    expect(Object.keys((await profileKv.get<object>('settings'))!).sort()).toEqual([...PROFILE_SETTING_KEYS].sort());
    expect((await repositories.history.getAll()).map((h) => h.id)).toEqual(['h1']);
    expect((await repositories.themes.getAll()).map((t) => t.id)).toEqual(['theme-mine']);
  });
});

// ---- the queue and history stay personal ---------------------------------------------

describe('personal data stays outside the profile', () => {
  it('the queue and history are not part of the profile and are not touched by creating one', async () => {
    await seedLegacyInstallation();
    await useSettings.getState().hydrate();
    await createProfile(useSettings.getState());
    expect(await kv.get('queue')).toEqual(legacyQueue);
    expect(await repositories.history.getAll()).toEqual([history]);
  });
});

// ---- profile scope foundation ------------------------------------------------------------

describe('profile scope', () => {
  it('starts in the own profile', () => {
    expect(getActiveScope()).toEqual(MY_LIQUE);
  });

  it('refuses to write profile data while a (read-only) friend scope is active, and leaves the own data alone', async () => {
    await seedLegacyInstallation();
    await useSettings.getState().hydrate();
    const before = await dumpDb();

    setActiveScope({ kind: 'friend', userId: 'user-2' });
    await expect(repositories.playlists.put({ ...playlist, name: 'Changed' })).rejects.toBeInstanceOf(ProfileScopeError);
    await expect(repositories.themes.delete('theme-mine')).rejects.toBeInstanceOf(ProfileScopeError);
    await expect(profileKv.set('settings', { activeThemeId: 'amber-night' })).rejects.toBeInstanceOf(ProfileScopeError);
    // friend data has no local storage yet: reads are refused too, never answered from the own profile
    await expect(repositories.media.getAll()).rejects.toBeInstanceOf(ProfileScopeError);
    const parsed = parseBackup(JSON.stringify({ format: BACKUP_FORMAT, version: 1, data: { media: [media('x')] } }));
    if (!parsed.ok) throw new Error(parsed.error);
    await expect(applyImport(planImport(parsed.backup, { themes: [], categories: [], media: [], playlists: [], favorites: [], stations: [], history: [] }, { mode: 'merge', settings: false, history: false }), 'merge')).rejects.toBeInstanceOf(ProfileScopeError);

    setActiveScope(MY_LIQUE);
    expect(await dumpDb()).toEqual(before);
  });

  it('personal data (history) is always the user own, whatever profile is active', async () => {
    setActiveScope({ kind: 'friend', userId: 'user-2' });
    await repositories.history.put(history);
    setActiveScope(MY_LIQUE);
    expect(await repositories.history.getAll()).toEqual([history]);
  });
});
