// Checkpoint 4: profile.meta, dirty tracking, revision sync, account ownership.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { getDb, resetDbForTests } from '../storage/db';
import { kv, personalRepositories, profileKvFor, repositories, repositoriesFor } from '../storage/repository';
import { MY_LIQUE, setActiveScope } from '../storage/scope';
import { useSettings } from '../../stores/settingsStore';
import { useThemes } from '../../stores/themeStore';
import { useLibrary } from '../../stores/libraryStore';
import { usePlaylists } from '../../stores/playlistStore';
import { useFavorites } from '../../stores/favoritesStore';
import { useQueue } from '../../stores/queueStore';
import { useHistory } from '../../stores/historyStore';
import { useAccount } from '../../stores/accountStore';
import { DEFAULT_SETTINGS } from '../../types/settings';
import type { HistoryEntry, MediaItem } from '../../types/media';
import type { AccountProvider, AccountState, AccountUser } from '../account/account';
import { parseProfile, PROFILE_FORMAT } from '../profile/profile';
import { writeFriendProfileCache } from '../profile/profileCache';
import type { CloudProfileHead, CloudProfileStore } from './cloudProfile';
import { readOwnProfileMeta, startDirtyTracking, stopDirtyTracking, UNLINKED_META, writeOwnProfileMeta, type OwnProfileMeta } from './ownProfileMeta';
import { adoptLocalProfile, decideSync, downloadOwnProfile, syncOwnProfile, uploadOwnProfile } from './profileSync';

// ---- an in-memory cloud with the server's rules ---------------------------------

function fakeCloud() {
  const rows = new Map<string, { revision: number; updatedAt: string; text: string; summary: unknown }>();
  let clock = 0;
  const store: CloudProfileStore & { rows: typeof rows; uploads: number } = {
    rows,
    uploads: 0,
    async head(userId) {
      const r = rows.get(userId);
      return r ? { revision: r.revision, updatedAt: r.updatedAt } : null;
    },
    async download(userId) {
      const r = rows.get(userId);
      return r ? { revision: r.revision, updatedAt: r.updatedAt, text: r.text } : null;
    },
    async upload(userId, { text, summary, expectedRevision }) {
      store.uploads++;
      const current = rows.get(userId);
      if ((current?.revision ?? 0) !== expectedRevision) return { ok: false, reason: 'conflict', cloud: { revision: current!.revision, updatedAt: current!.updatedAt } };
      const next = { revision: expectedRevision + 1, updatedAt: `2026-09-25T13:00:${String(++clock).padStart(2, '0')}.000Z`, text, summary };
      rows.set(userId, next);
      return { ok: true, revision: next.revision, updatedAt: next.updatedAt };
    },
    async remove(userId) {
      rows.delete(userId);
    },
  };
  return store;
}

// ---- fixtures ----------------------------------------------------------------------

const now = '2026-09-25T12:00:00.000Z';
const A: AccountUser = { userId: 'user-a', username: 'alice' };
const B: AccountUser = { userId: 'user-b', username: 'bob' };
const media = (id: string, url = `https://streams.example/${id}.mp3`): MediaItem => ({ id, provider: 'direct', title: id, sourceUrl: url, playbackType: 'direct', createdAt: now, updatedAt: now });
const historyEntry: HistoryEntry = { id: 'h1', mediaId: 'm1', startedAt: now, durationPlayed: 30, item: media('m1') };
const queue = { entries: [{ entryId: 'q1', item: media('m1') }], currentId: 'q1', history: [], played: [] };

const settle = async () => {
  for (let i = 0; i < 6; i++) await new Promise((r) => setTimeout(r, 0));
};

async function seedLocal() {
  await kv.set('settings', { volume: 0.3, shuffle: true, repeat: 'all' });
  await profileKvFor(MY_LIQUE).set('settings', { activeThemeId: 'base16-nord' });
  await repositoriesFor(MY_LIQUE).media.putMany([media('m1'), media('m2')]);
  await repositoriesFor(MY_LIQUE).playlists.put({ id: 'pl', name: 'Night', items: [{ mediaId: 'm1', addedAt: now }], createdAt: now, updatedAt: now });
  await kv.set('queue', queue);
  await personalRepositories.history.put(historyEntry);
}

