import { getDb, type LiqueAmpDB, type StoreName } from './db';

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
 * Storage-agnostic access to one object store (ARCH §26). When storage is
 * unavailable, reads return empty and writes are dropped; callers keep
 * working from in-memory state.
 */
export function createRepository<S extends StoreName>(store: S): Repository<ValueOf<S>> {
  return {
    async getAll() {
      const db = await getDb();
      return db ? ((await db.getAll(store)) as ValueOf<S>[]) : [];
    },
    async get(id) {
      const db = await getDb();
      return db ? ((await db.get(store, id)) as ValueOf<S> | undefined) : undefined;
    },
    async put(value) {
      const db = await getDb();
      if (db) await db.put(store, value as never);
    },
    async putMany(values) {
      const db = await getDb();
      if (!db) return;
      const tx = db.transaction(store, 'readwrite');
      await Promise.all([...values.map((v) => tx.store.put(v as never)), tx.done]);
    },
    async delete(id) {
      const db = await getDb();
      if (db) await db.delete(store, id);
    },
    async clear() {
      const db = await getDb();
      if (db) await db.clear(store);
    },
  };
}

/** Small key/value store for settings and similar singletons. */
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

export const repositories = {
  media: createRepository('media'),
  stations: createRepository('stations'),
  categories: createRepository('categories'),
  playlists: createRepository('playlists'),
  favorites: createRepository('favorites'),
  history: createRepository('history'),
  themes: createRepository('themes'),
};
