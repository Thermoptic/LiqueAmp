import { create } from 'zustand';
import { createId } from '../lib/id';
import { kv } from '../services/storage/repository';
import * as Q from '../services/playback/queue';
import type { MediaItem } from '../types/media';

const KEY = 'queue';

interface QueueStore extends Q.QueueState {
  hydrate(): Promise<void>;
  /** Replace the store's queue state (used by the playback engine). */
  apply(next: Q.QueueState): void;
  add(items: MediaItem[]): void;
  addNext(items: MediaItem[]): Q.QueueEntry[];
  remove(entryId: string): void;
  move(entryId: string, toIndex: number): void;
  clearUpcoming(): void;
  shuffleUpcoming(): void;
}

export function toEntries(items: MediaItem[]): Q.QueueEntry[] {
  return items.map((item) => ({ entryId: createId('q'), item }));
}

function persist(state: Q.QueueState) {
  const snapshot: Q.QueueState = {
    entries: state.entries,
    currentId: state.currentId,
    history: state.history,
    played: state.played,
  };
  void kv.set(KEY, snapshot);
}

/**
 * The current session's queue (ARCH §19). Independent of playlists; kept
 * across reloads so the session can be resumed, but never auto-played.
 */
export const useQueue = create<QueueStore>((set, get) => {
  const commit = (next: Q.QueueState) => {
    set(next);
    persist(next);
  };
  return {
    ...Q.EMPTY_QUEUE,

    async hydrate() {
      const stored = await kv.get<Q.QueueState>(KEY);
      if (stored && Array.isArray(stored.entries)) {
        const entries = stored.entries.filter((e) => e && typeof e.entryId === 'string' && e.item && typeof e.item.id === 'string');
        const ids = new Set(entries.map((e) => e.entryId));
        set({
          entries,
          currentId: stored.currentId && ids.has(stored.currentId) ? stored.currentId : null,
          history: (stored.history ?? []).filter((id) => ids.has(id)),
          played: (stored.played ?? []).filter((id) => ids.has(id)),
        });
      }
    },

    apply: commit,
    add: (items) => commit(Q.append(get(), toEntries(items))),
    addNext(items) {
      const entries = toEntries(items);
      commit(Q.insertNext(get(), entries));
      return entries;
    },
    remove: (entryId) => commit(Q.remove(get(), entryId)),
    move: (entryId, toIndex) => commit(Q.move(get(), entryId, toIndex)),
    clearUpcoming: () => commit(Q.clearUpcoming(get())),
    shuffleUpcoming: () => commit(Q.shuffleUpcoming(get())),
  };
});