async function dumpDb() {
  const db = (await getDb())!;
  const out: Record<string, unknown> = {};
  for (const name of db.objectStoreNames) {
    const keys = await db.getAllKeys(name);
    const values = await db.getAll(name);
    out[name] = keys.map((k, i) => [String(k), values[i]]);
  }
  return out;
}
const withoutMeta = (d: Record<string, unknown>) => ({ ...d, kv: (d.kv as Array<[string, unknown]>).filter(([k]) => k !== 'profile.meta') });

const settings = () => ({ ...useSettings.getState() });

beforeEach(async () => {
  await resetDbForTests();
  globalThis.indexedDB = new IDBFactory();
  setActiveScope(MY_LIQUE);
  useSettings.setState({ ...DEFAULT_SETTINGS, hydrated: false, profileScope: MY_LIQUE });
  startDirtyTracking();
});
afterEach(() => stopDirtyTracking());

// ---- profile.meta and dirty tracking ---------------------------------------------

describe('profile.meta', () => {
  it('a local profile without an account is unlinked, revision 0', async () => {
    expect(await readOwnProfileMeta()).toEqual(UNLINKED_META);
  });

  it('every own-profile write marks it dirty — settings, library, playlists, favourites, themes, imports', async () => {
    const writes: Array<() => Promise<unknown>> = [
      () => profileKvFor(MY_LIQUE).set('settings', { activeThemeId: 'amber-night' }),
      () => repositoriesFor(MY_LIQUE).media.put(media('x')),
      () => repositoriesFor(MY_LIQUE).playlists.put({ id: 'p', name: 'p', items: [], createdAt: now, updatedAt: now }),
      () => repositoriesFor(MY_LIQUE).favorites.put({ id: 'media:x', type: 'media', refId: 'x', addedAt: now }),
      () => repositoriesFor(MY_LIQUE).themes.delete('nothing'),
    ];
    for (const write of writes) {
      await writeOwnProfileMeta({ ...UNLINKED_META, ownerUserId: 'user-a', baseRevision: 3 });
      await write();
      expect(await readOwnProfileMeta()).toMatchObject({ dirty: true, baseRevision: 3, ownerUserId: 'user-a' });
    }
  });

  it('a store action (not just a repository) marks it dirty too', async () => {
    await useLibrary.getState().hydrate();
    await useLibrary.getState().addCategory('Jazz');
    expect((await readOwnProfileMeta()).dirty).toBe(true);
  });

  it('device settings, the queue and history are not profile changes', async () => {
    await kv.set('settings', { volume: 0.2 });
    await kv.set('queue', queue);
    await personalRepositories.history.put(historyEntry);
    await useSettings.getState().hydrate();
    useSettings.getState().update({ volume: 0.5, shuffle: true });
    await settle();
    expect((await readOwnProfileMeta()).dirty).toBe(false);
  });

  it('a friend’s cached profile never marks the own profile dirty', async () => {
    const parsed = parseProfile(JSON.stringify({ format: PROFILE_FORMAT, meta: { schemaVersion: 1, ownerUserId: 'user-z', revision: 1, updatedAt: now, visibility: 'PRIVATE' }, data: { media: [media('z')] } }));
    if (!parsed.ok) throw new Error(parsed.error);
    await writeFriendProfileCache('user-z', parsed.profile);
    expect((await readOwnProfileMeta()).dirty).toBe(false);
  });
});

// ---- decideSync ------------------------------------------------------------------------

