// Friend access (D12, D17): one-way, no requests. When I add someone by their
// exact username I may READ their Lique; they gain nothing and are not told.
// The database is authoritative (supabase/migrations/*_liqueamp_friends.sql,
// RLS); this interface only describes what the app can ask for. Activating a
// Friend Lique (a friend: profile scope) and the Friends UI come later.
import type { CloudProfileDocument } from '../sync/cloudProfile';

export interface Friend {
  userId: string;
  /** As its owner wrote it (case kept). */
  username: string;
  /** When I added them. */
  addedAt: string;
}

export type FriendErrorCode = 'not-signed-in' | 'username-invalid' | 'not-found' | 'self' | 'already-added';

export const FRIEND_MESSAGES: Record<FriendErrorCode, string> = {
  'not-signed-in': 'Sign in to add friends.',
  'username-invalid': 'That is not a valid username.',
  'not-found': 'No one has that username.',
  self: 'That is your own username.',
  'already-added': 'You have already added them.',
};

/** A friend-specific outcome a LiqueAmp user can understand; the technical cause is kept for logs only. */
export class FriendError extends Error {
  constructor(
    readonly code: FriendErrorCode,
    message: string,
    readonly cause?: unknown,
  ) {
    super(message);
  }
}

export const friendError = (code: FriendErrorCode, cause?: unknown) => new FriendError(code, FRIEND_MESSAGES[code], cause);

/**
 * The signed-in user's outgoing relationships. Backend failures (offline,
 * expired session …) reject with an AccountError, as in the rest of the
 * cloud layer; the friend-specific outcomes reject with a FriendError.
 */
export interface FriendDirectory {
  /** Adds the user with exactly this username (case-insensitive). */
  add(username: string): Promise<Friend>;
  /** Everyone I added, sorted by username. */
  list(): Promise<Friend[]>;
  /** Stops reading their Lique. Removing someone not added is a no-op. */
  remove(friendUserId: string): Promise<void>;
  /** Their cloud Lique, read-only; null if they have none or I may not read it. */
  readProfile(friendUserId: string): Promise<CloudProfileDocument | null>;
}
