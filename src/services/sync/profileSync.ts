// Own-profile sync between MY_LIQUE and the account's cloud profile
// (D7–D9, D13, D14 in docs/LIQUEAMP_IMPLEMENTATION_PLAN.md).
//
// Rules:
// - The server owns the revision. An upload only succeeds while the cloud is
//   still at the local baseRevision; local edits only set `dirty`.
// - A download only replaces the local profile when it has no unsynced changes.
// - Both changed = conflict: nothing is overwritten; the user decides (later UI).
// - A local profile that belongs to another account is never uploaded,
//   overwritten or mixed (ownership guard).
// - Queue, history and device settings are never part of any of this.
// - Before an upload every URL is checked; suspicious items need a decision.
import type { Settings } from '../../types/settings';
import { applyImport, planImport, type ExistingData } from '../backup/backup';
import { createProfile, parseProfile, serializeProfile } from '../profile/profile';
import { applySharingDecisions, sanitizeForSharing, undecided, type SharingDecision, type SharingFinding } from '../profile/sharing';
import { summarizeProfile } from '../profile/summary';
import { repositories } from '../storage/repository';
import type { CloudProfileHead, CloudProfileStore } from './cloudProfile';
import {
  assertLocalProfileOwner,
  hasLocalProfileData,
  localOwnership,
  ownProfileWriteCount,
  ProfileOwnershipError,
  readOwnProfileMeta,
  writeOwnProfileMeta,
  type OwnProfileMeta,
} from './ownProfileMeta';

export type SyncContext = 'sign-up' | 'sign-in';

export type SyncAction =
  | 'in-sync'
  | 'upload' // local changes; cloud unchanged (or no cloud profile yet)
  | 'download' // cloud newer; no local changes
  | 'adopt-and-upload' // the local profile becomes this account's profile (D7)
  | 'conflict' // both changed since the last sync: the user decides
  | 'resolve-local' // the device has a local Lique that is not linked to this account: the user decides
  | 'blocked-other-account'; // the local Lique belongs to another account: never touched

/** What to do, from the local sync state and the cloud head. Pure. */
export function decideSync(meta: OwnProfileMeta, userId: string, cloud: CloudProfileHead | null, context: SyncContext, localHasData: boolean): SyncAction {
  const owner = localOwnership(meta, userId);
  if (owner === 'other-account') return 'blocked-other-account';
  if (owner === 'unlinked') {
    if (context === 'sign-up') return cloud ? 'resolve-local' : 'adopt-and-upload';
    if (!localHasData) return cloud ? 'download' : 'adopt-and-upload';
    return 'resolve-local';
  }
  if (!cloud) return 'upload';
  if (cloud.revision === meta.baseRevision) return meta.dirty ? 'upload' : 'in-sync';
  if (cloud.revision > meta.baseRevision) return meta.dirty ? 'conflict' : 'download';
  return 'conflict'; // cloud behind the local base: never guess
}

export class SyncError extends Error {}

async function ownExisting(): Promise<ExistingData> {
  const [themes, categories, media, playlists, favorites, stations, history] = await Promise.all([
    repositories.themes.getAll(),
    repositories.categories.getAll(),
    repositories.media.getAll(),
    repositories.playlists.getAll(),
    repositories.favorites.getAll(),
    repositories.stations.getAll(),
    repositories.history.getAll(),
  ]);
  return { themes, categories, media, playlists, favorites, stations, history };
}

export interface UploadOptions {
  userId: string;
  username: string;
  cloud: CloudProfileStore;
  /** The settings store (profile settings are read from the own profile). */
  settings: Settings;
  /** The user's decisions for suspicious URLs, by finding key. */
  decisions?: Record<string, SharingDecision>;
}

export type UploadResult =
  | { status: 'uploaded'; revision: number }
  /** Suspicious URLs without a decision: nothing was uploaded. The user chooses per item, or cancels. */
  | { status: 'needs-review'; findings: SharingFinding[] }
  | { status: 'conflict'; cloud: CloudProfileHead };

/** Uploads the own profile to the account it belongs to. */
export async function uploadOwnProfile({ userId, username, cloud, settings, decisions = {} }: UploadOptions): Promise<UploadResult> {
  const meta = await readOwnProfileMeta();
  assertLocalProfileOwner(meta, userId);
  const writesBefore = ownProfileWriteCount();
  const profile = await createProfile(settings, { ownerUserId: userId, revision: meta.baseRevision, visibility: 'PRIVATE' });
  const { findings } = sanitizeForSharing(profile);
  const pending = undecided(findings, decisions);
  if (pending.length) return { status: 'needs-review', findings: pending };
  const shared = applySharingDecisions(profile, findings, decisions);
  const result = await cloud.upload(userId, { text: serializeProfile(shared), summary: summarizeProfile(shared, username), expectedRevision: meta.baseRevision });
  if (!result.ok) return { status: 'conflict', cloud: result.cloud };
  const latest = await readOwnProfileMeta();
  await writeOwnProfileMeta({
    ...latest,
    ownerUserId: userId,
    baseRevision: result.revision,
    // edits made while uploading are not in the cloud yet
    dirty: ownProfileWriteCount() !== writesBefore,
    lastSyncedAt: new Date().toISOString(),
  });
  return { status: 'uploaded', revision: result.revision };
}

