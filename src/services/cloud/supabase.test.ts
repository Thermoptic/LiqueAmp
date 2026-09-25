// Checkpoint 5: the Supabase adapters, the account store and profile sync,
// end to end against an in-memory stand-in that enforces the migration's
// rules (src/test/fakeSupabase.ts).
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { createFakeSupabase } from '../../test/fakeSupabase';
import { createSupabaseAccountProvider } from './supabaseAccount';
import { createSupabaseProfileStore } from './supabaseProfiles';
import { createCloudServices } from '.';
import { getDb, resetDbForTests } from '../storage/db';
import { kv, personalRepositories, profileKvFor, repositories, repositoriesFor } from '../storage/repository';
import { MY_LIQUE, setActiveScope } from '../storage/scope';
import { readOwnProfileMeta, startDirtyTracking, stopDirtyTracking, writeOwnProfileMeta } from '../sync/ownProfileMeta';
import { parseProfile } from '../profile/profile';
import { useAccount } from '../../stores/accountStore';
import { useSettings } from '../../stores/settingsStore';
import { useLibrary } from '../../stores/libraryStore';
import { useQueue } from '../../stores/queueStore';
import { DEFAULT_SETTINGS } from '../../types/settings';
import type { HistoryEntry, MediaItem } from '../../types/media';

const now = '2026-09-25T12:00:00.000Z';
const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const media = (id: string, url = `https://streams.example/${id}.mp3`): MediaItem => ({ id, provider: 'direct', title: id, sourceUrl: url, playbackType: 'direct', createdAt: now, updatedAt: now });
const queue = { entries: [{ entryId: 'q1', item: media('m1') }], currentId: 'q1', history: [], played: [] };
const history: HistoryEntry = { id: 'h1', mediaId: 'm1', startedAt: now, durationPlayed: 30, item: media('m1') };
const CALLBACK = 'https://thermoptic.github.io/LiqueAmp/auth/callback';

const settle = async (n = 10) => {
  for (let i = 0; i < n; i++) await new Promise((r) => setTimeout(r, 0));
};

async function freshDevice() {
  await resetDbForTests();
  globalThis.indexedDB = new IDBFactory();
  setActiveScope(MY_LIQUE);
  useSettings.setState({ ...DEFAULT_SETTINGS, hydrated: false, profileScope: MY_LIQUE });
}

/** A device with years of local LiqueAmp: theme, library, playlist, queue, history, device settings. */
async function seedLocalLique() {
  await kv.set('settings', { volume: 0.3, muted: false, shuffle: true, repeat: 'all' });
  await profileKvFor(MY_LIQUE).set('settings', { activeThemeId: 'base16-nord', glowLevel: 0.5 });
  await repositoriesFor(MY_LIQUE).media.putMany([media('m1'), media('m2')]);
  await repositoriesFor(MY_LIQUE).playlists.put({ id: 'pl', name: 'Night', items: [{ mediaId: 'm1', addedAt: now }], createdAt: now, updatedAt: now });
  await kv.set('queue', queue);
  await personalRepositories.history.put(history);
  await useSettings.getState().hydrate();
}

async function dumpDb(skipMeta = false) {
  const db = (await getDb())!;
  const out: Record<string, unknown> = {};
  for (const name of db.objectStoreNames) {
    const keys = await db.getAllKeys(name);
    const values = await db.getAll(name);
    out[name] = keys.map((k, i) => [String(k), values[i]]).filter(([k]) => !(skipMeta && k === 'profile.meta'));
  }
  return out;
}

function connect(fake: ReturnType<typeof createFakeSupabase>) {
  const provider = createSupabaseAccountProvider(fake.client, { redirectTo: () => CALLBACK });
  const cloud = createSupabaseProfileStore(fake.client);
  return { provider, cloud, init: () => useAccount.getState().init(provider, cloud) };
}

beforeEach(async () => {
  await freshDevice();
  localStorage.clear(); // browser storage (auth session, recorded login provider) is per test
  startDirtyTracking();
});
afterEach(async () => {
  stopDirtyTracking();
  await useAccount.getState().signOut();
});

