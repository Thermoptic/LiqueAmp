import type { IDBPDatabase } from 'idb';
import { getDb, type LiqueAmpDB, type StoreName } from './db';
import { assertWritableScope, getActiveScope, ProfileScopeError, scopeId, type ProfileScope } from './scope';

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
 * Where a repository's data lives:
 * - 'profile': belongs to the active profile scope (scope.ts); writes are
 *   refused while a read-only (friend) scope is active.
 * - 'personal': always the user's own (history), whatever profile is active.
 */
export type RepositoryScope = 'profile' | 'personal';

/**
 * The database behind a profile scope. MY_LIQUE is the existing `liqueamp`
 * database, unchanged. Friend scopes have no storage yet (a later checkpoint
 * decides how friend caches are stored), so they are refused rather than
 * silently falling back to the own database.
 */
export function profileDb(scope: ProfileScope = getActiveScope()): Promise<IDBPDatabase<LiqueAmpDB> | null> {
  if (scope.kind === 'own') return getDb();
  return Promise.reject(new ProfileScopeError(`No local storage exists for the ${scopeId(scope)} profile yet.`));
}

/**
 * Storage-agnostic access to one object store (ARCH §26). When storage is
 * unavailable, reads return empty and writes are dropped; callers keep
 * working from in-memory state.
 */
export function createRepository<S extends StoreName>(store: S, scope: RepositoryScope = 'profile'): Repository<ValueOf<S>> {
  const read = () => (scope === 'profile' ? profileDb() : getDb());
  const write = () => {
    if (scope === 'profile') assertWritableScope();
    return read();
  };
  return {
    async getAll() {
      const db = await read();
      return db ? ((await db.getAll(store)) as ValueOf<S>[]) : [];
    },
    async get(id) {
      const db = await read();
      return db ? ((await db.get(store, id)) as ValueOf<S> | undefined) : undefined;
    },
    async put(value) {
      const db = await write();
      if (db) await db.put(store, value as never);
    },
    async putMany(values) {
      const db = await write();
      if (!db) return;
      const tx = db.transaction(store, 'readwrite');
      await Promise.all([...values.map((v) => tx.store.put(v as never)), tx.done]);
    },
    async delete(id) {
      const db = await write();
      if (db) await db.delete(store, id);
    },
    async clear() {
      const db = await write();
      if (db) await db.clear(store);
    },
  };
}

/**
 * Small key/value store for device and personal singletons: device settings
 * (`settings`) and the queue (`queue`). Never follows the profile scope.
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

/** Key/value singletons that belong to the active profile scope (profile settings). */
export const profileKv = {
  async get<T>(key: string): Promise<T | undefined> {
    const db = await profileDb();
    return db ? ((await db.get('kv', profileKvKey(key))) as T | undefined) : undefined;
  },
  async set<T>(key: string, value: T): Promise<void> {
    assertWritableScope();
    const db = await profileDb();
    if (db) await db.put('kv', value, profileKvKey(key));
  },
};

export const repositories = {
  // profile data: follows the active profile scope
  media: createRepository('media'),
  stations: createRepository('stations'),
  categories: createRepository('categories'),
  playlists: createRepository('playlists'),
  favorites: createRepository('favorites'),
  themes: createRepository('themes'),
  // personal data: always the user's own
  history: createRepository('history', 'personal'),
};
