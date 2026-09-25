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

/** Object stores that hold profile data (everything except personal history; plus kv for profile singletons). */
export const PROFILE_STORES = ['media', 'stations', 'categories', 'playlists', 'favorites', 'themes'] as const;
export type ProfileStoreName = (typeof PROFILE_STORES)[number];

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

// ---- friend profile databases (D1: one database per profile) ----------------
//
// MY_LIQUE is the `liqueamp` database above, unchanged. Each friend profile
// is cached in a database of its own, `liqueamp-friend:<userId>`, with the
// profile stores only — there is no history store, so personal data cannot
// end up there. Separate databases make a cross-profile write impossible at
// the connection level, and deleting a cached friend is one deleteDatabase().

export const FRIEND_DB_PREFIX = 'liqueamp-friend:';
export const FRIEND_DB_VERSION = 1;

/** A friend has no local profile: never fetched, or its cache was deleted. */
export class ProfileNotAvailableError extends Error {
  constructor(readonly userId: string) {
    super(`The profile of ${userId} is not available on this device.`);
  }
}

/** User ids become part of a database name, so they are restricted to a safe set. */
const USER_ID = /^[A-Za-z0-9_-]{1,128}$/;

export function friendDbName(userId: string): string {
  if (!USER_ID.test(userId)) throw new Error('Invalid user id.');
  return `${FRIEND_DB_PREFIX}${userId}`;
}

function migrateFriend(db: IDBPDatabase<LiqueAmpDB>, oldVersion: number): void {
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
      db.createObjectStore('themes', { keyPath: 'id' });
    }
  }
}

const friendDbs = new Map<string, Promise<IDBPDatabase<LiqueAmpDB>>>();

/**
 * Opens a friend's profile database. With `create: false` (every read) a
 * database that does not exist is NOT created: the open is aborted and
 * ProfileNotAvailableError is thrown. Only the profile cache writer creates.
 */
export function openFriendDb(userId: string, { create }: { create: boolean }): Promise<IDBPDatabase<LiqueAmpDB>> {
  const name = friendDbName(userId);
  const cached = friendDbs.get(name);
  // a pending read-only open may still fail with "not available"; a creating open then starts over
  if (cached) return create ? cached.catch(() => openFriendDb(userId, { create })) : cached;
  const opening = (async () => {
    if (typeof indexedDB === 'undefined') throw new ProfileNotAvailableError(userId);
    try {
      return await openDB<LiqueAmpDB>(name, FRIEND_DB_VERSION, {
        upgrade: (database, oldVersion, _newVersion, tx) => {
          if (oldVersion === 0 && !create) {
            // an aborted first upgrade leaves no database behind; the open then
            // rejects and becomes ProfileNotAvailableError below
            tx.done.catch(() => undefined);
            tx.abort();
            return;
          }
          migrateFriend(database, oldVersion);
        },
        // another tab deletes or upgrades this cache: let go of it
        blocking: () => closeFriendDb(name),
        terminated: () => friendDbs.delete(name),
      });
    } catch (err) {
      if (!create) throw new ProfileNotAvailableError(userId);
      throw err;
    }
  })();
  friendDbs.set(name, opening);
  opening.catch(() => friendDbs.delete(name));
  return opening;
}

function closeFriendDb(name: string) {
  const db = friendDbs.get(name);
  friendDbs.delete(name);
  void db?.then((d) => d.close(), () => undefined);
}

/** Removes a friend's cached profile database entirely. */
export async function deleteFriendDb(userId: string): Promise<void> {
  const name = friendDbName(userId);
  closeFriendDb(name);
  await new Promise<void>((resolve, reject) => {
    const req = indexedDB.deleteDatabase(name);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

/** Test helper: forget the cached connection. */
export async function resetDbForTests(): Promise<void> {
  const db = await dbPromise;
  db?.close();
  dbPromise = null;
  status = 'pending';
  lastError = null;
  for (const name of [...friendDbs.keys()]) closeFriendDb(name);
}
