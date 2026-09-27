import { create } from 'zustand';
import type { RetroTrack } from '../services/retro/sources';

/** The Retro panel's view state. Ephemeral, like the UI store: never persisted. */
interface RetroStore {
  /** The selected system, or null before one is chosen. */
  systemId: string | null;
  /** The search text; kept when the system changes, and searched in the new system. */
  query: string;
  /** A multi-tune file whose subtunes are shown, or null for the search results. */
  openFile: RetroTrack | null;
  selectSystem(id: string): void;
  setQuery(query: string): void;
  openTunes(file: RetroTrack | null): void;
}

export const useRetro = create<RetroStore>((set) => ({
  systemId: null,
  query: '',
  openFile: null,
  selectSystem(systemId) {
    set({ systemId, openFile: null });
  },
  setQuery(query) {
    set({ query, openFile: null });
  },
  openTunes(openFile) {
    set({ openFile });
  },
}));
