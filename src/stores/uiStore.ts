import { create } from 'zustand';
import { createId } from '../lib/id';
import type { RadioStation } from '../types/media';

export type ToastKind = 'info' | 'success' | 'error';

export interface Toast {
  id: string;
  kind: ToastKind;
  message: string;
}

export type LibraryTab = 'playlists' | 'favourites' | 'history';

/** The station shown in Station Info (selected in a station list). */
export type Selection = { kind: 'station'; station: RadioStation } | null;

/** Ephemeral UI state only — never persisted (ARCH §38). */
interface UiStore {
  toasts: Toast[];
  libraryTab: LibraryTab;
  selection: Selection;
  select(selection: Selection): void;
  /** Playlist shown in detail in the Playlists tab, or null for the list. */
  openPlaylistId: string | null;
  openPlaylist(id: string | null): void;
  /** Library media shown in the Library panel: 'all', a category id, or null (tabs). */
  libraryView: string | null;
  showLibrary(view: string | null): void;
  toast(message: string, kind?: ToastKind): void;
  dismissToast(id: string): void;
  setLibraryTab(tab: LibraryTab): void;
}

export const useUi = create<UiStore>((set, get) => ({
  toasts: [],
  libraryTab: 'playlists',
  selection: null,
  openPlaylistId: null,
  libraryView: null,

  showLibrary(libraryView) {
    set({ libraryView });
  },

  select(selection) {
    set({ selection });
  },

  openPlaylist(openPlaylistId) {
    set({ openPlaylistId });
  },

  toast(message, kind = 'info') {
    const id = createId('toast');
    set({ toasts: [...get().toasts.slice(-3), { id, kind, message }] });
    window.setTimeout(() => get().dismissToast(id), kind === 'error' ? 6000 : 2800);
  },

  dismissToast(id) {
    set({ toasts: get().toasts.filter((t) => t.id !== id) });
  },

  setLibraryTab(libraryTab) {
    set({ libraryTab });
  },
}));
