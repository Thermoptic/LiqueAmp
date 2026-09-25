import { create } from 'zustand';
import { BUILTIN_THEMES, LIQUEAMP_DEFAULT } from '../services/themes/builtin';
import { normalizeTheme } from '../services/themes/theme';
import { repositoriesFor } from '../services/storage/repository';
import { assertWritableScope, getActiveScope, isActiveScope, isReadOnlyScope, MY_LIQUE, type ProfileScope } from '../services/storage/scope';
import { createId, nowIso } from '../lib/id';
import type { LiqueAmpTheme } from '../types/theme';
import { useSettings } from './settingsStore';

interface ThemeStore {
  /** The profile scope this store was hydrated from; all its writes go there (never to another profile). */
  scope: ProfileScope;
  themes: LiqueAmpTheme[];
  hydrate(): Promise<void>;
  getTheme(id: string): LiqueAmpTheme;
  saveTheme(theme: LiqueAmpTheme): Promise<void>;
  deleteTheme(id: string): Promise<void>;
  /** Renames without changing the id (THEMING §47). */
  renameTheme(id: string, name: string): Promise<void>;
  /** Independent editable copy of any theme, including built-ins (THEMING §46). */
  duplicateTheme(id: string): Promise<LiqueAmpTheme>;
}

/** Repositories of the profile this store holds — never simply the active one. */
function repos() {
  return repositoriesFor(useThemes.getState().scope);
}

export const useThemes = create<ThemeStore>((set, get) => ({
  scope: MY_LIQUE,
  themes: [...BUILTIN_THEMES],

  async hydrate() {
    const scope = getActiveScope();
    const raw = await repositoriesFor(scope).themes.getAll();
    if (!isActiveScope(scope)) return; // the profile changed meanwhile; its own hydrate wins
    const stored = raw.map(normalizeTheme);
    // Version-1 themes (25 free colors) are migrated to a Base16 palette once —
    // in the own profile only; a friend's cached profile is read-only (and
    // already normalized when it was cached).
    if (!isReadOnlyScope(scope)) await Promise.all(stored.filter((_, i) => raw[i]!.version !== 2).map((t) => repositoriesFor(scope).themes.put(t)));
    const builtinIds = new Set(BUILTIN_THEMES.map((t) => t.id));
    set({ scope, themes: [...BUILTIN_THEMES, ...stored.filter((t) => !builtinIds.has(t.id))] });
  },

  /** Unknown ids fall back to the default theme rather than failing. */
  getTheme(id) {
    return get().themes.find((t) => t.id === id) ?? LIQUEAMP_DEFAULT;
  },

  async saveTheme(theme) {
    assertWritableScope(get().scope); // a Friend Lique is read-only: refused before anything changes
    if (theme.source === 'builtin') throw new Error('Built-in themes are read-only.');
    const clean = normalizeTheme(theme);
    set({ themes: [...get().themes.filter((t) => t.id !== clean.id), clean] });
    await repos().themes.put(clean);
  },

  async deleteTheme(id) {
    assertWritableScope(get().scope); // a Friend Lique is read-only: refused before anything changes
    const theme = get().themes.find((t) => t.id === id);
    if (!theme || theme.source === 'builtin') throw new Error('Built-in themes cannot be deleted.');
    if (useSettings.getState().activeThemeId === id) throw new Error('Activate another theme before deleting this one.');
    set({ themes: get().themes.filter((t) => t.id !== id) });
    await repos().themes.delete(id);
  },

  async renameTheme(id, name) {
    assertWritableScope(get().scope); // a Friend Lique is read-only: refused before anything changes
    const theme = get().themes.find((t) => t.id === id);
    const trimmed = name.trim();
    if (!theme) throw new Error('Theme not found.');
    if (!trimmed) throw new Error('Theme name is required.');
    await get().saveTheme({ ...theme, name: trimmed.slice(0, 60), updatedAt: nowIso() });
  },

  async duplicateTheme(id) {
    assertWritableScope(get().scope); // a Friend Lique is read-only: refused before anything changes
    const theme = get().getTheme(id);
    const now = nowIso();
    const copy: LiqueAmpTheme = {
      ...structuredClone(theme),
      id: createId('theme-custom').slice(0, 64),
      name: `${theme.name} — Custom`.slice(0, 60),
      source: 'user',
      createdAt: now,
      updatedAt: now,
    };
    await get().saveTheme(copy);
    return copy;
  },
}));
