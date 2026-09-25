// Friend Liques on Home: the signed-in user's list, add/remove, the read-only
// preview of one friend's Lique (checkpoint 7) and activating it (checkpoint
// 8). Not persisted: the list is read from the account backend while signed
// in and forgotten on sign-out, and an active Friend Lique ends with the
// session — a reload always starts in MY_LIQUE.
import { create } from 'zustand';
import { AccountError } from '../services/account/account';
import { FRIEND_MESSAGES, FriendError, type Friend, type FriendDirectory } from '../services/friends/friends';
import type { FriendLiqueSummary } from '../services/friends/friendSummary';
import { FriendLiqueError, prepareFriendLique, switchProfile } from '../services/friends/activation';
import { deleteFriendProfileCache, friendScope } from '../services/profile/profileCache';
import { getActiveScope, MY_LIQUE } from '../services/storage/scope';
import { accountUser, useAccount } from './accountStore';

export type FriendPreview =
  | { status: 'idle' }
  | { status: 'loading'; friendId: string }
  | { status: 'ready'; friendId: string; summary: FriendLiqueSummary }
  /** They have no cloud Lique yet (or it cannot be read by me any more). */
  | { status: 'none'; friendId: string }
  | { status: 'error'; friendId: string; message: string };

/** The Friend Lique being shown instead of MY_LIQUE (only one at a time). */
export interface ActiveFriendLique {
  userId: string;
  username: string;
  /** 'cache': offline, the copy validated and stored on this device earlier. */
  source: 'cloud' | 'cache';
}

export type ActivationState =
  | { status: 'idle' }
  | { status: 'working'; friendId: string | null; action: 'activate' | 'return' }
  | { status: 'error'; friendId: string; message: string };

interface FriendsState {
  directory: FriendDirectory | null;
  /** Whose list is loaded (the signed-in user), or null. */
  userId: string | null;
  status: 'idle' | 'loading' | 'ready' | 'error';
  friends: Friend[];
  error: string | null;
  selectedId: string | null;
  preview: FriendPreview;
  active: ActiveFriendLique | null;
  activation: ActivationState;

  setDirectory(directory: FriendDirectory | null): void;
  /** Loads the list for this user; null forgets everything (signed out). */
  load(userId: string | null): Promise<void>;
  /** Rejects with a message the user can read. */
  add(username: string): Promise<Friend>;
  remove(friendId: string): Promise<void>;
  /** Shows the preview of a friend's Lique (null closes it). */
  select(friendId: string | null): Promise<void>;
  /** Shows this friend's Lique instead of MY_LIQUE (read-only). Failures leave MY_LIQUE active and land in `activation`. */
  activate(friendId: string): Promise<void>;
  /** Back to MY_LIQUE, exactly as it was. */
  returnToMyLique(): Promise<void>;
}

export function friendErrorMessage(err: unknown): string {
  if (err instanceof FriendError || err instanceof AccountError || err instanceof FriendLiqueError) return err.message;
  return 'Something went wrong. Try again.';
}

const empty = (): Pick<FriendsState, 'userId' | 'status' | 'friends' | 'error' | 'selectedId' | 'preview' | 'activation'> => ({
  userId: null,
  status: 'idle',
  friends: [],
  error: null,
  selectedId: null,
  preview: { status: 'idle' },
  activation: { status: 'idle' },
});

// Profile switches run one after another, never interleaved: rapid clicks
// (activate A, activate B, return) are applied in order, each completely.
let switching: Promise<unknown> = Promise.resolve();
function serially<T>(task: () => Promise<T>): Promise<T> {
  const next = switching.then(task, task);
  switching = next.catch(() => undefined);
  return next;
}