// ---- adapters --------------------------------------------------------------------------

describe('Supabase auth adapter (D5, D6)', () => {
  it('Google and GitHub sign-in go through Supabase OAuth with the /LiqueAmp/ callback', async () => {
    const fake = createFakeSupabase();
    const { provider } = connect(fake);
    await provider.signIn({ method: 'google' });
    await provider.signIn({ method: 'github' });
    expect(fake.oauthCalls).toEqual([
      { provider: 'google', redirectTo: CALLBACK },
      { provider: 'github', redirectTo: CALLBACK },
    ]);
  });

  it('state: signed out → needs a username after the first OAuth login → signed in', async () => {
    const fake = createFakeSupabase();
    const { provider } = connect(fake);
    expect(await provider.getState()).toEqual({ status: 'signed-out' });
    await provider.signIn({ method: 'google' });
    fake.signInAs(A, 'google');
    expect(await provider.getState()).toEqual({ status: 'needs-username', userId: A, authMethod: 'google' });
    const session = await provider.claimUsername('Johan');
    expect(session).toEqual({ user: { userId: A, username: 'Johan' }, authMethod: 'google' });
    expect(await provider.getState()).toEqual({ status: 'signed-in', session });
    expect(fake.tables.users).toHaveLength(1); // no passwords, no auth data: id + username
    expect(Object.keys(fake.tables.users[0]!).sort()).toEqual(['created_at', 'id', 'updated_at', 'username']);
  });

  // "Continue with …" → OAuth round trip, as the app does it: the button
  // starts OAuth (recording the provider), the provider signs the user in,
  // and the app starts again on the callback URL.
  async function loginWith(fake: ReturnType<typeof createFakeSupabase>, method: 'google' | 'github') {
    await connect(fake).provider.signIn({ method });
    fake.signInAs(A, method);
    return connect(fake).provider; // a fresh page load on the callback URL
  }

  it('the label shows the provider chosen for the CURRENT login: Google → GitHub → Google', async () => {
    const fake = createFakeSupabase();
    // 1. Continue with Google → Google
    let provider = await loginWith(fake, 'google');
    await provider.claimUsername('Johan');
    expect(await provider.getState()).toMatchObject({ status: 'signed-in', session: { user: { userId: A, username: 'Johan' }, authMethod: 'google' } });
    // 2. log out
    await provider.signOut();
    expect(await provider.getState()).toEqual({ status: 'signed-out' });
    // 3. Continue with GitHub → the same account, GitHub
    provider = await loginWith(fake, 'github');
    expect(await provider.getState()).toMatchObject({ status: 'signed-in', session: { user: { userId: A, username: 'Johan' }, authMethod: 'github' } });
    // 4. log out
    await provider.signOut();
    // 5. Continue with Google again → Google (although GitHub is the most recently linked identity)
    provider = await loginWith(fake, 'google');
    const { data } = await fake.client.auth.getSession();
    expect(data.session!.user.app_metadata?.provider).toBe('google'); // first provider, always
    expect(data.session!.user.identities!.map((i) => i.provider)).toEqual(['google', 'github']); // both linked to one account
    expect(await provider.getState()).toMatchObject({ session: { authMethod: 'google' } });
  });

  it('with Google and GitHub linked, a GitHub-created account logging in with Google says Google', async () => {
    const fake = createFakeSupabase();
    let provider = await loginWith(fake, 'github'); // account created with GitHub
    await provider.claimUsername('Johan');
    await provider.signOut();
    provider = await loginWith(fake, 'google');
    expect(await provider.getState()).toMatchObject({ session: { authMethod: 'google' } });
  });

  it('6. the recorded provider stays stable across reloads and repeated session checks', async () => {
    const fake = createFakeSupabase();
    const first = await loginWith(fake, 'github');
    await first.claimUsername('Johan');
    for (let i = 0; i < 3; i++) {
      const reloaded = connect(fake).provider; // page reload: new provider, same browser storage
      expect(await reloaded.getState()).toMatchObject({ session: { authMethod: 'github' } });
      expect((await reloaded.getSession())?.authMethod).toBe('github');
    }
  });

  it('7. logging out clears the stored current-login provider', async () => {
    const fake = createFakeSupabase();
    const provider = await loginWith(fake, 'google');
    await provider.claimUsername('Johan');
    expect(localStorage.getItem('liqueamp.authMethod')).toContain('google');
    await provider.signOut();
    expect(localStorage.getItem('liqueamp.authMethod')).toBeNull();
    expect(localStorage.getItem('liqueamp.authMethod.pending')).toBeNull();
    // a session restored without a recorded login does not guess
    fake.signInAs(A, 'github');
    expect(await connect(fake).provider.getState()).toMatchObject({ session: { authMethod: null } });
  });

  it('an abandoned OAuth start does not label a later, unrelated session', async () => {
    const fake = createFakeSupabase();
    const { provider } = connect(fake);
    await provider.signIn({ method: 'google' }); // user leaves Google's page without signing in
    const pending = JSON.parse(localStorage.getItem('liqueamp.authMethod.pending')!) as { startedAt: number };
    localStorage.setItem('liqueamp.authMethod.pending', JSON.stringify({ ...pending, startedAt: pending.startedAt - 60 * 60 * 1000 }));
    fake.signInAs(A, 'github'); // much later, a session appears some other way
    await connect(fake).provider.claimUsername('Johan');
    expect(await connect(fake).provider.getState()).toMatchObject({ session: { authMethod: null } });
  });

  it('usernames are unique case-insensitively — enforced by the database, not by a check before insert', async () => {
    const fake = createFakeSupabase();
    const { provider } = connect(fake);
    fake.signInAs(A);
    await provider.claimUsername('Johan');
    fake.signInAs(B);
    await expect(provider.claimUsername('johan')).rejects.toMatchObject({ code: 'username-taken' });
    await expect(provider.claimUsername('JOHAN')).rejects.toMatchObject({ code: 'username-taken' });
    await expect(provider.claimUsername('jo han')).rejects.toMatchObject({ code: 'username-invalid' });
    // even if a client skipped its own validation, the database refuses
    const direct = await fake.client.from('users').insert({ id: B, username: 'x y' }).select('username').single();
    expect(direct.error?.code).toBe('23514');
    await expect(provider.claimUsername('Alice')).resolves.toMatchObject({ user: { username: 'Alice' } });
  });

  it('RLS: nobody reads or writes another user’s profile; the server owns the revision', async () => {
    const fake = createFakeSupabase();
    const { provider, cloud } = connect(fake);
    fake.signInAs(A);
    await provider.claimUsername('Johan');
    const text = (owner: string) => JSON.stringify({ format: 'liqueamp-profile', meta: { schemaVersion: 1, ownerUserId: owner, revision: 99, updatedAt: now, visibility: 'PUBLIC' }, data: {} });
    expect(await cloud.upload(A, { text: text(A), summary: {} as never, expectedRevision: 0 })).toMatchObject({ ok: true, revision: 1 });
    expect(fake.tables.profiles[0]).toMatchObject({ revision: 1, visibility: 'PRIVATE' }); // client values ignored
    expect(await cloud.upload(A, { text: text(A), summary: {} as never, expectedRevision: 1 })).toMatchObject({ ok: true, revision: 2 });
    expect(await cloud.upload(A, { text: text(A), summary: {} as never, expectedRevision: 1 })).toEqual({ ok: false, reason: 'conflict', cloud: { revision: 2, updatedAt: expect.any(String) } });
    await expect(cloud.upload(A, { text: text(B), summary: {} as never, expectedRevision: 2 })).rejects.toMatchObject({ code: 'profile-rejected' });

    fake.signInAs(B);
    await provider.claimUsername('Alice');
    expect(await cloud.head(A)).toBeNull(); // B cannot see A's profile
    expect(await cloud.download(A)).toBeNull();
    expect(await cloud.upload(A, { text: text(A), summary: {} as never, expectedRevision: 2 })).toMatchObject({ ok: false }); // update matches no row
    expect(fake.tables.profiles.find((p) => p.user_id === A)).toMatchObject({ revision: 2 });
  });

  it('Supabase unreachable → a plain "can’t be reached" error, never raw fetch text', async () => {
    const fake = createFakeSupabase();
    const { provider } = connect(fake);
    fake.setOffline(true);
    await expect(provider.getState()).rejects.toMatchObject({ code: 'offline', message: expect.stringMatching(/can’t be reached.*keeps working/) });
  });
});

