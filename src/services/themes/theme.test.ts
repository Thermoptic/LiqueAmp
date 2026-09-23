import { describe, expect, it } from 'vitest';
import { AMBER_NIGHT, BUILTIN_THEMES, LIQUEAMP_DEFAULT } from './builtin';
import { contrastRatio, normalizeHex } from './color';
import { applyTheme, cssVarName, normalizeTheme, validateTheme } from './theme';
import { THEME_COLOR_KEYS } from '../../types/theme';

describe('color', () => {
  it('normalizes hex forms', () => {
    expect(normalizeHex('#ABC')).toBe('#aabbcc');
    expect(normalizeHex('ff7a3d')).toBe('#ff7a3d');
    expect(normalizeHex(' #FF7A3D ')).toBe('#ff7a3d');
    expect(normalizeHex('#ff7a3')).toBeNull();
    expect(normalizeHex('red')).toBeNull();
    expect(normalizeHex(42)).toBeNull();
  });

  it('computes WCAG contrast', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 0);
    expect(contrastRatio('#777777', '#777777')).toBeCloseTo(1, 5);
  });
});

describe('theme', () => {
  it('maps color keys to --la-* variables', () => {
    expect(cssVarName('bg')).toBe('--la-bg');
    expect(cssVarName('surface2')).toBe('--la-surface-2');
    expect(cssVarName('textSecondary')).toBe('--la-text-secondary');
    expect(cssVarName('visualizerSecondary')).toBe('--la-visualizer-secondary');
  });

  it('built-in themes are complete and have readable primary text', () => {
    for (const theme of BUILTIN_THEMES) {
      const issues = validateTheme(theme);
      expect(issues.filter((i) => i.level === 'error')).toEqual([]);
      expect(contrastRatio(theme.colors.text, theme.colors.bg)).toBeGreaterThanOrEqual(7);
    }
  });

  it('rejects invalid colors and warns on low contrast without rejecting', () => {
    const broken = { ...LIQUEAMP_DEFAULT, colors: { ...LIQUEAMP_DEFAULT.colors, bg: 'nope' } };
    expect(validateTheme(broken).some((i) => i.level === 'error')).toBe(true);

    const lowContrast = { ...LIQUEAMP_DEFAULT, colors: { ...LIQUEAMP_DEFAULT.colors, text: '#15201b' } };
    const issues = validateTheme(lowContrast);
    expect(issues.some((i) => i.level === 'error')).toBe(false);
    expect(issues.some((i) => i.level === 'warning' && i.message.startsWith('Primary text'))).toBe(true);
  });

  it('normalizeTheme fills gaps from the default and clamps effects', () => {
    const partial = normalizeTheme({
      ...AMBER_NIGHT,
      id: 'x',
      source: 'user',
      colors: { ...AMBER_NIGHT.colors, accent: 'garbage' },
      effects: { glowEnabled: true, glowIntensity: 7, borderRadius: -3 },
    });
    expect(partial.colors.accent).toBe(LIQUEAMP_DEFAULT.colors.accent);
    expect(partial.effects.glowIntensity).toBe(1);
    expect(partial.effects.borderRadius).toBe(0);
  });

  it('applyTheme writes every color variable to the root element', () => {
    const root = document.createElement('div');
    applyTheme(AMBER_NIGHT, 1, root);
    for (const key of THEME_COLOR_KEYS) {
      expect(root.style.getPropertyValue(cssVarName(key))).toBe(AMBER_NIGHT.colors[key]);
    }
    expect(root.dataset.theme).toBe('amber-night');
    expect(root.style.getPropertyValue('--la-glow-amount')).toBe('0.7');
  });

  it('glow level 0 disables glow', () => {
    const root = document.createElement('div');
    applyTheme(LIQUEAMP_DEFAULT, 0, root);
    expect(root.style.getPropertyValue('--la-glow-amount')).toBe('0');
  });
});
