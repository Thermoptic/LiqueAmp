import type { IDBPDatabase } from 'idb';
import { getDb, openFriendDb, type LiqueAmpDB, type ProfileStoreName, type StoreName } from './db';
import { assertWritableScope, MY_LIQUE, scopeId, type ProfileScope } from './scope';

type ValueOf<S extends StoreName> = LiqueAmpDB[S]['value'];

export interface Repository<T> {
  getAll(): Promise<T[]>;
  get(id: string): Promise<T | undefined>;
  put(value: T): Promise<void>;
  putMany(values: T[]): Promise<void>;
  delete(id: string): Promise<void>;
  clear(): Promise<void>;
}

/**
 * The database behind a profile scope (D1, docs/LIQUEAMP_IMPLEMENTATION_PLAN.md):
 * MY_LIQUE is the existing `liqueamp` database; a friend scope is that
 * friend's own cached-profile database. A friend scope never resolves to the
 * own database: if the friend's profile is not on this device, this rejects
 * with ProfileNotAvailableError.
 */
export function profileDb(scope: ProfileScope): Promise<IDBPDatabase<LiqueAmpDB> | null> {
  return scope.kind === 'own' ? getDb() : openFriendDb(scope.userId, { create: false });
}

type Open = () => Promise<IDBPDatabase<LiqueAmpDB> | null>;

// ---- write notifications -------------------------------------------------------
//
// Every successful write of the user's OWN profile data is announced, so the
// sync layer can mark the local profile as changed since the last upload
// (profile.meta.dirty). Friend scopes cannot be written, so they never notify.

type ProfileWriteListener = () => void | Promise<void>;
const writeListeners = new Set<ProfileWriteListener>();

export function onOwnProfileWrite(listener: ProfileWriteListener): () => void {
  writeListeners.add(listener);
  return () => writeListeners.delete(listener);
}

/** Awaited by writers, so a caller that writes and then records sync state sees them in order. */
export async function notifyOwnProfileWrite(): Promise<void> {
  await Promise.all([...writeListeners].map((l) => l()));
}

/**
 * Storage-agnostic access to one object store (ARCH §26). When storage is
 * unavailable, reads return empty and writes are dropped; callers keep
 * working from in-memory state. `canWrite` runs before every write.
 */
function repository<S extends StoreName>(store: S, open: Open, canWrite: () => void, written: () => Promise<void> = async () => undefined): Repository<ValueOf<S>> {
  const write = () => {
    canWrite();
    return open();
  };
  return {
    async getAll() {
      const db = await open();
      return db ? ((await db.getAll(store)) as ValueOf<S>[]) : [];
    },
    async get(id) {
      const db = await open();
      return db ? ((await db.get(store, id)) as ValueOf<S> | undefined) : undefined;
    },
    async put(value) {
      const db = await write();
      if (db) await db.put(store, value as never);
      await written();
    },
    async putMany(values) {
      const db = await write();
      if (!db) return;
      const tx = db.transaction(store, 'readwrite');
      await Promise.all([...values.map((v) => tx.store.put(v as never)), tx.done]);
      await written();
    },
    async delete(id) {
      const db = await write();
      if (db) await db.delete(store, id);
      await written();
    },
    async clear() {
      const db = await write();
      if (db) await db.clear(store);
      await written();
    },
  };
}

export type ProfileRepositories = { readonly [S in ProfileStoreName]: Repository<ValueOf<S>> };

const bound = new Map<string, ProfileRepositories>();

/**
 * Profile repositories bound to ONE scope for their whole life. Stores bind
 * to the scope they were hydrated from, so data read from one profile can
 * only ever be written back to that same profile, whatever becomes active in
 * between. Friend scopes are read-only: every write throws ProfileScopeError.
 */
export function repositoriesFor(scope: ProfileScope): ProfileRepositories {
  const id = scopeId(scope);
  let repos = bound.get(id);
  if (!repos) {
    const open = () => profileDb(scope);
    const canWrite = () => assertWritableScope(scope);
    const written = scope.kind === 'own' ? notifyOwnProfileWrite : undefined;
    repos = Object.freeze({
      media: repository('media', open, canWrite, written),
      stations: repository('stations', open, canWrite, written),
      categories: repository('categories', open, canWrite, written),
      playlists: repository('playlists', open, canWrite, written),
      favorites: repository('favorites', open, canWrite, written),
      themes: repository('themes', open, canWrite, written),
    });
    bound.set(id, repos);
  }
  return repos;
}

/** Personal data: always the user's own, whatever profile is active. */
export const personalRepositories = {
  history: repository('history', getDb, () => undefined),
};

/**
 * Small key/value store for device and personal singletons: device settings
 * (`settings`) and the queue (`queue`). Always the own database; never
 * follows the profile scope.
 */
export const kv = {
  async get<T>(key: string): Promise<T | undefined> {
    const db = await getDb();
    return db ? ((await db.get('kv', key)) as T | undefined) : undefined;
  },
  async set<T>(key: string, value: T): Promise<void> {
    const db = await getDb();
    if (db) await db.put('kv', value, key);
  },
  async delete(key: string): Promise<void> {
    const db = await getDb();
    if (db) await db.delete('kv', key);
  },
};

/** kv key of a profile singleton, e.g. profile settings → `profile.settings`. */
export const profileKvKey = (key: string) => `profile.${key}`;

export interface ProfileKv {
  get<T>(key: string): Promise<T | undefined>;
  set<T>(key: string, value: T): Promise<void>;
}

/** Key/value singletons of one profile scope (profile settings, profile metadata). */
export function profileKvFor(scope: ProfileScope): ProfileKv {
  return {
    async get<T>(key: string): Promise<T | undefined> {
      const db = await profileDb(scope);
      return db ? ((await db.get('kv', profileKvKey(key))) as T | undefined) : undefined;
    },
    async set<T>(key: string, value: T): Promise<void> {
      assertWritableScope(scope);
      const db = await profileDb(scope);
      if (db) await db.put('kv', value, profileKvKey(key));
      if (scope.kind === 'own') await notifyOwnProfileWrite();
    },
  };
}

/** The user's own profile singletons (MY_LIQUE). */
export const profileKv = profileKvFor(MY_LIQUE);

/**
 * The user's OWN data: MY_LIQUE's profile repositories plus personal history.
 * Backup export, import planning and anything else that means "my data" use
 * this; it never follows the active scope. Stores use repositoriesFor(scope).
 */
export const repositories = {
  ...repositoriesFor(MY_LIQUE),
  ...personalRepositories,
};
