// Structured export/import of local LIQUEAMP data (ARCH §28, SPEC §38,
// MASTER §35). Import is validate → preview → apply: nothing is written
// until the user confirms, and the write is one IndexedDB transaction, so a
// failure leaves the existing data exactly as it was.
import { mediaIdentity } from '../../stores/libraryStore';
import { pickSettings, sanitizeSettings } from '../../stores/settingsStore';
import { pickDeviceSettings, pickProfileSettings, type Settings } from '../../types/settings';
import type { Category, Favorite, HistoryEntry, MediaItem, Playlist, RadioStation } from '../../types/media';
import type { LiqueAmpTheme } from '../../types/theme';
import { profileKvKey, profileDb, repositories } from '../storage/repository';
import { assertWritableScope } from '../storage/scope';
import { validCategory, validFavorite, validHistory, validMedia, validPlaylist, validStation, validTheme } from './validate';

export const BACKUP_FORMAT = 'liqueamp-backup';
export const BACKUP_VERSION = 1;
/** Refuse absurd files before parsing them. */
export const MAX_BACKUP_BYTES = 50 * 1024 * 1024;

export interface BackupData {
  settings?: Settings;
  themes: LiqueAmpTheme[];
  categories: Category[];
  media: MediaItem[];
  playlists: Playlist[];
  favorites: Favorite[];
  /** Saved station records behind favourite stations (they work without the directory). */
  stations: RadioStation[];
  history?: HistoryEntry[];
}

export interface BackupFile {
  format: typeof BACKUP_FORMAT;
  version: number;
  exportedAt: string;
  app: 'LIQUEAMP';
  data: BackupData;
}

/**
 * Collects everything from local storage. There are no secrets or tokens
 * anywhere in LIQUEAMP's data, so nothing needs to be stripped (MASTER §35).
 */
export async function createBackup(settings: Settings, { includeHistory }: { includeHistory: boolean }): Promise<BackupFile> {
  const [themes, categories, media, playlists, favorites, stations, history] = await Promise.all([
    repositories.themes.getAll(),
    repositories.categories.getAll(),
    repositories.media.getAll(),
    repositories.playlists.getAll(),
    repositories.favorites.getAll(),
    repositories.stations.getAll(),
    includeHistory ? repositories.history.getAll() : Promise.resolve(undefined),
  ]);
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    app: 'LIQUEAMP',
    data: { settings: pickSettings(settings), themes: themes.filter((t) => t.source !== 'builtin'), categories, media, playlists, favorites, stations, ...(history ? { history } : {}) },
  };
}

export function backupFileName(date = new Date()): string {
  return `liqueamp-backup-${date.toISOString().slice(0, 10)}.json`;
}

// ---- parsing ---------------------------------------------------------------

export interface Checked<T> {
  items: T[];
  /** Records that failed validation and will not be imported. */
  invalid: number;
}

export interface ParsedBackup {
  exportedAt: string | null;
  settings: Partial<Settings> | null;
  themes: Checked<LiqueAmpTheme>;
  categories: Checked<Category>;
  media: Checked<MediaItem>;
  playlists: Checked<Playlist>;
  favorites: Checked<Favorite>;
  stations: Checked<RadioStation>;
  /** null when the file has no history. */
  history: Checked<HistoryEntry> | null;
}

export type ParseResult = { ok: true; backup: ParsedBackup } | { ok: false; error: string };

const COLLECTIONS = ['themes', 'categories', 'media', 'playlists', 'favorites', 'stations', 'history'] as const;

function check<T>(list: unknown[], valid: (v: unknown) => T | null, key: (t: T) => string): Checked<T> {
  const seen = new Set<string>();
  const items: T[] = [];
  let invalid = 0;
  for (const raw of list) {
    const v = valid(raw);
    if (!v || seen.has(key(v))) {
      invalid++;
      continue;
    }
    seen.add(key(v));
    items.push(v);
  }
  return { items, invalid };
}

