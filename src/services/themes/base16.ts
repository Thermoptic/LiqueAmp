// The one rule that turns a Base16 palette into the 25 semantic colors the
// UI uses (THEMING §8). Base16 roles (tinted-theming styling guide):
//   base00–base07  background → foreground ramp
//                  00 default bg · 01 lighter bg · 02 selection bg · 03 comments
//                  04 dark fg · 05 default fg · 06 light fg · 07 lightest
//   base08–base0F  accents: red, orange, yellow, green, cyan, blue, magenta, brown
// LIQUEAMP's accent family is built on base09 (orange), like the default theme.
// In-between shades are mixed from two slots, so every theme — built-in or
// imported — looks the way its palette intends, with no per-theme mapping.
import { BASE16_KEYS, type Base16Key, type Base16Palette, type ThemeColors } from '../../types/theme';
import { contrastRatio, normalizeHex, relativeLuminance } from './color';

/** Linear mix of two #rrggbb colors; t = 0 → a, 1 → b. */
export function mixHex(a: string, b: string, t: number): string {
  const pa = parseInt(a.slice(1), 16);
  const pb = parseInt(b.slice(1), 16);
  const ch = (shift: number) => {
    const x = (pa >> shift) & 255;
    const y = (pb >> shift) & 255;
    return Math.round(x + (y - x) * t);
  };
  return `#${[16, 8, 0].map((s) => ch(s).toString(16).padStart(2, '0')).join('')}`;
}

/**
 * Walks from `from` towards `to` in small steps until `fg` reaches `min`
 * contrast on every background. Published schemes often keep base03/base04
 * dim on purpose (comments in an editor); LIQUEAMP uses them for small UI
 * text, so they are brightened towards the scheme's own foreground as needed.
 */
function readable(from: string, to: string, backgrounds: readonly string[], min: number): string {
  for (let t = 0; t <= 1.0001; t += 0.05) {
    const fg = mixHex(from, to, Math.min(1, t));
    if (backgrounds.every((bg) => contrastRatio(fg, bg) >= min)) return fg;
  }
  return to;
}

/** The semantic colors for a palette (always the same rule). */
export function deriveColors(p: Base16Palette): ThemeColors {
  const surface2 = mixHex(p.base01, p.base02, 0.5);
  const surfaces = [p.base00, p.base01, surface2, p.base02];
  // The far end of the ramp. Most schemes put the strongest foreground in
  // base07, some (Rosé Pine, Catppuccin) use base07 for something else.
  const far = [p.base07, p.base06, p.base05].reduce((a, b) => (contrastRatio(b, p.base00) > contrastRatio(a, p.base00) ? b : a));
  const text = readable(p.base05, far, surfaces, 4.5);
  // Text on a colored fill: the ramp color that reads best on it, pushed to
  // black/white only when no palette color reaches AA.
  const ramp = [p.base00, p.base01, p.base02, p.base03, p.base04, p.base05, p.base06, p.base07];
  const on = (fill: string) => {
    const best = ramp.reduce((a, b) => (contrastRatio(b, fill) > contrastRatio(a, fill) ? b : a));
    const extreme = contrastRatio('#ffffff', fill) > contrastRatio('#000000', fill) ? '#ffffff' : '#000000';
    return readable(best, extreme, [fill], 4.5);
  };
  // Colors used as text or icons on panels keep their hue but are moved
  // towards the foreground until they are readable (AA text, 3:1 icons).
  const asText = (c: string) => readable(c, far, surfaces, 4.5);
  const asIcon = (c: string) => readable(c, far, surfaces, 3);
  return {
    bg: p.base00,
    surface: p.base01,
    surface2,
    surface3: p.base02,
    borderSubtle: p.base02,
    border: mixHex(p.base02, p.base03, 0.5),
    borderStrong: p.base03,
    text,
    textSecondary: readable(p.base04, text, surfaces, 4.5),
    textMuted: readable(mixHex(p.base03, p.base04, 0.5), text, surfaces, 4.5),
    textDisabled: mixHex(p.base03, p.base04, 0.15),
    heading: asText(p.base06),
    strong: asText(p.base07),
    primary: p.base09,
    onPrimary: on(p.base09),
    accent: readable(mixHex(p.base09, far, 0.15), far, surfaces, 4.5),
    accentBright: readable(mixHex(p.base09, far, 0.45), far, surfaces, 4.5),
    secondary: p.base0C,
    success: p.base0B,
    warning: p.base0A,
    danger: p.base08,
    info: p.base0D,
    live: p.base08,
    visualizer: p.base09,
    visualizerSecondary: p.base0A,
    glow: p.base09,
    glowStrong: mixHex(p.base09, far, 0.3),
    // one role per remaining slot, so every Base16 color has a job
    hover: p.base0A,
    hoverText: asText(p.base0A),
    onHover: on(p.base0A),
    link: asText(p.base0D),
    focus: asIcon(p.base0D),
    icon: asIcon(p.base0C),
    selection: p.base0E,
    onSelection: on(p.base0E),
    tag: asText(p.base0F),
    toggleOn: p.base0B,
    onToggleOn: on(p.base0B),
    toggleOff: p.base08,
    toggleOnText: asText(p.base0B),
    toggleOffText: asText(p.base08),
    onDanger: on(p.base08),
  };
}

