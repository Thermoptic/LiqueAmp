// Tinted Theming import/export (THEMING §4–7, §15–18, §34).
// Supported, checked against tinted-theming/schemes (spec-0.11, 2026-09-23):
//  - Base16 / Base24:   system: "base16"|"base24", name, author, variant, palette.baseXX
//  - legacy Base16/24:  scheme: "Name", author, baseXX: "rrggbb" at top level
//  - Tinted8:           scheme: { system: "tinted8", name | family+style }, variant,
//                       palette: black, red, …, with optional "-bright"/"-dim" variants
// Theme files are data only; YAML is parsed, never executed (THEMING §71).

import { parse as parseYaml } from 'yaml';
import { createId, nowIso } from '../../lib/id';
import { THEME_COLOR_KEYS, type LiqueAmpTheme, type ThemeColorKey } from '../../types/theme';
import { LIQUEAMP_DEFAULT } from './builtin';
import { normalizeHex } from './color';
import { normalizeTheme } from './theme';

export type SchemeFormat = 'base16' | 'base24' | 'tinted8';

export interface ParsedScheme {
  format: SchemeFormat;
  name: string;
  author?: string;
  variant?: 'dark' | 'light';
  /** Normalized #rrggbb values keyed by palette name (base00…, black, red-bright…). */
  palette: Record<string, string>;
  warnings: string[];
}

export class ThemeImportError extends Error {}

const MAX_BYTES = 256 * 1024;
export const BASE16_KEYS = Array.from({ length: 16 }, (_, i) => `base0${i.toString(16).toUpperCase()}`);
export const BASE24_EXTRA_KEYS = Array.from({ length: 8 }, (_, i) => `base1${i}`);
const TINTED8_COLORS = ['black', 'white', 'red', 'yellow', 'green', 'cyan', 'blue', 'magenta', 'gray', 'orange'];

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : undefined);

function readPalette(source: Obj, keys: (k: string) => boolean): { palette: Record<string, string>; invalid: string[] } {
  const palette: Record<string, string> = {};
  const invalid: string[] = [];
  for (const [k, v] of Object.entries(source)) {
    if (!keys(k)) continue;
    // Unquoted legacy values such as 000000 or 008000 arrive as YAML numbers.
    const hex = normalizeHex(typeof v === 'number' && Number.isInteger(v) && v >= 0 ? String(v).padStart(6, '0') : v);
    if (hex) palette[k] = hex;
    else invalid.push(k);
  }
  return { palette, invalid };
}

function variantOf(v: unknown): 'dark' | 'light' | undefined {
  const s = str(v)?.toLowerCase();
  return s === 'dark' || s === 'light' ? s : undefined;
}

