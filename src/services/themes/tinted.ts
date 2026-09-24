// Tinted Theming import/export (THEMING §4–7, §15–18, §34).
// Supported, checked against tinted-theming/schemes (spec-0.11, 2026-09-23):
//  - Base16 / Base24:   system: "base16"|"base24", name, author, variant, palette.baseXX
//  - legacy Base16/24:  scheme: "Name", author, baseXX: "rrggbb" at top level
//  - Tinted8:           scheme: { system: "tinted8", name | family+style }, variant,
//                       palette: black, red, …, with optional "-bright"/"-dim" variants
// Theme files are data only; YAML is parsed, never executed (THEMING §71).

import { parse as parseYaml } from 'yaml';
import { createId, nowIso } from '../../lib/id';
import { BASE16_KEYS, type Base16Palette, type LiqueAmpTheme } from '../../types/theme';
import { paletteFromTinted8, pickBase16 } from './base16';
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

// ---- scheme → theme ----------------------------------------------------------------

/**
 * The Base16 palette a scheme becomes. Base16 is used as is; Base24 keeps its
 * first 16 slots (base10–base17 have no role in LIQUEAMP); Tinted8 names are
 * converted to the matching Base16 slots.
 */
export function schemePalette(scheme: ParsedScheme): Base16Palette {
  if (scheme.format === 'tinted8') return paletteFromTinted8(scheme.palette, LIQUEAMP_DEFAULT.palette);
  return pickBase16(scheme.palette) ?? { ...LIQUEAMP_DEFAULT.palette };
}

/** Import notes shown next to the palette preview. */
export function schemeNotes(scheme: ParsedScheme): string[] {
  if (scheme.format === 'base24') return ['Base24: base00–base0F are used; base10–base17 have no role in LIQUEAMP.'];
  if (scheme.format === 'tinted8') return ['Tinted8: the named colors were converted to the 16 Base16 slots.'];
  return [];
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

/** Builds a LIQUEAMP theme from a parsed scheme. */
export function buildTheme(scheme: ParsedScheme, name = scheme.name): LiqueAmpTheme {
  const now = nowIso();
  return normalizeTheme({
    id: createId(`theme-${slug(name)}`).slice(0, 64),
    name: name.trim() || scheme.name,
    source: 'imported',
    palette: schemePalette(scheme),
    effects: { glowEnabled: true, glowIntensity: scheme.variant === 'light' ? 0.2 : 0.5, borderRadius: 2 },
    author: scheme.author,
    variant: scheme.variant,
    origin: scheme.format === 'base16' ? undefined : `${scheme.format === 'base24' ? 'Base24' : 'Tinted8'} import`,
    createdAt: now,
    updatedAt: now,
  });
}

// ---- export ------------------------------------------------------------------------

/** LIQUEAMP's own JSON format: the Base16 palette, effects and metadata (THEMING §70). */
export function exportLiqueAmpJson(theme: LiqueAmpTheme): string {
  const { id, name, palette, effects, author, variant } = theme;
  return JSON.stringify({ liqueamp: 'theme', id, name, version: 2, palette, effects, author, variant }, null, 2);
}

/** Base16 export in the current 0.11 layout — exact, since a theme is a Base16 palette. */
export function exportBase16Yaml(theme: LiqueAmpTheme): string {
  const q = (s: string) => JSON.stringify(s);
  const lines = [
    `system: "base16"`,
    `name: ${q(theme.name)}`,
    `author: ${q(theme.author ?? 'LIQUEAMP export')}`,
    `variant: ${q(theme.variant ?? 'dark')}`,
    'palette:',
    ...BASE16_KEYS.map((k) => `  ${k}: "${theme.palette[k]}"`),
  ];
  return `${lines.join('\n')}\n`;
}

/** Imports a LIQUEAMP JSON theme export (version 2 palette, or version 1 colors). */
export function parseLiqueAmpJson(text: string): LiqueAmpTheme | null {
  let obj: unknown;
  try {
    obj = JSON.parse(text);
  } catch {
    return null;
  }
  if (!isObj(obj) || obj.liqueamp !== 'theme' || !str(obj.name)) return null;
  if (!isObj(obj.palette) && !isObj(obj.colors)) return null;
  const now = nowIso();
  return normalizeTheme({
    ...(obj as Record<string, never>),
    id: createId(`theme-${slug(String(obj.name))}`).slice(0, 64),
    name: String(obj.name).trim(),
    source: 'imported',
    createdAt: now,
    updatedAt: now,
  });
}
