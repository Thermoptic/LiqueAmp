// The ten dark Base16 schemes added after the first twenty built-ins.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { resetDbForTests } from '../storage/db';
import { repositories } from '../storage/repository';
import { useThemes } from '../../stores/themeStore';
import { loadSettings, useSettings } from '../../stores/settingsStore';
import { DEFAULT_SETTINGS } from '../../types/settings';
import { BASE16_KEYS, THEME_COLOR_KEYS } from '../../types/theme';
import { deriveColors, paletteVariant } from './base16';
import { BASE16_SCHEMES } from './base16Schemes';
import { BUILTIN_THEMES } from './builtin';
import { contrastRatio, relativeLuminance } from './color';
import { applyTheme, cssVarName, normalizeTheme, validateTheme } from './theme';

const NEW_DARK = ['oceanicnext', 'mellow-purple', 'bosque', 'caroline', 'oxocarbon-dark', 'sparky', 'brasa', 'outrun-dark', 'zenburn', 'irblack'];

// the built-ins as they were before the ten were added — unchanged, in this order
const EARLIER_IDS = [
  'liqueamp-default',
  'amber-night',
  ...[
    'catppuccin-mocha',
    'dracula',
    'nord',
    'gruvbox-dark-medium',
    'onedark',
    'solarized-dark',
    'tokyo-night-dark',
    'rose-pine',
    'everforest',
    'kanagawa',
    'monokai',
    'ayu-dark',
    'material-palenight',
    'tomorrow-night',
    'github-dark',
    'catppuccin-latte',
    'gruvbox-light-medium',
    'solarized-light',
    'one-light',
    'rose-pine-dawn',
  ].map((s) => `base16-${s}`),
];

const newThemes = () => NEW_DARK.map((slug) => BUILTIN_THEMES.find((t) => t.id === `base16-${slug}`)!);
const earlier = () => BUILTIN_THEMES.filter((t) => EARLIER_IDS.includes(t.id));
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

describe('ten more dark Base16 built-ins', () => {
  it('adds exactly these 10 themes after the earlier 22, which keep their ids and order', () => {
    expect(BUILTIN_THEMES.map((t) => t.id)).toEqual([...EARLIER_IDS, ...NEW_DARK.map((s) => `base16-${s}`)]);
    expect(newThemes().every(Boolean)).toBe(true);
  });

  it('gives them unique, stable base16-<slug> ids that no earlier theme uses', () => {
    const ids = newThemes().map((t) => t.id);
    expect(new Set(ids).size).toBe(10);
    for (const id of ids) {
      expect(id).toMatch(/^base16-[a-z0-9-]+$/);
      expect(EARLIER_IDS).not.toContain(id);
    }
  });

  it('none is an earlier scheme under another id or name, and no palette repeats', () => {
    for (const t of newThemes()) {
      for (const e of earlier()) {
        expect(norm(t.name)).not.toBe(norm(e.name));
        expect(norm(t.id)).not.toBe(norm(e.id));
        expect(t.palette).not.toEqual(e.palette);
      }
    }
    const palettes = new Set(newThemes().map((t) => JSON.stringify(t.palette)));
    expect(palettes.size).toBe(10);
  });

  it('have complete 16-slot palettes, with the source credit', () => {
    for (const t of newThemes()) {
      expect(Object.keys(t.palette).sort()).toEqual([...BASE16_KEYS].sort());
      for (const k of BASE16_KEYS) expect(t.palette[k]).toMatch(/^#[0-9a-f]{6}$/);
      expect(t.origin).toBe('tinted-theming/schemes (MIT)');
      expect(t.author).toBe(BASE16_SCHEMES.find((s) => `base16-${s.slug}` === t.id)!.author);
    }
  });

  it('are dark by their colors, not by their names: dark background, light text', () => {
    for (const t of newThemes()) {
      expect(t.variant).toBe('dark');
      expect(paletteVariant(t.palette)).toBe('dark');
      expect(relativeLuminance(t.palette.base00)).toBeLessThan(0.05);
      expect(relativeLuminance(t.palette.base01)).toBeLessThan(0.1);
      expect(relativeLuminance(t.colors.text)).toBeGreaterThan(relativeLuminance(t.colors.bg));
      expect(contrastRatio(t.colors.text, t.colors.bg)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('pass theme validation and come through normalizeTheme unchanged', () => {
    for (const t of newThemes()) {
      expect(validateTheme(t).filter((i) => i.level === 'error')).toEqual([]);
      expect(t.colors).toEqual(deriveColors(t.palette));
      expect(normalizeTheme(t)).toEqual(t);
    }
  });

  it('apply: every color variable is written', () => {
    for (const t of newThemes()) {
      const root = document.createElement('div');
      applyTheme(t, 1, root);
      expect(root.dataset.theme).toBe(t.id);
      for (const key of THEME_COLOR_KEYS) expect(root.style.getPropertyValue(cssVarName(key))).toBe(t.colors[key]);
    }
  });

  it('the earlier themes are unchanged: still valid, colors still derived from their palettes', () => {
    expect(earlier()).toHaveLength(22);
    for (const t of earlier()) {
      expect(validateTheme(t).filter((i) => i.level === 'error')).toEqual([]);
      expect(t.colors).toEqual(deriveColors(t.palette));
    }
  });
});

describe('ten more dark Base16 built-ins — selection', () => {
  beforeEach(async () => {
    await resetDbForTests();
    globalThis.indexedDB = new IDBFactory();
    useSettings.setState({ ...DEFAULT_SETTINGS, hydrated: true });
    await useThemes.getState().hydrate();
  });

  it('the selected theme persists after a reload and resolves from the built-ins, never from storage', async () => {
    for (const slug of ['oceanicnext', 'irblack']) {
      const id = `base16-${slug}`;
      useSettings.getState().update({ activeThemeId: id });
      await vi.waitFor(async () => expect((await loadSettings()).activeThemeId).toBe(id));

      // "reload": fresh stores read back what was saved
      useSettings.setState({ ...DEFAULT_SETTINGS, hydrated: false });
      useThemes.setState({ themes: [] });
      await useSettings.getState().hydrate();
      await useThemes.getState().hydrate();
      expect(useSettings.getState().activeThemeId).toBe(id);
      expect(useThemes.getState().getTheme(id)).toBe(BUILTIN_THEMES.find((t) => t.id === id));
    }
    // built-ins are part of the app, not the database: another installation resolves the same id
    expect(await repositories.themes.getAll()).toEqual([]);
  });
});