/** Parses YAML or JSON scheme text. Throws ThemeImportError with a readable reason. */
export function parseScheme(text: string): ParsedScheme {
  if (text.length > MAX_BYTES) throw new ThemeImportError('The file is too large to be a theme (limit 256 KB).');
  let doc: unknown;
  try {
    doc = parseYaml(text, { maxAliasCount: 50 });
  } catch (err) {
    throw new ThemeImportError(`The file is not valid YAML or JSON: ${(err as Error).message}`);
  }
  if (!isObj(doc)) throw new ThemeImportError('The file does not contain a theme definition.');

  // Tinted8: nested scheme block with system tinted8.
  if (isObj(doc.scheme) && str(doc.scheme.system) === 'tinted8') {
    if (!isObj(doc.palette)) throw new ThemeImportError('This Tinted8 file has no palette.');
    const known = (k: string) => TINTED8_COLORS.some((c) => k === c || k === `${c}-bright` || k === `${c}-dim`);
    const { palette, invalid } = readPalette(doc.palette, known);
    const missing = ['black', 'white'].filter((k) => !palette[k]);
    if (missing.length) throw new ThemeImportError(`This Tinted8 palette is missing ${missing.join(' and ')}.`);
    const s = doc.scheme;
    const name = str(s.name) ?? ([str(s.family), str(s.style)].filter(Boolean).join(' ') || 'Tinted8 theme');
    return {
      format: 'tinted8',
      name,
      author: str(s['theme-author']) ?? str(s.author),
      variant: variantOf(doc.variant),
      palette,
      warnings: invalid.map((k) => `Ignored invalid color "${k}".`),
    };
  }

  // Base16/Base24 (current spec: palette block; legacy: keys at top level).
  const source = isObj(doc.palette) ? doc.palette : doc;
  const isBaseKey = (k: string) => /^base[0-9a-fA-F]{2}$/.test(k);
  const { palette: raw, invalid } = readPalette(source, isBaseKey);
  // Normalize key case: base0a → base0A.
  const palette: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw)) palette[`base${k.slice(4).toUpperCase()}`] = v;
  const system = str(doc.system)?.toLowerCase();
  if (Object.keys(palette).length === 0) {
    throw new ThemeImportError('The file does not contain a recognized Base16, Base24 or Tinted8 palette.');
  }
  const missing16 = BASE16_KEYS.filter((k) => !palette[k]);
  if (missing16.length) throw new ThemeImportError(`The palette is incomplete: missing ${missing16.join(', ')}.`);
  const hasBase24 = BASE24_EXTRA_KEYS.every((k) => palette[k]);
  const warnings = invalid.map((k) => `Ignored invalid color "${k}".`);
  if (system === 'base24' && !hasBase24) warnings.push('Declared as Base24 but the base10–base17 colors are incomplete; imported as Base16.');
  const name = str(doc.name) ?? str(doc.scheme) ?? 'Imported theme';
  return {
    format: hasBase24 ? 'base24' : 'base16',
    name,
    author: str(doc.author),
    variant: variantOf(doc.variant),
    palette,
    warnings,
  };
}

// ---- semantic mapping ----------------------------------------------------------

/** Candidate palette keys per semantic token; the first one present is used. */
const BASE_MAPPING: Record<ThemeColorKey, string[]> = {
  bg: ['base00'],
  surface: ['base01'],
  surface2: ['base01'],
  surface3: ['base02'],
  border: ['base02'],
  borderSubtle: ['base01'],
  borderStrong: ['base03'],
  text: ['base05'],
  textSecondary: ['base04'],
  textMuted: ['base03'],
  textDisabled: ['base02'],
  primary: ['base09'],
  secondary: ['base0C'],
  accent: ['base09'],
  accentBright: ['base0A'],
  success: ['base0B'],
  warning: ['base0A'],
  danger: ['base08'],
  info: ['base0D'],
  live: ['base08'],
  visualizer: ['base09'],
  visualizerSecondary: ['base0B'],
  glow: ['base09'],
  glowStrong: ['base0A'],
  focus: ['base0A'],
};

const TINTED8_MAPPING: Record<ThemeColorKey, string[]> = {
  bg: ['black-dim', 'black'],
  surface: ['black'],
  surface2: ['black-bright', 'black'],
  surface3: ['black-bright', 'gray-dim', 'gray'],
  border: ['black-bright', 'gray-dim', 'gray'],
  borderSubtle: ['black-bright', 'black'],
  borderStrong: ['gray', 'gray-dim', 'white-dim'],
  text: ['white', 'white-bright'],
  textSecondary: ['white-dim', 'white'],
  textMuted: ['gray', 'gray-bright', 'white-dim'],
  textDisabled: ['gray-dim', 'gray', 'black-bright'],
  primary: ['orange', 'yellow', 'red'],
  secondary: ['cyan', 'green', 'blue'],
  accent: ['orange', 'yellow', 'red'],
  accentBright: ['orange-bright', 'yellow-bright', 'orange', 'yellow'],
  success: ['green', 'green-bright'],
  warning: ['yellow', 'orange'],
  danger: ['red', 'red-bright'],
  info: ['blue', 'cyan'],
  live: ['red-bright', 'red'],
  visualizer: ['orange', 'yellow', 'red'],
  visualizerSecondary: ['green', 'cyan'],
  glow: ['orange', 'yellow', 'red'],
  glowStrong: ['orange-bright', 'yellow-bright', 'orange'],
  focus: ['yellow-bright', 'yellow', 'orange'],
};

/**
 * The default semantic mapping for a scheme (THEMING §18). Every token maps
 * to a palette entry that exists; tokens with no candidate fall back to the
 * scheme's text or background color.
 */
