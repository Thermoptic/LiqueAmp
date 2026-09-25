// Checkpoint 6: friend access through the Supabase adapter, against the
// in-memory stand-in that enforces the friends migration's RLS rules
// (src/test/fakeSupabase.ts). The real policies are tested in
// supabase/tests/friends_rls.test.sql.
import { beforeEach, describe, expect, it } from 'vitest';
import { createFakeSupabase } from '../../test/fakeSupabase';
import { createSupabaseAccountProvider } from '../cloud/supabaseAccount';
import { createSupabaseFriendDirectory } from '../cloud/supabaseFriends';
import { createSupabaseProfileStore } from '../cloud/supabaseProfiles';
import { createCloudServices } from '../cloud';
import { AccountError } from '../account/account';
import { FriendError, type FriendErrorCode } from './friends';
import { summarizeProfile, type ProfileSummary } from '../profile/summary';
import { createProfile, serializeProfile } from '../profile/profile';
import { BUILTIN_THEMES } from '../themes/builtin';
import { DEFAULT_SETTINGS } from '../../types/settings';
import { readStoredSummary, summarizeProfileText } from './friendSummary';

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const C = '33333333-3333-4333-8333-333333333333';
const CALLBACK = 'https://thermoptic.github.io/LiqueAmp/auth/callback';
const summary = {} as ProfileSummary;
const profileText = (owner: string, who: string) => JSON.stringify({ format: 'liqueamp-profile', meta: { schemaVersion: 1, ownerUserId: owner }, data: { who } });

type Fake = ReturnType<typeof createFakeSupabase>;

/** A signed-up user with a username and a cloud Lique. */
async function user(fake: Fake, id: string, username: string, withProfile = true) {
  fake.signInAs(id, 'github');
  await createSupabaseAccountProvider(fake.client, { redirectTo: () => CALLBACK }).claimUsername(username);
  if (withProfile) await createSupabaseProfileStore(fake.client).upload(id, { text: profileText(id, username), summary, expectedRevision: 0 });
}

async function world() {
  const fake = createFakeSupabase();
  await user(fake, A, 'Alice');
  await user(fake, B, 'Bob');
  await user(fake, C, 'Carol');
  const as = (id: string) => {
    fake.signInAs(id, 'github');
    return { friends: createSupabaseFriendDirectory(fake.client), profiles: createSupabaseProfileStore(fake.client) };
  };
  return { fake, as };
}

async function rejectsWith(promise: Promise<unknown>, code: FriendErrorCode) {
  const err = await promise.then(
    () => null,
    (e: unknown) => e,
  );
  expect(err).toBeInstanceOf(FriendError);
  expect((err as FriendError).code).toBe(code);
}

