import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type {
  Category,
  Favorite,
  HistoryEntry,
  MediaItem,
  Playlist,
  RadioStation,
} from '../../types/media';
import type { LiqueAmpTheme } from '../../types/theme';

export const DB_NAME = 'liqueamp';
/** Bump when the schema changes and add a step to `migrate` (ARCH §51). */
export const DB_VERSION = 1;

export interface LiqueAmpDB extends DBSchema {
  kv: { key: string; value: unknown };
  media: { key: string; value: MediaItem; indexes: { byCategory: string; byProvider: string } };
  stations: { key: string; value: RadioStation };
  categories: { key: string; value: Category };
  playlists: { key: string; value: Playlist };
  favorites: { key: string; value: Favorite; indexes: { byType: string } };
  history: { key: string; value: HistoryEntry; indexes: { byStartedAt: string } };
  themes: { key: string; value: LiqueAmpTheme };
}

export type StoreName = 'media' | 'stations' | 'categories' | 'playlists' | 'favorites' | 'history' | 'themes';

function migrate(db: IDBPDatabase<LiqueAmpDB>, oldVersion: number): void {
  // Each case upgrades from the previous version; intentional fallthrough.
  switch (oldVersion) {
    case 0: {
      db.createObjectStore('kv');
      const media = db.createObjectStore('media', { keyPath: 'id' });
      media.createIndex('byCategory', 'categoryId');
      media.createIndex('byProvider', 'provider');
      db.createObjectStore('stations', { keyPath: 'id' });
      db.createObjectStore('categories', { keyPath: 'id' });
      db.createObjectStore('playlists', { keyPath: 'id' });
      const favorites = db.createObjectStore('favorites', { keyPath: 'id' });
      favorites.createIndex('byType', 'type');
      const history = db.createObjectStore('history', { keyPath: 'id' });
      history.createIndex('byStartedAt', 'startedAt');
      db.createObjectStore('themes', { keyPath: 'id' });
    }
  }
}

export type StorageStatus = 'pending' | 'ready' | 'unavailable';

let dbPromise: Promise<IDBPDatabase<LiqueAmpDB> | null> | null = null;
let status: StorageStatus = 'pending';
let lastError: string | null = null;
const listeners = new Set<(s: StorageStatus) => void>();

function setStatus(next: StorageStatus) {
  status = next;
  listeners.forEach((l) => l(next));
}

/**
 * Resolves to null when IndexedDB cannot be used (e.g. blocked site data).
 * The app keeps working in memory and reports STORAGE: UNAVAILABLE.
 */
export function getDb(): Promise<IDBPDatabase<LiqueAmpDB> | null> {
  if (!dbPromise) {
    dbPromise = (async () => {
      try {
        if (typeof indexedDB === 'undefined') throw new Error('IndexedDB is not supported');
        const db = await openDB<LiqueAmpDB>(DB_NAME, DB_VERSION, {
          upgrade: (database, oldVersion) => migrate(database, oldVersion),
        });
        setStatus('ready');
        return db;
      } catch (err) {
        lastError = err instanceof Error ? err.message : String(err);
        setStatus('unavailable');
        return null;
      }
    })();
  }
  return dbPromise;
}

export function getStorageStatus(): { status: StorageStatus; error: string | null } {
  return { status, error: lastError };
}

export function onStorageStatus(listener: (s: StorageStatus) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Test helper: forget the cached connection. */
export async function resetDbForTests(): Promise<void> {
  const db = await dbPromise;
  db?.close();
  dbPromise = null;
  status = 'pending';
  lastError = null;
}