// ---- first login (D7) ----------------------------------------------------------------------

describe('first login: the local Lique becomes the account’s first cloud profile (D7)', () => {
  it('OAuth → choose username → local MY_LIQUE uploaded; queue, history, device settings stay local', async () => {
    await seedLocalLique();
    const before = await dumpDb(true);
    const fake = createFakeSupabase();
    const { init, provider } = connect(fake);
    await provider.signIn({ method: 'github' });
    fake.signInAs(A, 'github');
    await init();
    expect(useAccount.getState().state).toEqual({ status: 'needs-username', userId: A, authMethod: 'github' });

    await useAccount.getState().claimUsername('Johan');
    await settle();
    expect(useAccount.getState().state).toMatchObject({ status: 'signed-in', session: { user: { userId: A, username: 'Johan' }, authMethod: 'github' } });
    expect(useAccount.getState().sync.state).toBe('synced');

    const row = fake.tables.profiles.find((p) => p.user_id === A)!;
    expect(row.revision).toBe(1);
    const parsed = parseProfile(JSON.stringify(row.data));
    if (!parsed.ok) throw new Error(parsed.error);
    expect(parsed.profile.content.media.items.map((m) => m.id).sort()).toEqual(['m1', 'm2']);
    expect(parsed.profile.content.settings).toMatchObject({ activeThemeId: 'base16-nord', glowLevel: 0.5 });
    expect(JSON.stringify(row.data)).not.toMatch(/"volume"|"shuffle"|"repeat"|"queue"|"history"|"muted"/);
    expect(row.summary).toMatchObject({ username: 'Johan', counts: { playlists: 1, streams: 2 } });

    expect(await readOwnProfileMeta()).toMatchObject({ ownerUserId: A, baseRevision: 1, dirty: false });
    expect(await dumpDb(true)).toEqual(before); // the local Lique is still the working copy, unchanged
  });

  it('local changes upload with the next sync; the revision moves on', async () => {
    await seedLocalLique();
    const fake = createFakeSupabase();
    const { init } = connect(fake);
    fake.signInAs(A);
    await init();
    await useAccount.getState().claimUsername('Johan');
    await repositoriesFor(MY_LIQUE).media.put(media('m3'));
    expect((await readOwnProfileMeta()).dirty).toBe(true);
    await useAccount.getState().syncNow();
    expect(fake.tables.profiles[0]!.revision).toBe(2);
    expect(await readOwnProfileMeta()).toMatchObject({ baseRevision: 2, dirty: false });
  });
});

