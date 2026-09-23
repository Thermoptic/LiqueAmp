import { THEME_COLOR_KEYS, type LiqueAmpTheme, type ThemeColorKey } from '../../types/theme';
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
 * Validates a theme candidate. Errors block saving; warnings (e.g. low
 * contrast) are informational and never reject an artistic theme (THEMING §21).
 */
export function validateTheme(theme: LiqueAmpTheme): ThemeIssue[] {
  const issues: ThemeIssue[] = [];
  if (!theme.id.trim()) issues.push({ level: 'error', message: 'Theme has no id.' });
  if (!theme.name.trim()) issues.push({ level: 'error', message: 'Theme has no name.' });
  for (const key of THEME_COLOR_KEYS) {
    if (!normalizeHex(theme.colors[key])) {
      issues.push({ level: 'error', message: `Color "${key}" is not a valid hex color.` });
    }
  }
  if (issues.some((i) => i.level === 'error')) return issues;

  const pairs: Array<[ThemeColorKey, ThemeColorKey, string]> = [
    ['text', 'bg', 'Primary text'],
    ['text', 'surface', 'Primary text on panels'],
    ['textMuted', 'surface', 'Muted text on panels'],
    ['primary', 'bg', 'Primary accent'],
    ['focus', 'surface', 'Focus outline'],
  ];
  for (const [fg, bg, label] of pairs) {
    const ratio = contrastRatio(theme.colors[fg], theme.colors[bg]);
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

/** Fills missing/invalid colors from the default theme and clamps effects. */
export function normalizeTheme(input: LiqueAmpTheme): LiqueAmpTheme {
  const colors = { ...LIQUEAMP_DEFAULT.colors };
  for (const key of THEME_COLOR_KEYS) {
    const v = normalizeHex(input.colors?.[key]);
    if (v) colors[key] = v;
  }
  const fx = input.effects ?? LIQUEAMP_DEFAULT.effects;
  return {
    ...input,
    colors,
    effects: {
      glowEnabled: Boolean(fx.glowEnabled),
      glowIntensity: clamp(Number(fx.glowIntensity) || 0, 0, 1),
      borderRadius: clamp(Number(fx.borderRadius) || 0, 0, 8),
    },
  };
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