export const useFriends = create<FriendsState>()((set, get) => {
  async function backToOwn() {
    if (!get().active && getActiveScope().kind === 'own') return;
    set({ activation: { status: 'working', friendId: get().active?.userId ?? null, action: 'return' } });
    try {
      await switchProfile(MY_LIQUE);
    } finally {
      set({ active: null, activation: { status: 'idle' } });
    }
    // own changes made meanwhile (favourites) are uploaded now
    void useAccount.getState().syncNow();
  }

  return {
    directory: null,
    ...empty(),
    active: null,

    setDirectory(directory) {
      if (get().active) void get().returnToMyLique();
      set({ directory, ...empty() });
    },

    async load(userId) {
      const { directory } = get();
      if (!userId || !directory) {
        if (get().active) await get().returnToMyLique(); // signed out: never stay in someone's Lique
        set(empty());
        return;
      }
      const sameUser = get().userId === userId;
      if (!sameUser && get().active) await get().returnToMyLique();
      set({ userId, status: 'loading', error: null, ...(sameUser ? {} : { friends: [], selectedId: null, preview: { status: 'idle' } }) });
      try {
        const friends = await directory.list();
        if (get().userId !== userId) return; // signed out or switched meanwhile
        set({ friends, status: 'ready' });
        // removed elsewhere: their Lique is not mine to show any more
        const active = get().active;
        if (active && !friends.some((f) => f.userId === active.userId)) await get().returnToMyLique();
      } catch (err) {
        if (get().userId !== userId) return;
        set({ status: 'error', error: friendErrorMessage(err) });
      }
    },

    async add(username) {
      const { directory, userId } = get();
      if (!directory || !userId) throw new Error(FRIEND_MESSAGES['not-signed-in']);
      let friend: Friend;
      try {
        friend = await directory.add(username);
      } catch (err) {
        throw new Error(friendErrorMessage(err));
      }
      if (get().userId === userId) {
        const friends = [...get().friends.filter((f) => f.userId !== friend.userId), friend].sort((a, b) => a.username.localeCompare(b.username, undefined, { sensitivity: 'base' }));
        set({ friends, status: 'ready', error: null });
      }
      return friend;
    },

    async remove(friendId) {
      const { directory, userId } = get();
      if (!directory || !userId) throw new Error(FRIEND_MESSAGES['not-signed-in']);
      if (get().active?.userId === friendId) await get().returnToMyLique(); // spec §27: back to My Lique first
      try {
        await directory.remove(friendId);
      } catch (err) {
        throw new Error(friendErrorMessage(err));
      }
      // their local copy goes too (spec §27)
      await deleteFriendProfileCache(friendId).catch(() => undefined);
      if (get().userId !== userId) return;
      const closing = get().selectedId === friendId;
      set({ friends: get().friends.filter((f) => f.userId !== friendId), ...(closing ? { selectedId: null, preview: { status: 'idle' } } : {}) });
    },

    async select(friendId) {
      const { directory } = get();
      if (!friendId || !directory) {
        set({ selectedId: null, preview: { status: 'idle' } });
        return;
      }
      set({ selectedId: friendId, preview: { status: 'loading', friendId } });
      let next: FriendPreview;
      try {
        const summary = await directory.readSummary(friendId);
        next = summary ? { status: 'ready', friendId, summary } : { status: 'none', friendId };
      } catch (err) {
        next = { status: 'error', friendId, message: friendErrorMessage(err) };
      }
      if (get().selectedId === friendId) set({ preview: next });
    },

    activate(friendId) {
      return serially(async () => {
        const { directory, userId } = get();
        const friend = get().friends.find((f) => f.userId === friendId);
        const fail = (err: unknown) => set({ activation: { status: 'error', friendId, message: friendErrorMessage(err) } });
        if (!directory || !userId) return fail(new FriendLiqueError('not-signed-in'));
        if (!friend) return fail(new FriendLiqueError('not-a-friend'));
        if (get().active?.userId === friendId) return;
        set({ activation: { status: 'working', friendId, action: 'activate' } });
        try {
          const { source } = await prepareFriendLique(directory, friendId);
          if (get().userId !== userId) throw new FriendLiqueError('not-signed-in'); // signed out meanwhile
          await switchProfile(friendScope(friendId)); // all stores, or back to MY_LIQUE
          set({ active: { userId: friendId, username: friend.username, source }, activation: { status: 'idle' } });
        } catch (err) {
          // whatever failed, MY_LIQUE is what is shown
          if (getActiveScope().kind !== 'own') await switchProfile(MY_LIQUE).catch(() => undefined);
          set({ active: null });
          fail(err);
        }
      });
    },

    returnToMyLique() {
      return serially(backToOwn);
    },
  };
});

// Logging out (or another account logging in) returns to MY_LIQUE and
// forgets the previous account's list, whether or not the Friend Liques panel
// is on screen (load() does both).
useAccount.subscribe((state, prev) => {
  const now = accountUser(state.state)?.userId ?? null;
  if (now !== (accountUser(prev.state)?.userId ?? null)) void useFriends.getState().load(now);
});