// ---- second device (D8) ------------------------------------------------------------------------

describe('logging in on another device (D8)', () => {
  it('an empty device gets the account’s Lique; its own device settings, queue and history stay', async () => {
    await seedLocalLique();
    const fake = createFakeSupabase();
    fake.signInAs(A);
    await connect(fake).init();
    await useAccount.getState().claimUsername('Johan');
    await useAccount.getState().signOut();

    await freshDevice(); // device 2
    await kv.set('settings', { volume: 0.9, shuffle: false, repeat: 'one' });
    await kv.set('queue', { ...queue, entries: [{ entryId: 'd2', item: media('d2') }] });
    await personalRepositories.history.put({ ...history, id: 'h-d2' });
    fake.signInAs(A);
    await connect(fake).init();
    await settle();

    expect(useAccount.getState().sync.state).toBe('synced');
    expect((await repositories.media.getAll()).map((m) => m.id).sort()).toEqual(['m1', 'm2']);
    expect(useLibrary.getState().media.map((m) => m.id).sort()).toEqual(['m1', 'm2']); // stores reloaded
    expect(useSettings.getState().activeThemeId).toBe('base16-nord');
    expect(await kv.get('settings')).toEqual({ volume: 0.9, shuffle: false, repeat: 'one' });
    expect((await kv.get<{ entries: Array<{ entryId: string }> }>('queue'))?.entries.map((e) => e.entryId)).toEqual(['d2']);
    expect((await personalRepositories.history.getAll()).map((h) => h.id)).toEqual(['h-d2']);
    expect(await readOwnProfileMeta()).toMatchObject({ ownerUserId: A, baseRevision: 1, dirty: false });
  });
});

