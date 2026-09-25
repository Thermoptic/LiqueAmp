// Local cache of other users' profiles (docs/LIQUEAMP_PROFILE_SPEC.md §27,
// D1 in docs/LIQUEAMP_IMPLEMENTATION_PLAN.md). Each friend's profile lives in
// its own IndexedDB database; this module is the ONLY code that writes one.
// Everything else — every store and repository — can only read a friend
// scope. Friend Lique activation (src/services/friends/activation.ts) fetches,
// validates and stores a friend's profile here before showing it.
import { deleteFriendDb, friendDbName, openFriendDb, PROFILE_STORES } from '../storage/db';
import { profileKvFor, profileKvKey } from '../storage/repository';
import { getActiveScope, ProfileScopeError, type ProfileScope } from '../storage/scope';
import { pickProfileSettings } from '../../types/settings';
import type { ParsedProfile, ProfileMeta } from './profile';

export interface ProfileCacheMeta extends ProfileMeta {
  /** When this copy was stored on this device. */
  cachedAt: string;
}

const META_KEY = 'meta';

export function friendScope(userId: string): ProfileScope {
  friendDbName(userId); // validates the id
  return { kind: 'friend', userId };
}

/**
 * Stores a validated profile (from parseProfile) as the local copy of a
 * friend's profile, replacing any older copy completely, in one transaction:
 * if anything fails, the previous copy stays as it was. The own profile is
 * never involved — this only opens the friend's own database.
 */
export async function writeFriendProfileCache(userId: string, profile: ParsedProfile): Promise<void> {
  const { meta, content } = profile;
  if (meta.ownerUserId !== null && meta.ownerUserId !== userId) {
    throw new ProfileScopeError(`This profile belongs to ${meta.ownerUserId}, not ${userId}.`);
  }
  const db = await openFriendDb(userId, { create: true });
  const tx = db.transaction([...PROFILE_STORES, 'kv'] as const, 'readwrite');
  const ops: Array<Promise<unknown>> = [];
  try {
    for (const store of PROFILE_STORES) ops.push(tx.objectStore(store).clear());
    ops.push(tx.objectStore('kv').clear());
    for (const t of content.themes.items) ops.push(tx.objectStore('themes').put(t));
    for (const c of content.categories.items) ops.push(tx.objectStore('categories').put(c));
    for (const m of content.media.items) ops.push(tx.objectStore('media').put(m));
    for (const p of content.playlists.items) ops.push(tx.objectStore('playlists').put(p));
    for (const f of content.favorites.items) ops.push(tx.objectStore('favorites').put(f));
    for (const s of content.stations.items) ops.push(tx.objectStore('stations').put(s));
    ops.push(tx.objectStore('kv').put(content.settings ? pickProfileSettings(content.settings) : {}, profileKvKey('settings')));
    const cacheMeta: ProfileCacheMeta = { ...meta, ownerUserId: meta.ownerUserId ?? userId, cachedAt: new Date().toISOString() };
    ops.push(tx.objectStore('kv').put(cacheMeta, profileKvKey(META_KEY)));
    await Promise.all([...ops, tx.done]);
  } catch (err) {
    try {
      tx.abort();
    } catch {
      // already aborted by the failing request
    }
    await Promise.allSettled([...ops, tx.done]);
    throw err instanceof Error ? err : new Error(String(err));
  }
}

/** Metadata (revision, owner, when cached) of a friend's local copy; rejects with ProfileNotAvailableError if there is none. */
export function readFriendProfileCacheMeta(userId: string): Promise<ProfileCacheMeta | undefined> {
  return profileKvFor(friendScope(userId)).get<ProfileCacheMeta>(META_KEY);
}

/**
 * Deletes a friend's local copy (friendship removed, access revoked). Refused
 * while that profile is the active one: the app must return to MY_LIQUE first.
 */
export async function deleteFriendProfileCache(userId: string): Promise<void> {
  const active = getActiveScope();
  if (active.kind === 'friend' && active.userId === userId) {
    throw new ProfileScopeError('Return to your own profile before removing this cached profile.');
  }
  await deleteFriendDb(userId);
}
