import { BASE16_KEYS, THEME_COLOR_KEYS, type Base16Palette, type LiqueAmpTheme, type ThemeColorKey, type ThemeColors } from '../../types/theme';
import { deriveColors, paletteFromLegacyColors, paletteFromTinted8, paletteVariant, pickBase16 } from './base16';
import { contrastRatio, gradeContrast, normalizeHex } from './color';
import { LIQUEAMP_DEFAULT } from './builtin';

/** `surface2` → `--la-surface-2`, `textSecondary` → `--la-text-secondary`. */
export function cssVarName(key: ThemeColorKey): string {
  return `--la-${key.replace(/([A-Z])/g, '-$1').replace(/(\d+)/g, '-$1').toLowerCase()}`;
}

export interface ThemeIssue {
  level: 'error' | 'warning';
  message: string;
}

/**
 * Validates a theme. Errors (an invalid palette) block saving; warnings (low
 * contrast in the derived colors) are informational and never reject an
 * artistic theme (THEMING §21).
 */
export function validateTheme(theme: LiqueAmpTheme): ThemeIssue[] {
  const issues: ThemeIssue[] = [];
  if (!theme.id.trim()) issues.push({ level: 'error', message: 'Theme has no id.' });
  if (!theme.name.trim()) issues.push({ level: 'error', message: 'Theme has no name.' });
  for (const key of BASE16_KEYS) {
    if (!normalizeHex(theme.palette?.[key])) issues.push({ level: 'error', message: `${key} is not a valid hex color.` });
  }
  if (issues.some((i) => i.level === 'error')) return issues;

  const colors = deriveColors(theme.palette);
  const pairs: Array<[ThemeColorKey, ThemeColorKey, string]> = [
    ['text', 'bg', 'Primary text'],
    ['text', 'surface', 'Primary text on panels'],
    ['textMuted', 'surface', 'Muted text on panels'],
    ['primary', 'bg', 'Primary accent'],
    ['focus', 'surface', 'Focus outline'],
  ];
  for (const [fg, bg, label] of pairs) {
    const ratio = contrastRatio(colors[fg], colors[bg]);
    const threshold = fg === 'text' ? 4.5 : 3;
    if (ratio < threshold) {
      issues.push({
        level: 'warning',
        message: `${label} has low contrast (${ratio.toFixed(1)}:1, ${gradeContrast(ratio)}).`,
      });
    }
  }
  return issues;
}

/** Loose input: a current theme, a stored/imported version-1 theme, or partial data. */
export type ThemeInput = Partial<Omit<LiqueAmpTheme, 'palette' | 'colors'>> & {
  palette?: Record<string, unknown>;
  colors?: Record<string, unknown>;
  /** version-1 field: which format the palette came from */
  format?: string;
};

/**
 * Brings any theme into the Base16 model (version 2): the palette is the
 * theme, the semantic colors are derived. Version-1 themes are migrated:
 * Base16/Base24 imports keep their exact palette, Tinted8 imports are
 * converted, hand-made themes (25 free colors) get the closest Base16 palette.
 */
export function normalizeTheme(input: ThemeInput): LiqueAmpTheme {
  const fallback = LIQUEAMP_DEFAULT.palette;
  const rawPalette = (input.palette ?? {}) as Record<string, string>;
  const palette: Base16Palette =
    pickBase16(rawPalette) ??
    (input.format === 'tinted8' && rawPalette.black ? paletteFromTinted8(rawPalette, fallback) : null) ??
    (input.colors ? paletteFromLegacyColors(input.colors as Partial<ThemeColors>, fallback) : null) ??
    { ...fallback };
  const fx = input.effects ?? LIQUEAMP_DEFAULT.effects;
  const theme: LiqueAmpTheme = {
    id: String(input.id ?? ''),
    name: String(input.name ?? ''),
    version: 2,
    source: input.source === 'builtin' || input.source === 'imported' ? input.source : 'user',
    palette,
    colors: deriveColors(palette),
    effects: {
      glowEnabled: Boolean(fx.glowEnabled),
      glowIntensity: clamp(Number(fx.glowIntensity) || 0, 0, 1),
      borderRadius: clamp(Number(fx.borderRadius) || 0, 0, 8),
    },
    variant: input.variant === 'light' || input.variant === 'dark' ? input.variant : paletteVariant(palette),
  };
  if (input.author) theme.author = input.author;
  if (input.origin) theme.origin = input.origin;
  else if (input.format === 'base24') theme.origin = 'Base24 import';
  else if (input.format === 'tinted8') theme.origin = 'Tinted8 import';
  if (input.createdAt) theme.createdAt = input.createdAt;
  if (input.updatedAt) theme.updatedAt = input.updatedAt;
  return theme;
}

function clamp(v: number, min: number, max: number) {
  return Math.min(max, Math.max(min, v));
}

/**
 * Applies a theme by updating CSS variables only — no re-render, no reload,
 * no effect on playback (THEMING §39, §80).
 */
export function applyTheme(theme: LiqueAmpTheme, glowLevel = 1, root: HTMLElement = document.documentElement): void {
  for (const key of THEME_COLOR_KEYS) {
    root.style.setProperty(cssVarName(key), theme.colors[key]);
  }
  const glow = theme.effects.glowEnabled ? clamp(theme.effects.glowIntensity * glowLevel, 0, 1) : 0;
  root.style.setProperty('--la-glow-amount', String(glow));
  root.style.setProperty('--la-radius-sm', `${theme.effects.borderRadius}px`);
  root.dataset.theme = theme.id;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme.colors.bg);
}
