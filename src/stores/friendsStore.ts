// Friend Liques on Home (checkpoint 7): the signed-in user's list, add/remove
// and the read-only preview of one friend's Lique. Not persisted: the list is
// read from the account backend while signed in and forgotten on sign-out.
// Activating a Friend Lique is a later checkpoint; nothing here touches a
// profile scope or any local data.
import { create } from 'zustand';
import { AccountError } from '../services/account/account';
import { FRIEND_MESSAGES, FriendError, type Friend, type FriendDirectory } from '../services/friends/friends';
import type { FriendLiqueSummary } from '../services/friends/friendSummary';

export type FriendPreview =
  | { status: 'idle' }
  | { status: 'loading'; friendId: string }
  | { status: 'ready'; friendId: string; summary: FriendLiqueSummary }
  /** They have no cloud Lique yet (or it cannot be read by me any more). */
  | { status: 'none'; friendId: string }
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

  setDirectory(directory: FriendDirectory | null): void;
  /** Loads the list for this user; null forgets everything (signed out). */
  load(userId: string | null): Promise<void>;
  /** Rejects with a message the user can read. */
  add(username: string): Promise<Friend>;
  remove(friendId: string): Promise<void>;
  /** Shows the preview of a friend's Lique (null closes it). */
  select(friendId: string | null): Promise<void>;
}

export function friendErrorMessage(err: unknown): string {
  if (err instanceof FriendError || err instanceof AccountError) return err.message;
  return 'Something went wrong. Try again.';
}

const empty = (): Pick<FriendsState, 'userId' | 'status' | 'friends' | 'error' | 'selectedId' | 'preview'> => ({
  userId: null,
  status: 'idle',
  friends: [],
  error: null,
  selectedId: null,
  preview: { status: 'idle' },
});

export const useFriends = create<FriendsState>()((set, get) => ({
  directory: null,
  ...empty(),

  setDirectory(directory) {
    set({ directory, ...empty() });
  },

  async load(userId) {
    const { directory } = get();
    if (!userId || !directory) {
      set(empty());
      return;
    }
    const sameUser = get().userId === userId;
    set({ userId, status: 'loading', error: null, ...(sameUser ? {} : { friends: [], selectedId: null, preview: { status: 'idle' } }) });
    try {
      const friends = await directory.list();
      if (get().userId !== userId) return; // signed out or switched meanwhile
      set({ friends, status: 'ready' });
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
    try {
      await directory.remove(friendId);
    } catch (err) {
      throw new Error(friendErrorMessage(err));
    }
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
}));
