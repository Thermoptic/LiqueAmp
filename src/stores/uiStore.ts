import { create } from 'zustand';
import { createId } from '../lib/id';

export type ToastKind = 'info' | 'success' | 'error';

export interface Toast {
  id: string;
  kind: ToastKind;
  message: string;
}

export type LibraryTab = 'playlists' | 'favourites' | 'history';

/** Ephemeral UI state only — never persisted (ARCH §38). */
interface UiStore {
  toasts: Toast[];
  libraryTab: LibraryTab;
  toast(message: string, kind?: ToastKind): void;
  dismissToast(id: string): void;
  setLibraryTab(tab: LibraryTab): void;
}

export const useUi = create<UiStore>((set, get) => ({
  toasts: [],
  libraryTab: 'playlists',

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