describe('decideSync', () => {
  const meta = (m: Partial<OwnProfileMeta>): OwnProfileMeta => ({ ...UNLINKED_META, ...m });
  const head = (revision: number): CloudProfileHead => ({ revision, updatedAt: now });
  it.each([
    ['own, clean, cloud unchanged', meta({ ownerUserId: 'user-a', baseRevision: 4 }), head(4), true, 'in-sync'],
    ['own, dirty, cloud unchanged', meta({ ownerUserId: 'user-a', baseRevision: 4, dirty: true }), head(4), true, 'upload'],
    ['own, clean, cloud newer', meta({ ownerUserId: 'user-a', baseRevision: 4 }), head(6), true, 'download'],
    ['own, dirty, cloud newer', meta({ ownerUserId: 'user-a', baseRevision: 4, dirty: true }), head(6), true, 'conflict'],
    ['own, cloud behind the local base', meta({ ownerUserId: 'user-a', baseRevision: 4 }), head(2), true, 'conflict'],
    ['own, no cloud profile', meta({ ownerUserId: 'user-a', baseRevision: 0, dirty: true }), null, true, 'upload'],
    ['another account’s local Lique', meta({ ownerUserId: 'user-b', baseRevision: 9 }), head(4), true, 'blocked-other-account'],
    ['another account’s local Lique, account without cloud profile', meta({ ownerUserId: 'user-b' }), null, true, 'blocked-other-account'],
    ['first login with a local Lique (D7)', meta({}), null, true, 'adopt-and-upload'],
    ['first login on an empty device, no cloud profile', meta({}), null, false, 'adopt-and-upload'],
    ['login on an empty device, account has a cloud profile', meta({}), head(3), false, 'download'],
    ['login on a device with its own unlinked Lique, account has a cloud profile', meta({}), head(3), true, 'resolve-local'],
  ] as const)('%s → %s', (_, m, h, hasData, expected) => {
    expect(decideSync(m, 'user-a', h, hasData)).toBe(expected);
  });
});

// ---- create account / upload -----------------------------------------------------------

describe('Create Account adopts the local Lique (D7)', () => {
  it('links the local profile, uploads it without queue, history or device settings, and marks it clean', async () => {
    await seedLocal();
    await useSettings.getState().hydrate();
    const cloud = fakeCloud();
    const r = await adoptLocalProfile({ userId: A.userId, username: A.username, cloud, settings: settings() });
    expect(r).toEqual({ status: 'uploaded', revision: 1 });
    expect(await readOwnProfileMeta()).toMatchObject({ ownerUserId: 'user-a', baseRevision: 1, dirty: false });
    const stored = cloud.rows.get('user-a')!;
    const parsed = parseProfile(stored.text);
    if (!parsed.ok) throw new Error(parsed.error);
    expect(parsed.profile.meta.ownerUserId).toBe('user-a');
    expect(parsed.profile.content.media.items.map((m) => m.id).sort()).toEqual(['m1', 'm2']);
    expect(parsed.profile.content.settings?.activeThemeId).toBe('base16-nord');
    expect(stored.text).not.toMatch(/"volume"|"shuffle"|"queue"|"history"|"repeat"/);
    expect(stored.summary).toMatchObject({ username: 'alice', counts: { playlists: 1, streams: 2 } });
  });

  it('does not replace a cloud profile the account already has', async () => {
    await seedLocal();
    const cloud = fakeCloud();
    await cloud.upload('user-a', { text: '{}', summary: {} as never, expectedRevision: 0 });
    await expect(adoptLocalProfile({ userId: A.userId, username: A.username, cloud, settings: settings() })).rejects.toThrow(/already has a cloud profile/);
    expect(await readOwnProfileMeta()).toMatchObject({ ownerUserId: null, baseRevision: 0 }); // still not linked
  });

  it('suspicious stream URLs stop the upload until the user decides; the local original is never changed', async () => {
    await seedLocal();
    await repositoriesFor(MY_LIQUE).media.put(media('private', 'https://streams.example/p.mp3?token=s3cr3t'));
    const cloud = fakeCloud();
    const first = await adoptLocalProfile({ userId: A.userId, username: A.username, cloud, settings: settings() });
    expect(first.status).toBe('needs-review');
    expect(first.status === 'needs-review' && first.findings.map((f) => f.key)).toEqual(['media:private']);
    expect(cloud.uploads).toBe(0);

    const second = await uploadOwnProfile({ userId: A.userId, username: A.username, cloud, settings: settings(), decisions: { 'media:private': 'exclude' } });
    expect(second.status).toBe('uploaded');
    expect(cloud.rows.get('user-a')!.text).not.toContain('s3cr3t');
    expect((await repositories.media.get('private'))?.sourceUrl).toBe('https://streams.example/p.mp3?token=s3cr3t');
  });

  it('upload succeeds only while the cloud is at baseRevision; the server owns the revision', async () => {
    await seedLocal();
    const cloud = fakeCloud();
    await adoptLocalProfile({ userId: A.userId, username: A.username, cloud, settings: settings() });
    await repositoriesFor(MY_LIQUE).media.put(media('m3'));
    expect((await readOwnProfileMeta()).dirty).toBe(true);
    expect(await uploadOwnProfile({ userId: A.userId, username: A.username, cloud, settings: settings() })).toEqual({ status: 'uploaded', revision: 2 });

    // another device uploads meanwhile
    await cloud.upload('user-a', { text: cloud.rows.get('user-a')!.text, summary: {} as never, expectedRevision: 2 });
    await repositoriesFor(MY_LIQUE).media.put(media('m4'));
    const r = await uploadOwnProfile({ userId: A.userId, username: A.username, cloud, settings: settings() });
    expect(r).toEqual({ status: 'conflict', cloud: { revision: 3, updatedAt: expect.any(String) } });
    expect(await readOwnProfileMeta()).toMatchObject({ baseRevision: 2, dirty: true }); // nothing overwritten, still dirty
  });

  it('edits made during an upload keep the profile dirty', async () => {
    await seedLocal();
    const cloud = fakeCloud();
    const slow: CloudProfileStore = {
      ...cloud,
      upload: async (userId, upload) => {
        await repositoriesFor(MY_LIQUE).media.put(media('during-upload'));
        return cloud.upload(userId, upload);
      },
    };
    await adoptLocalProfile({ userId: A.userId, username: A.username, cloud: slow, settings: settings() });
    expect(await readOwnProfileMeta()).toMatchObject({ baseRevision: 1, dirty: true });
  });
});

