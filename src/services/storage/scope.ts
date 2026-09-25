// Profile scope (docs/LIQUEAMP_PROFILE_SPEC.md §23, §25): every read and
// write of profile data belongs to one profile: the user's own, or the
// cached, read-only profile of a friend whose Lique is active (checkpoint 8).
// Friend scopes cannot be written, so a friend's data never lands in the own
// profile and nothing is ever written into a friend's.
//
// Which data is scoped:
//   profile  — settings that travel with a profile, themes, categories,
//              media, playlists, favourites, stations
//   personal — history and the queue: always the user's own, whatever
//              profile is active
//   device   — device settings (volume, motion, …): always this device's

export type ProfileScope = { kind: 'own' } | { kind: 'friend'; userId: string };

/** The user's own LiqueAmp: the existing local data. */
export const MY_LIQUE: ProfileScope = Object.freeze({ kind: 'own' });

/** Stable text id of a scope: `own` or `friend:<userId>`. */
export function scopeId(scope: ProfileScope): string {
  return scope.kind === 'own' ? 'own' : `friend:${scope.userId}`;
}

/** Friend profiles are read-only: nothing may be written into them. */
export function isReadOnlyScope(scope: ProfileScope): boolean {
  return scope.kind !== 'own';
}

export class ProfileScopeError extends Error {}

let active: ProfileScope = MY_LIQUE;
const listeners = new Set<(scope: ProfileScope) => void>();

/** The profile the app is currently showing. Session state: never persisted, a reload starts in MY_LIQUE. */
export function getActiveScope(): ProfileScope {
  return active;
}

/**
 * Changes the active profile scope. Only the Friend Lique activation
 * (src/services/friends/activation.ts: switchProfile) calls this in the app;
 * it re-hydrates every profile store afterwards.
 */
export function setActiveScope(scope: ProfileScope): void {
  active = scope.kind === 'own' ? MY_LIQUE : Object.freeze({ kind: 'friend', userId: scope.userId });
  listeners.forEach((l) => l(active));
}

export function onActiveScope(listener: (scope: ProfileScope) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Whether `scope` is (still) the active scope — e.g. after an await. */
export function isActiveScope(scope: ProfileScope): boolean {
  return scopeId(scope) === scopeId(active);
}

/** What a refused write says: a Friend Lique is read-only. */
export const READ_ONLY_SCOPE_MESSAGE = 'This Friend Lique is read-only. Return to My Lique to change your own.';

/** Throws unless profile data may be written in the active scope. */
export function assertWritableScope(scope: ProfileScope = active): void {
  if (isReadOnlyScope(scope)) throw new ProfileScopeError(READ_ONLY_SCOPE_MESSAGE);
}
