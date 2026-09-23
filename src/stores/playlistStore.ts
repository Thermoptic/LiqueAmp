import { create } from 'zustand';
import { createId, nowIso } from '../lib/id';
import { repositories } from '../services/storage/repository';
import type { MediaItem, Playlist } from '../types/media';
import { useLibrary } from './libraryStore';

interface PlaylistStore {
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
  async function save(next: Playlist) {
    set({ playlists: get().playlists.map((p) => (p.id === next.id ? next : p)) });
    await repositories.playlists.put(next);
  }
  function find(id: string): Playlist {
    const p = get().playlists.find((x) => x.id === id);
    if (!p) throw new Error('Playlist not found.');
    return p;
  }

  return {
    playlists: [],

    async hydrate() {
      const stored = await repositories.playlists.getAll();
      set({
        playlists: stored
          .filter((p) => p && typeof p.id === 'string' && Array.isArray(p.items))
          .sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
      });
    },

    async create(name, items = []) {
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
      await repositories.playlists.put(playlist);
      return playlist;
    },

    async rename(id, name) {
      await save({ ...find(id), name: requireName(name), updatedAt: nowIso() });
    },

    async remove(id) {
      set({ playlists: get().playlists.filter((p) => p.id !== id) });
      await repositories.playlists.delete(id);
    },

    async addItems(id, items) {
      const playlist = find(id);
      const saved = await useLibrary.getState().addMedia(items);
      const now = nowIso();
      await save({ ...playlist, items: [...playlist.items, ...saved.map((m) => ({ mediaId: m.id, addedAt: now }))], updatedAt: now });
      return saved.length;
    },

    async removeItem(id, index) {
      const playlist = find(id);
      if (index < 0 || index >= playlist.items.length) return;
      await save({ ...playlist, items: playlist.items.filter((_, i) => i !== index), updatedAt: nowIso() });
    },

    async moveItem(id, from, to) {
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