/**
 * Create Account (D7): the existing local Lique becomes the account's initial
 * cloud profile — the user does not start over. Refused if the local profile
 * belongs to another account or the account already has a cloud profile.
 */
export async function adoptLocalProfile(options: UploadOptions): Promise<UploadResult> {
  const meta = await readOwnProfileMeta();
  assertLocalProfileOwner(meta, options.userId, { allowUnlinked: true });
  if (meta.ownerUserId === null) {
    if (await options.cloud.head(options.userId)) throw new SyncError('This account already has a cloud profile; it is not replaced by this device’s LiqueAmp.');
    await writeOwnProfileMeta({ ownerUserId: options.userId, baseRevision: 0, dirty: true, lastSyncedAt: null });
  }
  return uploadOwnProfile(options);
}

/**
 * Installs the account's cloud profile into MY_LIQUE (D8), through the safe
 * import path: profile data is replaced; queue, history and device settings
 * stay. Refused over unsynced local changes, over a local Lique of another
 * account, and over an unlinked local Lique that has data.
 * The caller rehydrates the stores afterwards.
 */
export async function downloadOwnProfile({ userId, cloud }: { userId: string; cloud: CloudProfileStore }): Promise<{ revision: number }> {
  const meta = await readOwnProfileMeta();
  const owner = localOwnership(meta, userId);
  if (owner === 'other-account') assertLocalProfileOwner(meta, userId);
  if (owner === 'unlinked' && (await hasLocalProfileData())) throw new ProfileOwnershipError('This device has its own LiqueAmp; it is not replaced by the account profile without a decision.');
  if (owner === 'same-account' && meta.dirty) throw new SyncError('This device has changes that are not synced; they are not overwritten.');

  const doc = await cloud.download(userId);
  if (!doc) throw new SyncError('The account has no cloud profile.');
  const parsed = parseProfile(doc.text);
  if (!parsed.ok) throw new SyncError(`The cloud profile is not valid: ${parsed.error}`);
  if (parsed.profile.meta.ownerUserId !== userId) throw new SyncError('The cloud profile belongs to another account.');

  const plan = planImport(parsed.profile.content, await ownExisting(), { mode: 'replace', settings: true, history: false });
  await applyImport(plan, 'replace');
  await writeOwnProfileMeta({ ownerUserId: userId, baseRevision: doc.revision, dirty: false, lastSyncedAt: new Date().toISOString() });
  return { revision: doc.revision };
}

export type SyncResult =
  | { status: 'in-sync' }
  | { status: 'uploaded'; revision: number }
  | { status: 'downloaded'; revision: number }
  | { status: 'needs-review'; findings: SharingFinding[] }
  | { status: 'conflict'; cloud: CloudProfileHead | null }
  | { status: 'resolve-local' }
  | { status: 'blocked-other-account' };

/** One sync pass after sign-up / sign-in / reconnect. Never overwrites anything it should not. */
export async function syncOwnProfile(options: UploadOptions & { context: SyncContext }): Promise<SyncResult> {
  const meta = await readOwnProfileMeta();
  const head = await options.cloud.head(options.userId);
  const action = decideSync(meta, options.userId, head, options.context, await hasLocalProfileData());
  switch (action) {
    case 'in-sync':
      return { status: 'in-sync' };
    case 'blocked-other-account':
    case 'resolve-local':
      return { status: action };
    case 'conflict':
      return { status: 'conflict', cloud: head };
    case 'download':
      return { status: 'downloaded', ...(await downloadOwnProfile(options)) };
    case 'adopt-and-upload':
    case 'upload': {
      const r = action === 'upload' ? await uploadOwnProfile(options) : await adoptLocalProfile(options);
      return r;
    }
  }
}

/**
 * After the cloud account is deleted (D15): the local Lique stays exactly as
 * it is, and is no longer linked to any account.
 */
export async function unlinkLocalProfile(): Promise<void> {
  const meta = await readOwnProfileMeta();
  await writeOwnProfileMeta({ ...meta, ownerUserId: null, baseRevision: 0, lastSyncedAt: null });
}
