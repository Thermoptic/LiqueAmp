import { create } from 'zustand';
import { personalRepositories } from '../services/storage/repository';
import type { HistoryEntry } from '../types/media';

const MAX_ENTRIES = 1000;

interface HistoryStore {
  entries: HistoryEntry[];
  hydrate(): Promise<void>;
  /** Inserts or updates an entry (the recorder updates it while playing). */
  upsert(entry: HistoryEntry): Promise<void>;
  remove(id: string): Promise<void>;
  clear(): Promise<void>;
}

const newestFirst = (a: HistoryEntry, b: HistoryEntry) => b.startedAt.localeCompare(a.startedAt);

/** Playback history (ARCH §21). Written only by the history recorder. */
export const useHistory = create<HistoryStore>((set, get) => ({
  entries: [],

  async hydrate() {
    const stored = await personalRepositories.history.getAll();
    set({ entries: stored.filter((e) => e && e.item && typeof e.startedAt === 'string').sort(newestFirst).slice(0, MAX_ENTRIES) });
  },

  async upsert(entry) {
    const others = get().entries.filter((e) => e.id !== entry.id);
    const entries = [entry, ...others].sort(newestFirst);
    const dropped = entries.slice(MAX_ENTRIES);
    set({ entries: entries.slice(0, MAX_ENTRIES) });
    await personalRepositories.history.put(entry);
    await Promise.all(dropped.map((e) => personalRepositories.history.delete(e.id)));
  },

  async remove(id) {
    set({ entries: get().entries.filter((e) => e.id !== id) });
    await personalRepositories.history.delete(id);
  },

  async clear() {
    set({ entries: [] });
    await personalRepositories.history.clear();
  },
}));