// ---- cloud → local ------------------------------------------------------------------------

describe('cloud profile on another device (D8)', () => {
  async function accountWithCloudProfile() {
    await seedLocal();
    await useSettings.getState().hydrate();
    const cloud = fakeCloud();
    await adoptLocalProfile({ userId: A.userId, username: A.username, cloud, settings: settings() });
    return cloud;
  }

  it('an empty device downloads it: profile data in, device settings, queue and history kept', async () => {
    const cloud = await accountWithCloudProfile();
    // a second device: own device settings, queue and history, no profile data
    await resetDbForTests();
    globalThis.indexedDB = new IDBFactory();
    await kv.set('settings', { volume: 0.9, shuffle: false, repeat: 'one' });
    await kv.set('queue', { ...queue, entries: [{ entryId: 'other', item: media('other') }] });
    await personalRepositories.history.put({ ...historyEntry, id: 'h-device2' });

    const r = await syncOwnProfile({ userId: A.userId, username: A.username, cloud, settings: settings() });
    expect(r).toEqual({ status: 'downloaded', revision: 1 });
    expect((await repositories.media.getAll()).map((m) => m.id).sort()).toEqual(['m1', 'm2']);
    expect(await profileKvFor(MY_LIQUE).get('settings')).toMatchObject({ activeThemeId: 'base16-nord' });
    expect(await kv.get('settings')).toEqual({ volume: 0.9, shuffle: false, repeat: 'one' });
    expect((await kv.get<{ entries: Array<{ entryId: string }> }>('queue'))?.entries.map((e) => e.entryId)).toEqual(['other']);
    expect((await personalRepositories.history.getAll()).map((h) => h.id)).toEqual(['h-device2']);
    expect(await readOwnProfileMeta()).toMatchObject({ ownerUserId: 'user-a', baseRevision: 1, dirty: false });
  });

  it('a newer cloud revision replaces a clean local profile; unsynced local changes are never overwritten', async () => {
    const cloud = await accountWithCloudProfile();
    const text = cloud.rows.get('user-a')!.text.replace('"m2"', '"m2-renamed"');
    await cloud.upload('user-a', { text, summary: {} as never, expectedRevision: 1 });
    expect(await syncOwnProfile({ userId: A.userId, username: A.username, cloud, settings: settings() })).toEqual({ status: 'downloaded', revision: 2 });
    expect((await repositories.media.getAll()).map((m) => m.id).sort()).toEqual(['m1', 'm2-renamed']);

    await cloud.upload('user-a', { text, summary: {} as never, expectedRevision: 2 });
    await repositoriesFor(MY_LIQUE).media.put(media('local-edit'));
    const before = await dumpDb();
    expect(await syncOwnProfile({ userId: A.userId, username: A.username, cloud, settings: settings() })).toMatchObject({ status: 'conflict' });
    await expect(downloadOwnProfile({ userId: A.userId, cloud })).rejects.toThrow(/not synced/);
    expect(await dumpDb()).toEqual(before);
  });

  it('a cloud profile that is invalid or belongs to someone else is refused', async () => {
    const cloud = fakeCloud();
    cloud.rows.set('user-a', { revision: 1, updatedAt: now, text: 'garbage', summary: {} });
    await expect(downloadOwnProfile({ userId: A.userId, cloud })).rejects.toThrow(/not valid/);
    cloud.rows.set('user-a', { revision: 1, updatedAt: now, text: JSON.stringify({ format: PROFILE_FORMAT, meta: { schemaVersion: 1, ownerUserId: 'user-b', revision: 1, updatedAt: now, visibility: 'PRIVATE' }, data: {} }), summary: {} });
    await expect(downloadOwnProfile({ userId: A.userId, cloud })).rejects.toThrow(/another account/);
  });
});

