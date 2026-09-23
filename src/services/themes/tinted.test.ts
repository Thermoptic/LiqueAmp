import { beforeEach, describe, expect, it } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { resetDbForTests } from '../storage/db';
import { useThemes } from '../../stores/themeStore';
import { useSettings } from '../../stores/settingsStore';
import { DEFAULT_SETTINGS } from '../../types/settings';
import { THEME_COLOR_KEYS } from '../../types/theme';
import { LIQUEAMP_DEFAULT } from './builtin';
import { validateTheme } from './theme';
import {
  buildTheme,
  defaultMapping,
  exportBase16Yaml,
  exportLiqueAmpJson,
  parseLiqueAmpJson,
  parseScheme,
  ThemeImportError,
} from './tinted';

// From tinted-theming/schemes (spec-0.11), base16/gruvbox-dark-hard.yaml
const GRUVBOX = `system: "base16"
name: "Gruvbox dark, hard"
author: "Dawid Kurek (dawikur@gmail.com), morhetz (https://github.com/morhetz/gruvbox)"
variant: "dark"
palette:
  base00: "#1d2021" # ----
  base01: "#3c3836" # ---
  base02: "#504945" # --
  base03: "#665c54" # -
  base04: "#bdae93" # +
  base05: "#d5c4a1" # ++
  base06: "#ebdbb2" # +++
  base07: "#fbf1c7" # ++++
  base08: "#fb4934" # red
  base09: "#fe8019" # orange
  base0A: "#fabd2f" # yellow
  base0B: "#b8bb26" # green
  base0C: "#8ec07c" # aqua/cyan
  base0D: "#83a598" # blue
  base0E: "#d3869b" # purple
  base0F: "#d65d0e" # brown
`;

// Legacy layout: scheme name at top level, colors without '#', some unquoted.
const LEGACY = `scheme: "Legacy Test"
author: "someone"
base00: 000000
base01: "111111"
base02: "222222"
base03: "333333"
base04: "444444"
base05: "dddddd"
base06: "eeeeee"
base07: "ffffff"
base08: "ff0000"
base09: "ff8800"
base0a: "ffff00"
base0b: 008000
base0c: "00ffff"
base0d: "0000ff"
base0e: "ff00ff"
base0f: "884400"
`;

// From tinted-theming/schemes (spec-0.11), tinted8/nord.yaml (palette part)
const NORD_T8 = `scheme:
  system: "tinted8"
  supports:
    styling-spec: "0.2.0"
  name: "Nord"
  author: "Tinted Theming (https://github.com/tinted-theming)"
  theme-author: "Arctic Ice Studio (https://www.nordtheme.com)"
variant: "dark"
palette:
  black: "#2e3440"
  red: "#bf616a"
  yellow: "#ebcb8b"
  green: "#a3be8c"
  cyan: "#88c0d0"
  blue: "#81a1c1"
  magenta: "#b48ead"
  white: "#e5e9f0"
  orange: "#d08770"
  gray: "#616E88"
  white-dim: "#d8dee9"
  white-bright: "#eceff4"
  blue-dim: "#5e81ac"
syntax:
  comment: "#616E88"
`;

const BASE24_EXTRA = `
  base10: "#1e2029"
  base11: "#16171d"
  base12: "#ff6e6e"
  base13: "#ffffa5"
  base14: "#69ff94"
  base15: "#a4ffff"
  base16: "#d6acff"
  base17: "#ff92df"
`;

describe('parseScheme', () => {
  it('reads current-spec Base16', () => {
    const s = parseScheme(GRUVBOX);
    expect(s.format).toBe('base16');
    expect(s.name).toBe('Gruvbox dark, hard');
    expect(s.variant).toBe('dark');
    expect(s.palette.base00).toBe('#1d2021');
    expect(Object.keys(s.palette)).toHaveLength(16);
  });

  it('reads legacy Base16 with bare and unquoted numeric hex values', () => {
    const s = parseScheme(LEGACY);
    expect(s.format).toBe('base16');
    expect(s.name).toBe('Legacy Test');
    expect(s.palette.base00).toBe('#000000');
    expect(s.palette.base0B).toBe('#008000');
    expect(s.palette.base0A).toBe('#ffff00');
  });

  it('detects Base24 only when base10–base17 are complete', () => {
    expect(parseScheme(GRUVBOX.replace('system: "base16"', 'system: "base24"') + BASE24_EXTRA).format).toBe('base24');
    const partial = parseScheme(GRUVBOX.replace('system: "base16"', 'system: "base24"') + '  base10: "#111111"\n');
    expect(partial.format).toBe('base16');
    expect(partial.warnings.join(' ')).toMatch(/Base24/);
  });

  it('reads Tinted8 with named colors and theme author', () => {
    const s = parseScheme(NORD_T8);
    expect(s.format).toBe('tinted8');
    expect(s.name).toBe('Nord');
    expect(s.author).toBe('Arctic Ice Studio (https://www.nordtheme.com)');
    expect(s.palette['white-bright']).toBe('#eceff4');
    expect(s.palette.gray).toBe('#616e88');
  });

  it('accepts JSON as well as YAML', () => {
    const json = JSON.stringify({ system: 'base16', name: 'J', palette: parseScheme(GRUVBOX).palette });
    expect(parseScheme(json).name).toBe('J');
  });

  it('rejects malformed or incomplete files with readable errors', () => {
    expect(() => parseScheme('this: [is: not')).toThrow(ThemeImportError);
    expect(() => parseScheme('name: nothing')).toThrow(/recognized/);
    expect(() => parseScheme(GRUVBOX.replace(/ {2}base0F.*\n/, ''))).toThrow(/missing base0F/);
    expect(() => parseScheme('scheme:\n  system: "tinted8"\npalette:\n  red: "#ff0000"\n')).toThrow(/missing black and white/);
    expect(() => parseScheme('x'.repeat(300 * 1024))).toThrow(/too large/);
  });

  it('ignores unknown fields and invalid colors with a warning', () => {
    const s = parseScheme(`${GRUVBOX}extra: 1\n`.replace('base0F: "#d65d0e"', 'base0F: "#d65d0e"\n  base1Z: "nope"'));
    expect(s.format).toBe('base16');
  });
});

