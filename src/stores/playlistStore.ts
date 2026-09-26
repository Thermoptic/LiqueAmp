import { create } from 'zustand';
import { createId, nowIso } from '../lib/id';
import { repositoriesFor } from '../services/storage/repository';
import { assertWritableScope, getActiveScope, isActiveScope, MY_LIQUE, type ProfileScope } from '../services/storage/scope';
import type { MediaItem, Playlist } from '../types/media';
import { useLibrary } from './libraryStore';

interface PlaylistStore {
  /** The profile scope this store was hydrated from; all its writes go there (never to another profile). */
  scope: ProfileScope;
  playlists: Playlist[];
  hydrate(): Promise<void>;
  create(name: string, items?: MediaItem[]): Promise<Playlist>;
  rename(id: string, name: string): Promise<void>;
  remove(id: string): Promise<void>;
  addItems(id: string, items: MediaItem[]): Promise<number>;
  removeItem(id: string, index: number): Promise<void>;
  moveItem(id: string, from: number, to: number): Promise<void>;
  /** Items in order; entries whose media no longer exists are skipped. */
  resolve(id: string): { items: MediaItem[]; missing: number };
}

/** The playlists stored in `scope` (what the store shows for it). */
export async function readPlaylists(scope: ProfileScope): Promise<Playlist[]> {
  const stored = await repositoriesFor(scope).playlists.getAll();
  return stored.filter((p) => p && typeof p.id === 'string' && Array.isArray(p.items)).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

function requireName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) throw new Error('Playlist name is required.');
  return trimmed.slice(0, 80);
}

/**
 * Persistent playlists (ARCH §18). They store media references only; the
 * media itself lives once in the library (PROVIDERS §37).
 */
export const usePlaylists = create<PlaylistStore>((set, get) => {
  /** Repositories of the profile this store holds — never simply the active one. */
  const repos = () => repositoriesFor(get().scope);
  async function save(next: Playlist) {
    set({ playlists: get().playlists.map((p) => (p.id === next.id ? next : p)) });
    await repos().playlists.put(next);
  }
  function find(id: string): Playlist {
    const p = get().playlists.find((x) => x.id === id);
    if (!p) throw new Error('Playlist not found.');
    return p;
  }

  return {
    scope: MY_LIQUE,
    playlists: [],

    async hydrate() {
      const scope = getActiveScope();
      const playlists = await readPlaylists(scope);
      if (!isActiveScope(scope)) return; // the profile changed meanwhile; its own hydrate wins
      set({ scope, playlists });
    },

    async create(name, items = []) {
      assertWritableScope(get().scope); // a Friend Lique is read-only: refused before anything changes
      const now = nowIso();
      const saved = items.length ? await useLibrary.getState().addMedia(items) : [];
      const playlist: Playlist = {
        id: createId('pl'),
        name: requireName(name),
        items: saved.map((m) => ({ mediaId: m.id, addedAt: now })),
        createdAt: now,
        updatedAt: now,
      };
      set({ playlists: [...get().playlists, playlist] });
      await repos().playlists.put(playlist);
      return playlist;
    },

    async rename(id, name) {
      assertWritableScope(get().scope); // a Friend Lique is read-only: refused before anything changes
      await save({ ...find(id), name: requireName(name), updatedAt: nowIso() });
    },

    async remove(id) {
      assertWritableScope(get().scope); // a Friend Lique is read-only: refused before anything changes
      set({ playlists: get().playlists.filter((p) => p.id !== id) });
      await repos().playlists.delete(id);
    },

    async addItems(id, items) {
      assertWritableScope(get().scope); // a Friend Lique is read-only: refused before anything changes
      const playlist = find(id);
      const saved = await useLibrary.getState().addMedia(items);
      const now = nowIso();
      await save({ ...playlist, items: [...playlist.items, ...saved.map((m) => ({ mediaId: m.id, addedAt: now }))], updatedAt: now });
      return saved.length;
    },

    async removeItem(id, index) {
      assertWritableScope(get().scope); // a Friend Lique is read-only: refused before anything changes
      const playlist = find(id);
      if (index < 0 || index >= playlist.items.length) return;
      await save({ ...playlist, items: playlist.items.filter((_, i) => i !== index), updatedAt: nowIso() });
    },

    async moveItem(id, from, to) {
      assertWritableScope(get().scope); // a Friend Lique is read-only: refused before anything changes
      const playlist = find(id);
      const target = Math.max(0, Math.min(playlist.items.length - 1, to));
      if (from === target || from < 0 || from >= playlist.items.length) return;
      const items = [...playlist.items];
      const [moved] = items.splice(from, 1);
      items.splice(target, 0, moved!);
      await save({ ...playlist, items, updatedAt: nowIso() });
    },

    resolve(id) {
      const playlist = get().playlists.find((p) => p.id === id);
      if (!playlist) return { items: [], missing: 0 };
      const library = useLibrary.getState();
      const items: MediaItem[] = [];
      let missing = 0;
      for (const ref of playlist.items) {
        const media = library.getMedia(ref.mediaId);
        if (media) items.push(media);
        else missing++;
      }
      return { items, missing };
    },
  };
});