/** Parses and validates a backup file without touching any data. */
export function parseBackup(text: string): ParseResult {
  if (text.length > MAX_BACKUP_BYTES) return { ok: false, error: 'The file is too large to be a LIQUEAMP backup.' };
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, error: 'The file is not valid JSON.' };
  }
  if (typeof raw !== 'object' || raw === null || (raw as { format?: unknown }).format !== BACKUP_FORMAT) {
    return { ok: false, error: 'This is not a LIQUEAMP backup file.' };
  }
  const file = raw as { version?: unknown; exportedAt?: unknown; data?: unknown };
  if (typeof file.version !== 'number' || !Number.isInteger(file.version) || file.version < 1) return { ok: false, error: 'The backup has no valid version.' };
  if (file.version > BACKUP_VERSION) return { ok: false, error: `The backup was made by a newer LIQUEAMP (format ${file.version}); this version reads format ${BACKUP_VERSION}.` };
  const result = validateBackupData(file.data);
  if (!result.ok) return result;
  return { ok: true, backup: { ...result.backup, exportedAt: typeof file.exportedAt === 'string' ? file.exportedAt : null } };
}

/**
 * Validates the data section of a backup (or of a profile, which carries the
 * same data): every record passes the validators in validate.ts, invalid and
 * duplicate records are counted and dropped. Untrusted input in, checked data out.
 */
export function validateBackupData(value: unknown): ParseResult {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return { ok: false, error: 'The backup contains no data section.' };
  const data = value as Record<string, unknown>;
  for (const key of COLLECTIONS) {
    if (key in data && !Array.isArray(data[key])) return { ok: false, error: `“${key}” in the backup is not a list.` };
  }
  const list = (key: (typeof COLLECTIONS)[number]) => (Array.isArray(data[key]) ? (data[key] as unknown[]) : []);
  const byId = <T extends { id: string }>(t: T) => t.id;
  const settings = typeof data.settings === 'object' && data.settings !== null ? sanitizeSettings(data.settings as Partial<Settings>) : null;
  return {
    ok: true,
    backup: {
      exportedAt: null,
      settings: settings && Object.keys(settings).length ? settings : null,
      themes: check(list('themes'), validTheme, byId),
      categories: check(list('categories'), validCategory, byId),
      media: check(list('media'), validMedia, byId),
      playlists: check(list('playlists'), validPlaylist, byId),
      favorites: check(list('favorites'), validFavorite, byId),
      stations: check(list('stations'), validStation, byId),
      history: Array.isArray(data.history) ? check(data.history, validHistory, byId) : null,
    },
  };
}

// ---- planning --------------------------------------------------------------

export type ImportMode = 'merge' | 'replace';

export interface ImportOptions {
  mode: ImportMode;
  settings: boolean;
  history: boolean;
}

export interface ExistingData {
  themes: LiqueAmpTheme[];
  categories: Category[];
  media: MediaItem[];
  playlists: Playlist[];
  favorites: Favorite[];
  stations: RadioStation[];
  history: HistoryEntry[];
}

export interface CollectionPlan {
  added: number;
  updated: number;
  /** Same source already in the library under another id — merged into it. */
  merged?: number;
}

export interface ImportPlan {
  write: {
    themes: LiqueAmpTheme[];
    categories: Category[];
    media: MediaItem[];
    playlists: Playlist[];
    favorites: Favorite[];
    stations: RadioStation[];
    history: HistoryEntry[] | null;
    settings: Partial<Settings> | null;
  };
  counts: Record<'themes' | 'categories' | 'media' | 'playlists' | 'favorites' | 'stations' | 'history', CollectionPlan>;
  /** Replace mode: how many existing records are removed first. */
  removed: Record<'themes' | 'categories' | 'media' | 'playlists' | 'favorites' | 'stations' | 'history', number>;
}

function counted<T extends { id: string }>(incoming: T[], existing: T[], mode: ImportMode): CollectionPlan {
  if (mode === 'replace') return { added: incoming.length, updated: 0 };
  const ids = new Set(existing.map((e) => e.id));
  const updated = incoming.filter((i) => ids.has(i.id)).length;
  return { added: incoming.length - updated, updated };
}

/**
 * Works out exactly what an import will write. In merge mode a backup item
 * whose source is already in the library under a different id is merged
 * into the existing item, and playlists/favourites/history are pointed at it
 * — so importing the same backup twice never duplicates the library.
 */