// ---- Account A / Account B -----------------------------------------------------------------

describe('Account A’s local Lique is never mixed with Account B (ownership guard)', () => {
  it('B logging in on A’s device: no upload, no download, no merge — nothing changes', async () => {
    await seedLocal();
    await useSettings.getState().hydrate();
    const cloud = fakeCloud();
    await adoptLocalProfile({ userId: A.userId, username: A.username, cloud, settings: settings() });
    await cloud.upload('user-b', { text: cloud.rows.get('user-a')!.text.replace('user-a', 'user-b'), summary: {} as never, expectedRevision: 0 });
    const uploadsBefore = cloud.uploads;
    const localBefore = await dumpDb();
    const bCloudBefore = cloud.rows.get('user-b');

    expect(await syncOwnProfile({ userId: B.userId, username: B.username, cloud, settings: settings() })).toEqual({ status: 'blocked-other-account' });
    await expect(uploadOwnProfile({ userId: B.userId, username: B.username, cloud, settings: settings() })).rejects.toThrow(/another account/);
    await expect(downloadOwnProfile({ userId: B.userId, cloud })).rejects.toThrow(/another account/);
    await expect(adoptLocalProfile({ userId: B.userId, username: B.username, cloud, settings: settings() })).rejects.toThrow(/another account/);

    expect(cloud.uploads).toBe(uploadsBefore);
    expect(cloud.rows.get('user-b')).toEqual(bCloudBefore);
    expect(await dumpDb()).toEqual(localBefore);
    expect((await readOwnProfileMeta()).ownerUserId).toBe('user-a');
  });

  it('an unlinked local Lique with data is not silently given to the account that logs in', async () => {
    await seedLocal();
    const cloud = fakeCloud();
    await cloud.upload('user-b', { text: JSON.stringify({ format: PROFILE_FORMAT, meta: { schemaVersion: 1, ownerUserId: 'user-b', revision: 1, updatedAt: now, visibility: 'PRIVATE' }, data: {} }), summary: {} as never, expectedRevision: 0 });
    const before = await dumpDb();
    expect(await syncOwnProfile({ userId: B.userId, username: B.username, cloud, settings: settings() })).toEqual({ status: 'resolve-local' });
    await expect(downloadOwnProfile({ userId: B.userId, cloud })).rejects.toThrow(/its own LiqueAmp/);
    await expect(uploadOwnProfile({ userId: B.userId, username: B.username, cloud, settings: settings() })).rejects.toThrow(/not linked/);
    expect(await dumpDb()).toEqual(before);
  });
});