/** What each slot drives in LIQUEAMP — shown in the theme editor. */
export const BASE16_ROLES: Record<Base16Key, string> = {
  base00: 'Background',
  base01: 'Panels',
  base02: 'Fields, raised surfaces, subtle borders',
  base03: 'Borders, metadata',
  base04: 'Labels, secondary text',
  base05: 'Text',
  base06: 'Headings',
  base07: 'Track title, clock',
  base08: 'Red — errors, LIVE, delete, switches off',
  base09: 'Orange — accent, active items, visualizer, glow',
  base0A: 'Yellow — hover, warnings, visualizer peaks',
  base0B: 'Green — switches on, online, success',
  base0C: 'Cyan — icons',
  base0D: 'Blue — links, outline buttons, focus',
  base0E: 'Magenta — selected text and rows',
  base0F: 'Brown — tags and formats',
};

export function isBase16Palette(value: unknown): value is Base16Palette {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return BASE16_KEYS.every((k) => normalizeHex(v[k]) !== null);
}

/** The 16 slots of a Base16/Base24 palette (Base24's base10–base17 are not used). */
export function pickBase16(palette: Record<string, string>): Base16Palette | null {
  const out = {} as Base16Palette;
  for (const k of BASE16_KEYS) {
    const hex = normalizeHex(palette[k]);
    if (!hex) return null;
    out[k] = hex;
  }
  return out;
}

/**
 * Tinted8 names → Base16 slots. Tinted8 has named colors with optional
 * "-bright"/"-dim" variants; the first one present is used.
 */
const TINTED8_TO_BASE16: Record<Base16Key, string[]> = {
  base00: ['black-dim', 'black'],
  base01: ['black'],
  base02: ['black-bright', 'gray-dim', 'black'],
  base03: ['gray', 'gray-dim', 'black-bright'],
  base04: ['white-dim', 'gray-bright', 'white'],
  base05: ['white'],
  base06: ['white-bright', 'white'],
  base07: ['white-bright', 'white'],
  base08: ['red', 'red-bright'],
  base09: ['orange', 'red-bright', 'yellow'],
  base0A: ['yellow', 'yellow-bright'],
  base0B: ['green', 'green-bright'],
  base0C: ['cyan', 'cyan-bright'],
  base0D: ['blue', 'blue-bright'],
  base0E: ['magenta', 'magenta-bright'],
  base0F: ['orange-dim', 'red-dim', 'orange', 'red'],
};

export function paletteFromTinted8(palette: Record<string, string>, fallback: Base16Palette): Base16Palette {
  const out = {} as Base16Palette;
  for (const k of BASE16_KEYS) out[k] = normalizeHex(TINTED8_TO_BASE16[k].map((n) => palette[n]).find(Boolean)) ?? fallback[k];
  return out;
}

/**
 * Best Base16 approximation of a version-1 theme (25 free colors), used once
 * when such a theme is migrated. Exact for themes that came from Base16.
 */
export function paletteFromLegacyColors(c: Partial<ThemeColors>, fallback: Base16Palette): Base16Palette {
  const hex = (v: unknown, alt: string) => normalizeHex(v) ?? alt;
  const text = hex(c.text, fallback.base05);
  const lightest = relativeLuminance(hex(c.bg, fallback.base00)) > 0.5 ? '#000000' : '#ffffff';
  return {
    base00: hex(c.bg, fallback.base00),
    base01: hex(c.surface, fallback.base01),
    base02: hex(c.surface3, fallback.base02),
    base03: hex(c.borderStrong, fallback.base03),
    base04: hex(c.textSecondary, fallback.base04),
    base05: text,
    base06: mixHex(text, lightest, 0.3),
    base07: mixHex(text, lightest, 0.6),
    base08: hex(c.danger, fallback.base08),
    base09: hex(c.primary, fallback.base09),
    base0A: hex(c.warning, fallback.base0A),
    base0B: hex(c.success, fallback.base0B),
    base0C: hex(c.secondary, fallback.base0C),
    base0D: hex(c.info, fallback.base0D),
    base0E: hex(c.visualizerSecondary, fallback.base0E),
    base0F: hex(c.glowStrong, fallback.base0F),
  };
}

/** A palette is "light" when its background is light. */
export function paletteVariant(p: Base16Palette): 'dark' | 'light' {
  return relativeLuminance(p.base00) > 0.5 ? 'light' : 'dark';
}
