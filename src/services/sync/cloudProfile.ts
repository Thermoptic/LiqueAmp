// The cloud side of profile sync, as a port (D16: Supabase is the selected
// backend; this interface keeps the app independent of its SDK and of the
// still-open authentication method). The server is authoritative: it checks
// ownership, owns the revision number and rejects stale uploads.
import type { ProfileSummary } from '../profile/summary';

export interface CloudProfileHead {
  revision: number;
  updatedAt: string;
}

export interface CloudProfileDocument extends CloudProfileHead {
  /** The serialized LiqueAmpProfile, exactly as stored. Parsed and validated by the client. */
  text: string;
}

export type CloudUploadResult =
  | { ok: true; revision: number; updatedAt: string }
  /** The cloud profile changed since `expectedRevision`; nothing was written. */
  | { ok: false; reason: 'conflict'; cloud: CloudProfileHead };

export interface CloudProfileStore {
  /** Revision of the signed-in user's cloud profile, or null when there is none. */
  head(userId: string): Promise<CloudProfileHead | null>;
  download(userId: string): Promise<CloudProfileDocument | null>;
  /**
   * Stores the profile only if the cloud revision still equals
   * `expectedRevision` (0 = there must be no cloud profile yet). The server
   * increments the revision and sets updatedAt.
   */
  upload(userId: string, upload: { text: string; summary: ProfileSummary; expectedRevision: number }): Promise<CloudUploadResult>;
  /** Permanently deletes the user's cloud profile (and summary). */
  remove(userId: string): Promise<void>;
}