// ---- log out / delete account ----------------------------------------------------------------

function fakeProvider(user: AccountUser | null, cloud?: ReturnType<typeof fakeCloud>) {
  let listener: ((s: AccountState) => void) | null = null;
  let current = user;
  const calls: string[] = [];
  const session = () => (current ? { user: current, authMethod: 'github' as const } : null);
  const provider: AccountProvider = {
    id: 'fake',
    available: true,
    getState: async () => (current ? { status: 'signed-in', session: session()! } : { status: 'signed-out' }),
    getSession: async () => session(),
    getCurrentUser: async () => current,
    signIn: async () => undefined,
    signUp: async () => 'signed-in' as const,
    requestPasswordReset: async () => undefined,
    updatePassword: async () => undefined,
    onPasswordRecovery: () => () => undefined,
    claimUsername: async () => session()!,
    signOut: async () => {
      calls.push('signOut');
      current = null;
      listener?.({ status: 'signed-out' });
    },
    deleteAccount: async () => {
      calls.push('deleteAccount');
      current = null;
    },
    onChange: (l) => {
      listener = l;
      return () => (listener = null);
    },
  };
  return { provider, calls, cloud };
}

describe('Log out and Delete account', () => {
  it('log out disconnects the account and changes nothing local (D14)', async () => {
    await seedLocal();
    await useSettings.getState().hydrate();
    const cloud = fakeCloud();
    await adoptLocalProfile({ userId: A.userId, username: A.username, cloud, settings: settings() });
    const { provider, calls } = fakeProvider(A);
    await useAccount.getState().init(provider, cloud);
    expect(useAccount.getState().state).toEqual({ status: 'signed-in', session: { user: A, authMethod: 'github' } });

    const before = await dumpDb();
    const stores = [useSettings, useThemes, useLibrary, usePlaylists, useFavorites, useQueue, useHistory].map((s) => JSON.stringify(s.getState()));
    await useAccount.getState().signOut();
    expect(calls).toEqual(['signOut']);
    expect(useAccount.getState().state).toEqual({ status: 'signed-out' });
    expect(await dumpDb()).toEqual(before); // profile, meta (still Account A's), queue, history, device settings
    expect([useSettings, useThemes, useLibrary, usePlaylists, useFavorites, useQueue, useHistory].map((s) => JSON.stringify(s.getState()))).toEqual(stores);

    // logging in again as A continues where it was
    expect(await syncOwnProfile({ userId: A.userId, username: A.username, cloud, settings: settings() })).toEqual({ status: 'in-sync' });
  });

  it('delete account needs confirmation, removes the cloud profile, and keeps the local Lique (D15)', async () => {
    await seedLocal();
    await useSettings.getState().hydrate();
    const cloud = fakeCloud();
    await adoptLocalProfile({ userId: A.userId, username: A.username, cloud, settings: settings() });
    const { provider, calls } = fakeProvider(A);
    await useAccount.getState().init(provider, cloud);
    const before = await dumpDb();

    await expect(useAccount.getState().deleteAccount({ confirmed: false })).rejects.toThrow(/confirmed/);
    expect(cloud.rows.has('user-a')).toBe(true);

    await useAccount.getState().deleteAccount({ confirmed: true });
    expect(calls).toEqual(['deleteAccount']);
    expect(cloud.rows.has('user-a')).toBe(false);
    expect(useAccount.getState().state).toEqual({ status: 'signed-out' });
    expect(withoutMeta(await dumpDb())).toEqual(withoutMeta(before)); // all local data stays
    expect(await readOwnProfileMeta()).toMatchObject({ ownerUserId: null, baseRevision: 0 }); // no longer linked
  });
});
