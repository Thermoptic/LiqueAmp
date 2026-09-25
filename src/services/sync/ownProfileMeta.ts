// Sync state of the user's own profile (D9, docs/LIQUEAMP_IMPLEMENTATION_PLAN.md):
// `profile.meta` in the MY_LIQUE database. It records which account the local
// profile belongs to, which cloud revision it is based on, and whether it has
// changed since. The server owns the revision number; local edits only set
// `dirty`.
import { getDb, PROFILE_STORES } from '../storage/db';
import { onOwnProfileWrite, profileKvKey } from '../storage/repository';

export interface OwnProfileMeta {
  /** The account this local profile belongs to; null = a local profile without an account. */
  ownerUserId: string | null;
  /** The cloud revision the local profile is based on; 0 = never uploaded or downloaded. */
  baseRevision: number;
  /** Changed locally since the last successful sync. */
  dirty: boolean;
  lastSyncedAt: string | null;
}

export const UNLINKED_META: OwnProfileMeta = Object.freeze({ ownerUserId: null, baseRevision: 0, dirty: false, lastSyncedAt: null });

const KEY = profileKvKey('meta');

function valid(v: unknown): OwnProfileMeta {
  if (!v || typeof v !== 'object') return { ...UNLINKED_META };
  const m = v as Record<string, unknown>;
  return {
    ownerUserId: typeof m.ownerUserId === 'string' && m.ownerUserId ? m.ownerUserId : null,
    baseRevision: typeof m.baseRevision === 'number' && Number.isInteger(m.baseRevision) && m.baseRevision >= 0 ? m.baseRevision : 0,
    dirty: m.dirty === true,
    lastSyncedAt: typeof m.lastSyncedAt === 'string' ? m.lastSyncedAt : null,
  };
}

// The meta record is written directly (not through profileKvFor) so that
// recording sync state does not itself count as a profile change.
export async function readOwnProfileMeta(): Promise<OwnProfileMeta> {
  const db = await getDb();
  return valid(db ? await db.get('kv', KEY) : undefined);
}

export async function writeOwnProfileMeta(meta: OwnProfileMeta): Promise<void> {
  const db = await getDb();
  if (db) await db.put('kv', { ...meta }, KEY);
}

// ---- dirty tracking ------------------------------------------------------------

let writes = 0;

/** A counter of own-profile writes this session; an upload compares it before and after. */
export function ownProfileWriteCount(): number {
  return writes;
}

/** Starts marking the own profile dirty on every write. Idempotent. */
let stopTracking: (() => void) | null = null;
export function startDirtyTracking(): void {
  if (stopTracking) return;
  stopTracking = onOwnProfileWrite(async () => {
    writes++;
    const meta = await readOwnProfileMeta();
    if (!meta.dirty) await writeOwnProfileMeta({ ...meta, dirty: true });
  });
}

export function stopDirtyTracking(): void {
  stopTracking?.();
  stopTracking = null;
}

// ---- ownership -------------------------------------------------------------------

export type LocalOwnership = 'unlinked' | 'same-account' | 'other-account';

/** Whose local profile this is, relative to an account. */
export function localOwnership(meta: OwnProfileMeta, userId: string): LocalOwnership {
  if (meta.ownerUserId === null) return 'unlinked';
  return meta.ownerUserId === userId ? 'same-account' : 'other-account';
}

export class ProfileOwnershipError extends Error {}

/**
 * The guard against mixing accounts: throws unless the local profile belongs
 * to `userId` (or, with `allowUnlinked`, to no account yet).
 */
export function assertLocalProfileOwner(meta: OwnProfileMeta, userId: string, { allowUnlinked = false } = {}): void {
  const o = localOwnership(meta, userId);
  if (o === 'other-account') throw new ProfileOwnershipError('This device’s LiqueAmp belongs to another account. It is never mixed with or uploaded to this account.');
  if (o === 'unlinked' && !allowUnlinked) throw new ProfileOwnershipError('This device’s LiqueAmp is not linked to this account yet.');
}

/** Whether the local own profile holds any profile data (library, themes, profile settings …). */
export async function hasLocalProfileData(): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;
  for (const store of PROFILE_STORES) if ((await db.count(store)) > 0) return true;
  return (await db.get('kv', profileKvKey('settings'))) !== undefined;
}