export function planImport(backup: ParsedBackup, existing: ExistingData, options: ImportOptions): ImportPlan {
  const { mode } = options;
  const remap = new Map<string, string>();
  let media = backup.media.items;
  let merged = 0;
  if (mode === 'merge') {
    const existingIds = new Set(existing.media.map((m) => m.id));
    const byIdentity = new Map(existing.media.map((m) => [mediaIdentity(m), m.id]));
    media = media.filter((m) => {
      if (existingIds.has(m.id)) return true;
      const same = byIdentity.get(mediaIdentity(m));
      if (same) {
        remap.set(m.id, same);
        merged++;
        return false;
      }
      return true;
    });
  }
  const mapId = (id: string) => remap.get(id) ?? id;
  const playlists = backup.playlists.items.map((p) => ({ ...p, items: p.items.map((it) => ({ ...it, mediaId: mapId(it.mediaId) })) }));
  const favorites = backup.favorites.items.map((f) => (f.type === 'media' ? { ...f, refId: mapId(f.refId), id: `media:${mapId(f.refId)}` } : f));
  const history = options.history && backup.history ? backup.history.items.map((h) => ({ ...h, mediaId: mapId(h.mediaId) })) : null;

  const removed = {
    themes: mode === 'replace' ? existing.themes.length : 0,
    categories: mode === 'replace' ? existing.categories.length : 0,
    media: mode === 'replace' ? existing.media.length : 0,
    playlists: mode === 'replace' ? existing.playlists.length : 0,
    favorites: mode === 'replace' ? existing.favorites.length : 0,
    stations: mode === 'replace' ? existing.stations.length : 0,
    history: mode === 'replace' && history ? existing.history.length : 0,
  };

  return {
    write: {
      themes: backup.themes.items,
      categories: backup.categories.items,
      media,
      playlists,
      favorites,
      stations: backup.stations.items,
      history,
      settings: options.settings ? backup.settings : null,
    },
    counts: {
      themes: counted(backup.themes.items, existing.themes, mode),
      categories: counted(backup.categories.items, existing.categories, mode),
      media: { ...counted(media, existing.media, mode), merged },
      playlists: counted(playlists, existing.playlists, mode),
      favorites: counted(favorites, existing.favorites, mode),
      stations: counted(backup.stations.items, existing.stations, mode),
      history: history ? counted(history, existing.history, mode) : { added: 0, updated: 0 },
    },
    removed,
  };
}

// ---- applying --------------------------------------------------------------

/**
 * Writes the plan in one transaction. Replace mode clears the imported
 * collections first — inside the same transaction, so an error rolls the
 * clear back too. The queue is never touched.
 */
export async function applyImport(plan: ImportPlan, mode: ImportMode): Promise<void> {
  // An import writes into the user's own profile; never into a friend's.
  assertWritableScope();
  const db = await profileDb();
  if (!db) throw new Error('Local storage is unavailable, so nothing was imported or changed.');
  const { write } = plan;
  const stores = ['themes', 'categories', 'media', 'playlists', 'favorites', 'stations', 'kv', 'history'] as const;
  const tx = db.transaction(stores, 'readwrite');
  const ops: Array<Promise<unknown>> = [];
  // Everything happens inside try: IndexedDB can also throw synchronously
  // (e.g. a record without its key). Any error aborts the transaction, which
  // undoes every write already queued in it — including a replace-mode clear.
  try {
    if (mode === 'replace') {
      for (const s of ['themes', 'categories', 'media', 'playlists', 'favorites', 'stations'] as const) ops.push(tx.objectStore(s).clear());
      if (write.history) ops.push(tx.objectStore('history').clear());
    }
    for (const t of write.themes) ops.push(tx.objectStore('themes').put(t));
    for (const c of write.categories) ops.push(tx.objectStore('categories').put(c));
    for (const m of write.media) ops.push(tx.objectStore('media').put(m));
    for (const p of write.playlists) ops.push(tx.objectStore('playlists').put(p));
    for (const f of write.favorites) ops.push(tx.objectStore('favorites').put(f));
    for (const st of write.stations) ops.push(tx.objectStore('stations').put(st));
    for (const h of write.history ?? []) ops.push(tx.objectStore('history').put(h));
    if (write.settings) {
      // Backups keep one flat settings object (format 1); stored, it is split
      // into the device record and the profile record, like settingsStore does.
      // A record is only written when the import has fields for it, so a
      // profile (which has no device settings) never resets this device's.
      const device = pickDeviceSettings(write.settings);
      const profile = pickProfileSettings(write.settings);
      if (Object.keys(device).length) ops.push(tx.objectStore('kv').put(device, 'settings'));
      if (Object.keys(profile).length) ops.push(tx.objectStore('kv').put(profile, profileKvKey('settings')));
    }
    await Promise.all([...ops, tx.done]);
  } catch (err) {
    try {
      tx.abort();
    } catch {
      // already aborted by the failing request
    }
    // queued requests reject once the transaction aborts; they are expected
    await Promise.allSettled([...ops, tx.done]);
    throw err instanceof Error ? err : new Error(String(err));
  }
}
