import { create } from 'zustand';
import { createId } from '../lib/id';
import type { MediaItem, RadioStation } from '../types/media';

export type ToastKind = 'info' | 'success' | 'error';

export interface Toast {
  id: string;
  kind: ToastKind;
  message: string;
}

export type LibraryTab = 'playlists' | 'favourites' | 'history';

/** What Station Info and Quick Actions act on. */
export type Selection = { kind: 'station'; station: RadioStation } | { kind: 'media'; item: MediaItem } | null;

/** Ephemeral UI state only — never persisted (ARCH §38). */
interface UiStore {
  toasts: Toast[];
  libraryTab: LibraryTab;
  selection: Selection;
  select(selection: Selection): void;
  toast(message: string, kind?: ToastKind): void;
  dismissToast(id: string): void;
  setLibraryTab(tab: LibraryTab): void;
}

export const useUi = create<UiStore>((set, get) => ({
  toasts: [],
  libraryTab: 'playlists',
  selection: null,

  select(selection) {
    set({ selection });
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
