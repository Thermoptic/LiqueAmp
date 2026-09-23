import { create } from 'zustand';
import { BUILTIN_THEMES, LIQUEAMP_DEFAULT } from '../services/themes/builtin';
import { normalizeTheme } from '../services/themes/theme';
import { repositories } from '../services/storage/repository';
import type { LiqueAmpTheme } from '../types/theme';

interface ThemeStore {
  themes: LiqueAmpTheme[];
  hydrate(): Promise<void>;
  getTheme(id: string): LiqueAmpTheme;
  saveTheme(theme: LiqueAmpTheme): Promise<void>;
  deleteTheme(id: string): Promise<void>;
}

export const useThemes = create<ThemeStore>((set, get) => ({
  themes: [...BUILTIN_THEMES],

  async hydrate() {
    const stored = (await repositories.themes.getAll()).map(normalizeTheme);
    const builtinIds = new Set(BUILTIN_THEMES.map((t) => t.id));
    set({ themes: [...BUILTIN_THEMES, ...stored.filter((t) => !builtinIds.has(t.id))] });
  },

  /** Unknown ids fall back to the default theme rather than failing. */
  getTheme(id) {
    return get().themes.find((t) => t.id === id) ?? LIQUEAMP_DEFAULT;
  },

  async saveTheme(theme) {
    if (theme.source === 'builtin') throw new Error('Built-in themes are read-only.');
    const clean = normalizeTheme(theme);
    set({ themes: [...get().themes.filter((t) => t.id !== clean.id), clean] });
    await repositories.themes.put(clean);
  },

  async deleteTheme(id) {
    const theme = get().themes.find((t) => t.id === id);
    if (!theme || theme.source === 'builtin') throw new Error('Built-in themes cannot be deleted.');
    set({ themes: get().themes.filter((t) => t.id !== id) });
    await repositories.themes.delete(id);
  },
}));