// ---- ownership (account A / account B) ---------------------------------------------------------

describe('account mismatch: A’s local Lique is never mixed with B', () => {
  it('B logs in on A’s device: sync is blocked, nothing is uploaded or changed', async () => {
    await seedLocalLique();
    const fake = createFakeSupabase();
    fake.signInAs(A);
    await connect(fake).init();
    await useAccount.getState().claimUsername('Johan');
    await useAccount.getState().signOut();
    const before = await dumpDb();

    fake.signInAs(B);
    await connect(fake).init();
    await useAccount.getState().claimUsername('Alice');
    await settle();
    expect(useAccount.getState().sync.state).toBe('blocked-other-account');
    expect(fake.tables.profiles.map((p) => p.user_id)).toEqual([A]); // nothing for B
    await useAccount.getState().resolve('use-cloud'); // even an explicit choice cannot touch A's Lique
    expect(useAccount.getState().sync.state).toBe('error');
    expect(await dumpDb()).toEqual(before);
    expect((await readOwnProfileMeta()).ownerUserId).toBe(A);
  });
});

// ---- conflicts (D9) -------------------------------------------------------------------------

describe('revision conflicts (D9)', () => {
  async function conflicted() {
    await seedLocalLique();
    const fake = createFakeSupabase();
    const { init, cloud } = connect(fake);
    fake.signInAs(A);
    await init();
    await useAccount.getState().claimUsername('Johan');
    // another device saves a newer revision…
    const row = fake.tables.profiles[0]!;
    await cloud.upload(A, { text: JSON.stringify({ ...(row.data as object), data: { ...(row.data as { data: object }).data, media: [media('cloud-only')] } }), summary: {} as never, expectedRevision: 1 });
    // …while this device changes something
    await repositoriesFor(MY_LIQUE).media.put(media('local-only'));
    await useAccount.getState().syncNow();
    return fake;
  }

  it('both changed → conflict; nothing is overwritten on either side', async () => {
    const fake = await conflicted();
    expect(useAccount.getState().sync.state).toBe('conflict');
    expect(fake.tables.profiles[0]!.revision).toBe(2);
    expect(JSON.stringify(fake.tables.profiles[0]!.data)).toContain('cloud-only');
    expect((await repositories.media.getAll()).map((m) => m.id)).toContain('local-only');
  });

  it('Keep local → this device’s Lique becomes the cloud profile', async () => {
    const fake = await conflicted();
    await useAccount.getState().resolve('keep-local');
    expect(useAccount.getState().sync.state).toBe('synced');
    expect(fake.tables.profiles[0]!.revision).toBe(3);
    expect(JSON.stringify(fake.tables.profiles[0]!.data)).toContain('local-only');
    expect(JSON.stringify(fake.tables.profiles[0]!.data)).not.toContain('cloud-only');
  });

  it('Use cloud → the cloud profile replaces this device’s profile data; queue and history stay', async () => {
    await conflicted();
    await useAccount.getState().resolve('use-cloud');
    expect(useAccount.getState().sync.state).toBe('synced');
    expect((await repositories.media.getAll()).map((m) => m.id)).toEqual(['cloud-only']);
    expect(await kv.get('queue')).toEqual(queue);
    expect(await personalRepositories.history.getAll()).toEqual([history]);
    expect(await readOwnProfileMeta()).toMatchObject({ baseRevision: 2, dirty: false });
  });
});

// ---- log out / expiry / delete (D14, D15) ----------------------------------------------------