describe('mapping and building', () => {
  it('maps every semantic token to an existing palette color', () => {
    for (const text of [GRUVBOX, LEGACY, NORD_T8]) {
      const s = parseScheme(text);
      const m = defaultMapping(s);
      for (const key of THEME_COLOR_KEYS) expect(s.palette[m[key]]).toBeDefined();
    }
  });

  it('follows THEMING §18 for Base16 (orange accent, red danger, green success)', () => {
    const t = buildTheme(parseScheme(GRUVBOX));
    expect(t.colors.bg).toBe('#1d2021');
    expect(t.colors.primary).toBe('#fe8019');
    expect(t.colors.danger).toBe('#fb4934');
    expect(t.colors.success).toBe('#b8bb26');
    expect(t.source).toBe('imported');
    expect(t.format).toBe('base16');
    expect(validateTheme(t).filter((i) => i.level === 'error')).toEqual([]);
  });

  it('applies an edited mapping and keeps the full palette for later remapping', () => {
    const s = parseScheme(GRUVBOX);
    const t = buildTheme(s, { primary: 'base0D' }, 'My Gruvbox');
    expect(t.colors.primary).toBe('#83a598');
    expect(t.name).toBe('My Gruvbox');
    expect(t.palette).toEqual(s.palette);
    expect(t.mapping?.primary).toBe('base0D');
  });

  it('uses Tinted8 fallbacks when optional variants are missing', () => {
    const t = buildTheme(parseScheme(NORD_T8));
    expect(t.colors.bg).toBe('#2e3440'); // no black-dim → black
    expect(t.colors.accentBright).toBe('#d08770'); // no orange-bright → orange
    expect(t.colors.textSecondary).toBe('#d8dee9'); // white-dim
  });
});

describe('export', () => {
  it('Base16 export parses back as a valid Base16 scheme', () => {
    const yaml = exportBase16Yaml(LIQUEAMP_DEFAULT);
    const s = parseScheme(yaml);
    expect(s.format).toBe('base16');
    expect(s.name).toBe('LiqueAmp Default');
    expect(s.palette.base00).toBe(LIQUEAMP_DEFAULT.colors.bg);
    expect(s.palette.base09).toBe(LIQUEAMP_DEFAULT.colors.primary);
  });

  it('LIQUEAMP JSON round-trips every color as a new imported theme', () => {
    const back = parseLiqueAmpJson(exportLiqueAmpJson(LIQUEAMP_DEFAULT))!;
    expect(back.colors).toEqual(LIQUEAMP_DEFAULT.colors);
    expect(back.source).toBe('imported');
    expect(back.id).not.toBe(LIQUEAMP_DEFAULT.id);
    expect(parseLiqueAmpJson('{"not":"a theme"}')).toBeNull();
    expect(parseLiqueAmpJson('garbage')).toBeNull();
  });
});

describe('theme library operations', () => {
  beforeEach(async () => {
    await resetDbForTests();
    globalThis.indexedDB = new IDBFactory();
    useSettings.setState({ ...DEFAULT_SETTINGS, hydrated: true });
    await useThemes.getState().hydrate();
  });

  it('duplicates built-ins as editable copies and renames without changing the id', async () => {
    const copy = await useThemes.getState().duplicateTheme(LIQUEAMP_DEFAULT.id);
    expect(copy.source).toBe('user');
    expect(copy.id).not.toBe(LIQUEAMP_DEFAULT.id);
    await useThemes.getState().renameTheme(copy.id, 'Forest Terminal');
    await useThemes.getState().hydrate();
    const stored = useThemes.getState().themes.find((t) => t.id === copy.id)!;
    expect(stored.name).toBe('Forest Terminal');
  });

  it('refuses to delete the active theme', async () => {
    const t = buildTheme(parseScheme(GRUVBOX));
    await useThemes.getState().saveTheme(t);
    useSettings.setState({ activeThemeId: t.id });
    await expect(useThemes.getState().deleteTheme(t.id)).rejects.toThrow(/Activate another theme/);
    useSettings.setState({ activeThemeId: LIQUEAMP_DEFAULT.id });
    await useThemes.getState().deleteTheme(t.id);
    expect(useThemes.getState().themes.some((x) => x.id === t.id)).toBe(false);
  });

  it('persists imported themes with their palette and mapping', async () => {
    const t = buildTheme(parseScheme(NORD_T8));
    await useThemes.getState().saveTheme(t);
    await useThemes.getState().hydrate();
    const stored = useThemes.getState().themes.find((x) => x.id === t.id)!;
    expect(stored.format).toBe('tinted8');
    expect(stored.palette?.orange).toBe('#d08770');
    expect(stored.mapping?.primary).toBe('orange');
  });
});
