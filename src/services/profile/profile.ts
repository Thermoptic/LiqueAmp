// The canonical LiqueAmp profile (docs/LIQUEAMP_PROFILE_SPEC.md): one
// serializable representation of a user's shareable LiqueAmp, meant to be
// reused for the own profile, Friend Liques, snapshots, Packs and exports.
//
// It is the existing backup data (BackupData) in an envelope with profile
// metadata. Export, validation, import planning and the transactional import
// are the backup system's; nothing here duplicates them.
//
// Not in a profile: history and the queue (personal), device settings
// (volume, motion, …), and runtime state (playback, UI, audio graph).
import { DEFAULT_SETTINGS, pickProfileSettings, type ProfileSettings, type Settings } from '../../types/settings';
import { createBackup, validateBackupData, type BackupData, type ParsedBackup } from '../backup/backup';

export const PROFILE_FORMAT = 'liqueamp-profile';
/** Version of the profile envelope; independent of the backup file version. */
export const PROFILE_SCHEMA_VERSION = 1;
/**
 * Profiles are fetched for friends later, so they are held to a much smaller
 * limit than backup files (50 MB). A large personal library is well under 1 MB.
 */
export const MAX_PROFILE_BYTES = 5 * 1024 * 1024;

export const PROFILE_VISIBILITIES = ['PRIVATE', 'FRIENDS', 'PUBLIC'] as const;
export type ProfileVisibility = (typeof PROFILE_VISIBILITIES)[number];

export interface ProfileMeta {
  schemaVersion: number;
  /** Stable account id of the owner; null for a local profile without an account. Never a username. */
  ownerUserId: string | null;
  /** Increases with every saved change; 0 = local, never synchronized. */
  revision: number;
  updatedAt: string;
  visibility: ProfileVisibility;
}

/** The profile content: backup data without history, with profile settings only. */
export interface ProfileData extends Omit<BackupData, 'settings' | 'history'> {
  settings: ProfileSettings;
}

export interface LiqueAmpProfile {
  format: typeof PROFILE_FORMAT;
  meta: ProfileMeta;
  data: ProfileData;
}

/** Profile content from backup data: drops history and every device setting. */
export function profileDataFromBackup(data: BackupData): ProfileData {
  const { history: _history, settings, ...collections } = data;
  return { ...collections, settings: pickProfileSettings({ ...DEFAULT_SETTINGS, ...settings }) };
}

/** The active profile as a LiqueAmpProfile, read through the backup exporter. */
export async function createProfile(settings: Settings, meta: Partial<ProfileMeta> = {}): Promise<LiqueAmpProfile> {
  const backup = await createBackup(settings, { includeHistory: false });
  return {
    format: PROFILE_FORMAT,
    meta: {
      schemaVersion: PROFILE_SCHEMA_VERSION,
      ownerUserId: meta.ownerUserId ?? null,
      revision: meta.revision ?? 0,
      updatedAt: meta.updatedAt ?? new Date().toISOString(),
      visibility: meta.visibility ?? 'PRIVATE',
    },
    data: profileDataFromBackup(backup.data),
  };
}

export function serializeProfile(profile: LiqueAmpProfile): string {
  return JSON.stringify(profile);
}

export interface ParsedProfile {
  meta: ProfileMeta;
  /**
   * The validated content in the backup system's parsed form, so it can go
   * straight into planImport()/applyImport(). History is always null and
   * settings contain profile settings only.
   */
  content: ParsedBackup;
}

export type ProfileParseResult = { ok: true; profile: ParsedProfile } | { ok: false; error: string };

const isIsoDate = (v: unknown): v is string => typeof v === 'string' && !Number.isNaN(Date.parse(v));

function validMeta(v: unknown): ProfileMeta | string {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return 'The profile has no metadata.';
  const m = v as Record<string, unknown>;
  if (typeof m.schemaVersion !== 'number' || !Number.isInteger(m.schemaVersion) || m.schemaVersion < 1) return 'The profile has no valid schema version.';
  if (m.schemaVersion > PROFILE_SCHEMA_VERSION) return `The profile was made by a newer LiqueAmp (schema ${m.schemaVersion}); this version reads schema ${PROFILE_SCHEMA_VERSION}.`;
  if (m.ownerUserId !== null && (typeof m.ownerUserId !== 'string' || !m.ownerUserId.trim() || m.ownerUserId.length > 200)) return 'The profile owner is not valid.';
  if (typeof m.revision !== 'number' || !Number.isInteger(m.revision) || m.revision < 0) return 'The profile revision is not valid.';
  if (!isIsoDate(m.updatedAt)) return 'The profile has no valid update time.';
  if (!PROFILE_VISIBILITIES.includes(m.visibility as ProfileVisibility)) return 'The profile visibility is not valid.';
  return {
    schemaVersion: m.schemaVersion,
    ownerUserId: m.ownerUserId,
    revision: m.revision,
    updatedAt: m.updatedAt,
    visibility: m.visibility as ProfileVisibility,
  };
}

/**
 * Parses and validates a profile from untrusted text (a friend, the cloud, a
 * file). Nothing is written. Records go through the backup validators; history
 * and device settings are never taken from a profile, even if present.
 */
export function parseProfile(text: string): ProfileParseResult {
  if (text.length > MAX_PROFILE_BYTES) return { ok: false, error: 'The profile is too large.' };
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, error: 'The profile is not valid JSON.' };
  }
  if (typeof raw !== 'object' || raw === null || (raw as { format?: unknown }).format !== PROFILE_FORMAT) {
    return { ok: false, error: 'This is not a LiqueAmp profile.' };
  }
  const file = raw as { meta?: unknown; data?: unknown };
  const meta = validMeta(file.meta);
  if (typeof meta === 'string') return { ok: false, error: meta };
  const content = validateBackupData(file.data);
  if (!content.ok) return content;
  const settings = content.backup.settings ? pickProfileSettings(content.backup.settings) : null;
  return {
    ok: true,
    profile: {
      meta,
      content: {
        ...content.backup,
        settings: settings && Object.keys(settings).length ? settings : null,
        history: null,
      },
    },
  };
}