describe('log out, expired session, delete account', () => {
  it('log out disconnects Supabase and changes nothing on the device (D14)', async () => {
    await seedLocalLique();
    const fake = createFakeSupabase();
    fake.signInAs(A);
    await connect(fake).init();
    await useAccount.getState().claimUsername('Johan');
    await useQueue.getState().hydrate();
    const before = await dumpDb();
    const settingsBefore = JSON.stringify(useSettings.getState());
    const queueBefore = JSON.stringify(useQueue.getState().entries);

    await useAccount.getState().signOut();
    expect(useAccount.getState().state).toEqual({ status: 'signed-out' });
    expect((await fake.client.auth.getSession()).data.session).toBeNull();
    expect(await dumpDb()).toEqual(before); // profile, meta, queue, history, device settings
    expect(JSON.stringify(useSettings.getState())).toBe(settingsBefore);
    expect(JSON.stringify(useQueue.getState().entries)).toBe(queueBefore);

    fake.signInAs(A); // logging in again continues where it was
    await connect(fake).init();
    await settle();
    expect(useAccount.getState().sync.state).toBe('synced');
  });

  it('an expired session signs out with a plain message; local data stays', async () => {
    await seedLocalLique();
    const fake = createFakeSupabase();
    fake.signInAs(A);
    await connect(fake).init();
    await useAccount.getState().claimUsername('Johan');
    const before = await dumpDb();
    fake.expireSession();
    await settle();
    expect(useAccount.getState().state).toEqual({ status: 'signed-out' });
    expect(useAccount.getState().error).toMatch(/session has expired/);
    expect(await dumpDb()).toEqual(before);
  });

  it('delete account needs confirmation, removes account + profile, frees the username, keeps the local Lique (D15)', async () => {
    await seedLocalLique();
    const fake = createFakeSupabase();
    fake.signInAs(A);
    await connect(fake).init();
    await useAccount.getState().claimUsername('Johan');
    const before = await dumpDb(true);

    await expect(useAccount.getState().deleteAccount({ confirmed: false })).rejects.toThrow(/confirmed/);
    await useAccount.getState().deleteAccount({ confirmed: true });
    expect(fake.tables.users).toEqual([]);
    expect(fake.tables.profiles).toEqual([]);
    expect(useAccount.getState().state).toEqual({ status: 'signed-out' });
    expect(await dumpDb(true)).toEqual(before);
    expect(await readOwnProfileMeta()).toMatchObject({ ownerUserId: null, baseRevision: 0 });

    fake.signInAs(B); // the username is free again
    const { provider } = connect(fake);
    await expect(provider.claimUsername('johan')).resolves.toMatchObject({ user: { username: 'johan' } });
  });
});

// ---- local-first (D16) ----------------------------------------------------------------------------

describe('local-first when Supabase is unavailable (D16)', () => {
  it('no configuration → the local provider; nothing is loaded or contacted', async () => {
    const s = await createCloudServices({});
    expect(s.provider.id).toBe('local');
    expect(s.cloud).toBeNull();
    expect(s.problem).toBeNull();
  });

  it('a broken configuration → local provider with an explanation, never a crash', async () => {
    const s = await createCloudServices({ VITE_SUPABASE_URL: 'https://x.supabase.co', VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_secret_nope' });
    expect(s.provider.id).toBe('local');
    expect(s.problem).toMatch(/misconfigured/);
  });

  it('Supabase down while signed in: account shows a plain error; the local Lique keeps working', async () => {
    await seedLocalLique();
    const fake = createFakeSupabase();
    fake.signInAs(A);
    await connect(fake).init();
    await useAccount.getState().claimUsername('Johan');
    const before = await dumpDb(true);

    fake.setOffline(true);
    await connect(fake).init();
    expect(useAccount.getState().loading).toBe(false);
    expect(useAccount.getState().error).toMatch(/can’t be reached/);
    // the local profile is untouched and still fully usable
    expect(await dumpDb(true)).toEqual(before);
    await useLibrary.getState().hydrate();
    await useLibrary.getState().addCategory('Offline works');
    expect(useLibrary.getState().categories.map((c) => c.name)).toContain('Offline works');
    await writeOwnProfileMeta({ ...(await readOwnProfileMeta()) }); // meta still writable
    expect((await readOwnProfileMeta()).dirty).toBe(true); // will upload when Supabase is back
  });
});