export function defaultMapping(scheme: ParsedScheme): Record<ThemeColorKey, string> {
  const table = scheme.format === 'tinted8' ? TINTED8_MAPPING : BASE_MAPPING;
  const fallback = scheme.format === 'tinted8' ? ['white', 'black'] : ['base05', 'base00'];
  const out = {} as Record<ThemeColorKey, string>;
  for (const key of THEME_COLOR_KEYS) {
    out[key] = [...table[key], ...fallback].find((k) => scheme.palette[k])!;
  }
  return out;
}

function slug(name: string) {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 32) || 'theme'
  );
}

/** Builds a LIQUEAMP theme from a parsed scheme and a (possibly edited) mapping. */
export function buildTheme(scheme: ParsedScheme, mapping: Partial<Record<ThemeColorKey, string>> = {}, name = scheme.name): LiqueAmpTheme {
  const full = { ...defaultMapping(scheme), ...mapping };
  const colors = { ...LIQUEAMP_DEFAULT.colors };
  for (const key of THEME_COLOR_KEYS) {
    const value = scheme.palette[full[key]];
    if (value) colors[key] = value;
  }
  const now = nowIso();
  return normalizeTheme({
    id: createId(`theme-${slug(name)}`).slice(0, 64),
    name: name.trim() || scheme.name,
    version: 1,
    source: 'imported',
    colors,
    effects: { glowEnabled: true, glowIntensity: scheme.variant === 'light' ? 0.25 : 0.5, borderRadius: 2 },
    palette: scheme.palette,
    format: scheme.format,
    mapping: full,
    author: scheme.author,
    variant: scheme.variant,
    createdAt: now,
    updatedAt: now,
  });
}

// ---- export ------------------------------------------------------------------------

/** LIQUEAMP's own JSON format: every semantic color, effects and metadata (THEMING §70). */
export function exportLiqueAmpJson(theme: LiqueAmpTheme): string {
  const { id, name, version, colors, effects, palette, format, mapping, author, variant } = theme;
  return JSON.stringify({ liqueamp: 'theme', id, name, version, colors, effects, palette, format, mapping, author, variant }, null, 2);
}

/**
 * Base16 export. Base16 has 16 slots and LIQUEAMP 25 tokens, so this is the
 * closest valid representation (THEMING §34), in the current 0.11 layout.
 */
export function exportBase16Yaml(theme: LiqueAmpTheme): string {
  const c = theme.colors;
  const palette: Record<string, string> = {
    base00: c.bg,
    base01: c.surface,
    base02: c.surface3,
    base03: c.textMuted,
    base04: c.textSecondary,
    base05: c.text,
    base06: c.text,
    base07: c.accentBright,
    base08: c.danger,
    base09: c.primary,
    base0A: c.warning,
    base0B: c.success,
    base0C: c.secondary,
    base0D: c.info,
    base0E: c.visualizerSecondary,
    base0F: c.glowStrong,
  };
  const q = (s: string) => JSON.stringify(s);
  const lines = [
    `system: "base16"`,
    `name: ${q(theme.name)}`,
    `author: ${q(theme.author ?? 'LIQUEAMP export')}`,
    `variant: ${q(theme.variant ?? 'dark')}`,
    'palette:',
    ...BASE16_KEYS.map((k) => `  ${k}: "${palette[k]}"`),
  ];
  return `${lines.join('\n')}\n`;
}

/** Imports a LIQUEAMP JSON theme export. */
export function parseLiqueAmpJson(text: string): LiqueAmpTheme | null {
  let obj: unknown;
  try {
    obj = JSON.parse(text);
  } catch {
    return null;
  }
  if (!isObj(obj) || obj.liqueamp !== 'theme' || !isObj(obj.colors) || !str(obj.name)) return null;
  const now = nowIso();
  return normalizeTheme({
    ...(obj as unknown as LiqueAmpTheme),
    id: createId(`theme-${slug(String(obj.name))}`).slice(0, 64),
    name: String(obj.name).trim(),
    version: 1,
    source: 'imported',
    format: 'liqueamp',
    createdAt: now,
    updatedAt: now,
  });
}
