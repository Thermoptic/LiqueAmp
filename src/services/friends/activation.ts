// Activating a Friend Lique (checkpoint 8; docs/LIQUEAMP_FRIEND_LIQUES_SPEC.md
// §13–§27, §35, §47). Built on the profile scopes of checkpoint 2:
//
//   cloud profile ──readProfile (RLS: only if I added them)──▶ parseProfile
//   (the regular validation) ──▶ writeFriendProfileCache (their own database
//   `liqueamp-friend:<id>`, the only writer of a friend scope) ──▶
//   setActiveScope(friend) + re-hydrating the profile stores.
//
// Nothing is copied into MY_LIQUE; queue, history and device settings are
// never scoped, so they stay the viewer's. Returning is setActiveScope(MY_LIQUE)
// + re-hydrating. The active scope is never stored: a reload starts in MY_LIQUE.
import { AccountError } from '../account/account';
import { parseProfile } from '../profile/profile';
import { deleteFriendProfileCache, friendScope, readFriendProfileCacheMeta, writeFriendProfileCache } from '../profile/profileCache';
import { getActiveScope, isActiveScope, MY_LIQUE, scopeId, setActiveScope, type ProfileScope } from '../storage/scope';
import { reloadProfileStores } from '../../stores/reloadProfileStores';
import { useFavorites } from '../../stores/favoritesStore';
import { useLibrary } from '../../stores/libraryStore';
import { usePlaylists } from '../../stores/playlistStore';
import { useSettings } from '../../stores/settingsStore';
import { useThemes } from '../../stores/themeStore';
import type { FriendDirectory } from './friends';

export type FriendLiqueErrorCode = 'not-signed-in' | 'not-a-friend' | 'unavailable' | 'invalid' | 'offline-unavailable' | 'switch-failed';

const MESSAGES: Record<FriendLiqueErrorCode, string> = {
  'not-signed-in': 'Log in to activate a Friend Lique.',
  'not-a-friend': 'Add them first to activate their Lique.',
  unavailable: 'Their Lique can’t be opened: it isn’t shared with you (any more) or they have none yet.',
  invalid: 'Their Lique could not be read, so it was not activated.',
  'offline-unavailable': 'You’re offline and their Lique isn’t available on this device yet.',
  'switch-failed': 'Their Lique could not be loaded. You are back in your own Lique.',
};

export class FriendLiqueError extends Error {
  constructor(
    readonly code: FriendLiqueErrorCode,
    readonly cause?: unknown,
  ) {
    super(MESSAGES[code]);
  }
}

async function hasCachedCopy(userId: string): Promise<boolean> {
  try {
    return Boolean(await readFriendProfileCacheMeta(userId));
  } catch {
    return false; // ProfileNotAvailableError: never cached (and nothing is created by asking)
  }
}

/**
 * Makes a friend's Lique available locally: the latest cloud copy, validated
 * and cached; or, only when offline, the copy validated and cached earlier.
 * Nothing is switched. On any failure no friend database is created and an
 * existing copy is only removed when access is gone.
 */
export async function prepareFriendLique(directory: FriendDirectory, userId: string): Promise<{ source: 'cloud' | 'cache' }> {
  friendScope(userId); // validates the id before it names a database
  let doc;
  try {
    doc = await directory.readProfile(userId);
  } catch (err) {
    if (err instanceof AccountError && err.code === 'offline') {
      if (await hasCachedCopy(userId)) return { source: 'cache' };
      throw new FriendLiqueError('offline-unavailable', err);
    }
    throw err;
  }
  if (!doc) {
    // not readable any more (RLS) or no Lique yet: an older local copy must not be used either
    if (getActiveScope().kind === 'own' || !isActiveScope(friendScope(userId))) await deleteFriendProfileCache(userId).catch(() => undefined);
    throw new FriendLiqueError('unavailable');
  }
  const parsed = parseProfile(doc.text);
  if (!parsed.ok || parsed.profile.meta.ownerUserId !== userId) throw new FriendLiqueError('invalid', parsed.ok ? undefined : new Error(parsed.error));
  // the server's revision and time describe this copy
  await writeFriendProfileCache(userId, { ...parsed.profile, meta: { ...parsed.profile.meta, revision: doc.revision, updatedAt: doc.updatedAt } });
  return { source: 'cloud' };
}

/** The scope each profile store currently holds. */
function heldScopes(): string[] {
  return [useSettings.getState().profileScope, useThemes.getState().scope, useLibrary.getState().scope, usePlaylists.getState().scope, useFavorites.getState().scope].map(scopeId);
}

/**
 * Shows `scope` in every profile store, all or nothing: if any store cannot
 * load it, everything returns to MY_LIQUE and this rejects.
 */
export async function switchProfile(scope: ProfileScope): Promise<void> {
  setActiveScope(scope);
  try {
    await reloadProfileStores();
    if (!isActiveScope(scope) || heldScopes().some((id) => id !== scopeId(scope))) throw new Error('The profile stores did not all switch.');
  } catch (err) {
    if (scope.kind === 'own') throw err;
    setActiveScope(MY_LIQUE);
    await reloadProfileStores().catch(() => undefined);
    throw new FriendLiqueError('switch-failed', err);
  }
}
