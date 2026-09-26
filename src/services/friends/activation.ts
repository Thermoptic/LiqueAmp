// Activating a Friend Lique (checkpoint 8; docs/LIQUEAMP_FRIEND_LIQUES_SPEC.md
// §13–§27, §35, §47). Built on the profile scopes of checkpoint 2:
//
//   cloud profile ──readProfile (RLS: only if I added them)──▶ parseProfile
//   (the regular validation) ──▶ writeFriendProfileCache (their own database
//   `liqueamp-friend:<id>`, the only writer of a friend scope) ──▶
//   switchProfile: read every profile store's data for the friend, then show
//   it all at once.
//
// Nothing is copied into MY_LIQUE; queue, history and device settings are
// never scoped, so they stay the viewer's. Returning is switchProfile(MY_LIQUE).
// The active scope is never stored: a reload starts in MY_LIQUE.
import { AccountError } from '../account/account';
import { parseProfile } from '../profile/profile';
import { deleteFriendProfileCache, friendScope, readFriendProfileCacheMeta, writeFriendProfileCache } from '../profile/profileCache';
import { isActiveScope, MY_LIQUE, setActiveScope, type ProfileScope } from '../storage/scope';
import { BUILTIN_THEMES } from '../themes/builtin';
import { applyProfileState, loadProfileState } from '../../stores/reloadProfileStores';
import { useSettings } from '../../stores/settingsStore';
import { pickDeviceSettings } from '../../types/settings';
import type { FriendDirectory } from './friends';

export type FriendLiqueErrorCode = 'not-signed-in' | 'not-a-friend' | 'unavailable' | 'invalid' | 'offline-unavailable' | 'switch-failed' | 'restore-failed';

const MESSAGES: Record<FriendLiqueErrorCode, string> = {
  'not-signed-in': 'Log in to activate a Friend Lique.',
  'not-a-friend': 'Add them first to activate their Lique.',
  unavailable: 'Their Lique can’t be opened: it isn’t shared with you (any more) or they have none yet.',
  invalid: 'Their Lique could not be read, so it was not activated.',
  'offline-unavailable': 'You’re offline and their Lique isn’t available on this device yet.',
  'switch-failed': 'Their Lique could not be loaded, so nothing was switched.',
  'restore-failed': 'Your own Lique could not be loaded just now. Try Return to My Lique again.',
};

export class FriendLiqueError extends Error {
  constructor(
    readonly code: FriendLiqueErrorCode,
    readonly cause?: unknown,
  ) {
    super(MESSAGES[code]);
  }
}

/** Whether this account may use a local copy offline: validated earlier, for this same account. */
async function hasCachedCopy(userId: string, viewerId: string): Promise<boolean> {
  try {
    return (await readFriendProfileCacheMeta(userId))?.cachedFor === viewerId;
  } catch {
    return false; // ProfileNotAvailableError: never cached (and nothing is created by asking)
  }
}

/**
 * Makes a friend's Lique available locally: the latest cloud copy, validated
 * and cached for `viewerId`; or, only when offline, the copy this same
 * account validated and cached earlier. Nothing is switched. On any failure
 * no friend database is created, and an existing copy is only removed when
 * access is gone.
 */
export async function prepareFriendLique(directory: FriendDirectory, userId: string, viewerId: string): Promise<{ source: 'cloud' | 'cache' }> {
  friendScope(userId); // validates the id before it names a database
  let doc;
  try {
    doc = await directory.readProfile(userId);
  } catch (err) {
    if (err instanceof AccountError && err.code === 'offline') {
      if (await hasCachedCopy(userId, viewerId)) return { source: 'cache' };
      throw new FriendLiqueError('offline-unavailable', err);
    }
    throw err;
  }
  if (!doc) {
    // not readable any more (RLS) or no Lique yet: an older local copy must not be used either
    if (!isActiveScope(friendScope(userId))) await deleteFriendProfileCache(userId).catch(() => undefined);
    throw new FriendLiqueError('unavailable');
  }
  const parsed = parseProfile(doc.text);
  if (!parsed.ok || parsed.profile.meta.ownerUserId !== userId) throw new FriendLiqueError('invalid', parsed.ok ? undefined : new Error(parsed.error));
  // the server's revision and time describe this copy
  await writeFriendProfileCache(userId, { ...parsed.profile, meta: { ...parsed.profile.meta, revision: doc.revision, updatedAt: doc.updatedAt } }, { viewerId });
  return { source: 'cloud' };
}

/**
 * Shows `scope` in every profile store — all or nothing, in one step. Every
 * store's data is read first; only if all of it could be read (and
 * `stillWanted()` still agrees, e.g. the same account is signed in) the
 * active scope changes and every store shows the new profile in the same
 * synchronous step, together with `applied()` (e.g. the active-friend state).
 * On failure nothing changes: the previous profile stays fully shown.
 */
export async function switchProfile(scope: ProfileScope, { stillWanted = () => true, applied }: { stillWanted?: () => boolean; applied?: () => void } = {}): Promise<void> {
  let state;
  try {
    state = await loadProfileState(scope);
  } catch (err) {
    throw new FriendLiqueError(scope.kind === 'own' ? 'restore-failed' : 'switch-failed', err);
  }
  if (!stillWanted()) throw new FriendLiqueError('not-signed-in');
  setActiveScope(scope);
  applyProfileState(scope, state);
  applied?.();
}

/**
 * Last resort when MY_LIQUE must be shown (logout, account change, removal)
 * but cannot be read right now: nothing of the friend stays on screen; the
 * stores are empty and bound to MY_LIQUE until they can be read again.
 */
export function showEmptyOwnProfile(): void {
  setActiveScope(MY_LIQUE);
  applyProfileState(MY_LIQUE, {
    settings: pickDeviceSettings(useSettings.getState()),
    themes: [...BUILTIN_THEMES],
    library: { categories: [], media: [] },
    playlists: [],
    favorites: { favorites: [], stations: {}, own: null },
  });
}