describe('friend access (checkpoint 6)', () => {
  beforeEach(() => localStorage.clear());

  it('A can add B by exact username; A may then read B’s Lique, read-only', async () => {
    const { as } = await world();
    const a = as(A);
    expect(await a.friends.readProfile(B)).toBeNull(); // not before adding
    const friend = await a.friends.add('@bob'); // case-insensitive, leading @ allowed
    expect(friend).toMatchObject({ userId: B, username: 'Bob' });
    expect(friend.addedAt).not.toBe('');
    expect(await a.friends.list()).toEqual([friend]);
    const doc = await a.friends.readProfile(B);
    expect(JSON.parse(doc!.text)).toMatchObject({ data: { who: 'Bob' } });
    expect(doc!.revision).toBe(1);

    // read-only: A's writes to B's Lique change nothing
    await a.profiles.remove(B);
    expect(await a.profiles.upload(B, { text: profileText(B, 'hacked'), summary, expectedRevision: 1 })).toMatchObject({ ok: false, reason: 'conflict' });
    await expect(a.profiles.upload(B, { text: profileText(B, 'hacked'), summary, expectedRevision: 0 })).rejects.toBeInstanceOf(AccountError);
    expect(JSON.parse((await a.friends.readProfile(B))!.text)).toMatchObject({ data: { who: 'Bob' } });
  });

  it('one-way: B gains nothing when A adds B, and does not see it', async () => {
    const { as } = await world();
    await as(A).friends.add('Bob');
    const b = as(B);
    expect(await b.friends.list()).toEqual([]);
    expect(await b.friends.readProfile(A)).toBeNull();
  });

  it('an unrelated user’s Lique stays unreadable', async () => {
    const { as } = await world();
    const a = as(A);
    await a.friends.add('Bob');
    expect(await a.friends.readProfile(C)).toBeNull();
  });

  it('A can remove B; afterwards A can no longer read B', async () => {
    const { as } = await world();
    const a = as(A);
    await a.friends.add('Bob');
    await a.friends.add('Carol');
    await a.friends.remove(B);
    expect((await a.friends.list()).map((f) => f.username)).toEqual(['Carol']);
    expect(await a.friends.readProfile(B)).toBeNull();
    await a.friends.remove(B); // removing someone not added is a no-op
  });

  it('A cannot remove another user’s relationship', async () => {
    const { fake, as } = await world();
    await as(C).friends.add('Bob');
    const a = as(A);
    await a.friends.remove(B); // only ever A's own row
    expect(fake.tables.friendships).toEqual([expect.objectContaining({ user_id: C, friend_id: B })]);
    expect(await as(C).friends.readProfile(B)).not.toBeNull();
  });

  it('A cannot create a relationship pretending to be another user (the database refuses)', async () => {
    const { fake, as } = await world();
    as(A);
    const { error } = await fake.client.from('friendships').insert({ user_id: C, friend_id: B }).select('friend_id').single();
    expect(error?.code).toBe('42501');
    expect(fake.tables.friendships).toEqual([]);
  });

  it('list is sorted by username and shows each person once', async () => {
    const { as } = await world();
    const a = as(A);
    await a.friends.add('carol');
    await a.friends.add('BOB');
    expect((await a.friends.list()).map((f) => [f.userId, f.username])).toEqual([
      [B, 'Bob'],
      [C, 'Carol'],
    ]);
  });

  it('friendly errors: invalid, unknown, oneself, already added, not signed in', async () => {
    const { fake, as } = await world();
    const a = as(A);
    await rejectsWith(a.friends.add('bo b'), 'username-invalid');
    await rejectsWith(a.friends.add(''), 'username-invalid');
    await rejectsWith(a.friends.add('Nobody'), 'not-found');
    await rejectsWith(a.friends.add('Bo'), 'username-invalid'); // too short: never a prefix search
    await rejectsWith(a.friends.add('Bobb'), 'not-found');
    await rejectsWith(a.friends.add('alice'), 'self');
    await a.friends.add('Bob');
    await rejectsWith(a.friends.add('bob'), 'already-added');
    await fake.client.auth.signOut();
    await rejectsWith(a.friends.add('Carol'), 'not-signed-in');
    await rejectsWith(a.friends.list(), 'not-signed-in');
  });

  it('a user without a cloud Lique can be added; reading gives null', async () => {
    const fake = createFakeSupabase();
    await user(fake, B, 'Bob', false);
    await user(fake, A, 'Alice');
    const friends = createSupabaseFriendDirectory(fake.client);
    await friends.add('Bob');
    expect(await friends.readProfile(B)).toBeNull();
  });

  it('username lookup returns only the user id and username', async () => {
    const { fake, as } = await world();
    as(A);
    const { data } = await fake.client.rpc('lookup_username', { p_username: 'BOB' });
    expect(data).toEqual([{ user_id: B, username: 'Bob' }]);
  });

  it('offline: backend failures are account errors, as elsewhere in the cloud layer', async () => {
    const { fake, as } = await world();
    const a = as(A);
    fake.setOffline(true);
    await expect(a.friends.add('Bob')).rejects.toMatchObject({ code: 'offline' });
    await expect(a.friends.list()).rejects.toMatchObject({ code: 'offline' });
  });

  it('deleting an account removes relationships to and from it', async () => {
    const { fake, as } = await world();
    await as(A).friends.add('Bob');
    await as(B).friends.add('Carol');
    as(B);
    await createSupabaseAccountProvider(fake.client, { redirectTo: () => CALLBACK }).deleteAccount();
    expect(fake.tables.friendships).toEqual([]);
    expect(await as(A).friends.list()).toEqual([]);
  });

  it('without an account backend there is no friend directory (local-only LiqueAmp)', async () => {
    expect((await createCloudServices({})).friends).toBeNull();
  });

  it('readSummary: the stored summary, with the server revision; built-in theme names come from this app', async () => {
    const { fake, as } = await world();
    const builtin = BUILTIN_THEMES[BUILTIN_THEMES.length - 1]!;
    const bob = fake.tables.profiles.find((p) => p.user_id === B)!;
    bob.summary = { theme: { id: builtin.id, name: 'SPOOFED NAME', builtIn: true }, visualizer: { type: 'waveform', enabled: false }, counts: { playlists: 1, categories: 2, streams: 3, stations: 4 } };
    const a = as(A);
    expect(await a.friends.readSummary(B)).toBeNull(); // not added yet: RLS hides it
    await a.friends.add('Bob');
    expect(await a.friends.readSummary(B)).toEqual({
      revision: 1,
      updatedAt: bob.updated_at,
      theme: { name: builtin.name, builtIn: true },
      visualizer: { name: 'Waveform', enabled: false },
      counts: { playlists: 1, categories: 2, streams: 3, stations: 4 },
    });
  });

  it('readSummary: without a usable summary the full profile is validated and summarized; unreadable → profile-invalid', async () => {
    const { fake, as } = await world();
    const a = as(A);
    await a.friends.add('Bob');
    const bob = fake.tables.profiles.find((p) => p.user_id === B)!;
    bob.summary = null;
    bob.data = JSON.parse(serializeProfile(await createProfile(DEFAULT_SETTINGS, { ownerUserId: B, revision: 1, updatedAt: '2026-09-25T10:00:00.000Z' })));
    expect(await a.friends.readSummary(B)).toMatchObject({ revision: 1, counts: { playlists: 0, categories: 0, streams: 0, stations: 0 }, visualizer: { enabled: DEFAULT_SETTINGS.visualizer.enabled } });
    bob.data = { format: 'liqueamp-profile', meta: {}, data: 'garbage' };
    await rejectsWith(a.friends.readSummary(B), 'profile-invalid');
    expect(await a.friends.readSummary(C)).toBeNull(); // not added
  });

  it('readStoredSummary rejects malformed or oversized values', () => {
    const head = { revision: 3, updatedAt: 'x' };
    const good = { theme: { id: 'mine', name: 'My theme' }, visualizer: { type: 'unknown-viz', enabled: true }, counts: { playlists: 0, categories: 0, streams: 0, stations: 0 } };
    expect(readStoredSummary(good, head)).toEqual({ ...head, theme: { name: 'My theme', builtIn: false }, visualizer: { name: 'unknown-viz', enabled: true }, counts: good.counts });
    expect(readStoredSummary({ ...good, theme: { id: 'x', name: 'n'.repeat(500) } }, head)!.theme.name).toHaveLength(80);
    for (const bad of [null, 'text', [], { ...good, counts: { ...good.counts, playlists: -1 } }, { ...good, counts: { ...good.counts, streams: 1.5 } }, { ...good, counts: { ...good.counts, stations: '3' } }, { ...good, visualizer: { type: 'waveform' } }, { ...good, theme: {} }]) {
      expect(readStoredSummary(bad, head)).toBeNull();
    }
    expect(summarizeProfileText('not json', head)).toBeNull();
  });

  it('the summary a LiqueAmp uploads (summarizeProfile) is what the preview reads', async () => {
    const profile = await createProfile(DEFAULT_SETTINGS, { ownerUserId: B });
    const stored = summarizeProfile(profile, 'Bob');
    expect(readStoredSummary(JSON.parse(JSON.stringify(stored)), { revision: 7, updatedAt: 'now' })).toMatchObject({ revision: 7, counts: stored.counts });
  });
});
