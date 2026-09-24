import type { Base16Palette, LiqueAmpTheme, ThemeEffects } from '../../types/theme';
import { deriveColors } from './base16';
import { BASE16_SCHEMES } from './base16Schemes';

function builtin(id: string, name: string, palette: Base16Palette, effects: ThemeEffects, extra: Partial<LiqueAmpTheme> = {}): LiqueAmpTheme {
  return { id, name, version: 2, source: 'builtin', palette, colors: deriveColors(palette), effects, ...extra };
}

// LIQUEAMP's own look as a Base16 scheme, sampled from liqueampui.png:
// green-black background, forest-charcoal surfaces, warm orange/peach accent,
// muted mint secondary. Chosen so the derived colors match the original
// hand-tuned palette closely.
export const LIQUEAMP_DEFAULT: LiqueAmpTheme = builtin(
  'liqueamp-default',
  'LiqueAmp Default',
  {
    base00: '#0b100e',
    base01: '#101815',
    base02: '#1b2923',
    base03: '#3f5749',
    base04: '#c3b9a7',
    base05: '#efe5d5',
    base06: '#f5ede1',
    base07: '#fffaf2',
    base08: '#ff5a4f',
    base09: '#ff7a3d',
    base0A: '#f2b544',
    base0B: '#7fd49a',
    base0C: '#8fcfa9',
    base0D: '#72b9d6',
    base0E: '#d38fbf',
    base0F: '#b0764a',
  },
  { glowEnabled: true, glowIntensity: 0.6, borderRadius: 2 },
  { author: 'LIQUEAMP', variant: 'dark' },
);

export const AMBER_NIGHT: LiqueAmpTheme = builtin(
  'amber-night',
  'Amber Night',
  {
    base00: '#0e0b08',
    base01: '#15110c',
    base02: '#241d14',
    base03: '#5a4630',
    base04: '#cdb993',
    base05: '#f4e3c3',
    base06: '#f8ecd6',
    base07: '#fff6e6',
    base08: '#ff5f3f',
    base09: '#ffb000',
    base0A: '#ffd060',
    base0B: '#b8d46a',
    base0C: '#e0c080',
    base0D: '#d9b36a',
    base0E: '#ff7a1a',
    base0F: '#a0703a',
  },
  { glowEnabled: true, glowIntensity: 0.7, borderRadius: 0 },
  { author: 'LIQUEAMP', variant: 'dark' },
);

/** Popular Base16 schemes, exactly as published by tinted-theming (MIT). */
export const BASE16_BUILTINS: readonly LiqueAmpTheme[] = BASE16_SCHEMES.map((s) =>
  builtin(
    `base16-${s.slug}`,
    s.name,
    s.palette,
    // glow reads as intended on dark backgrounds; on light ones it is kept subtle
    { glowEnabled: true, glowIntensity: s.variant === 'light' ? 0.2 : 0.5, borderRadius: 2 },
    { author: s.author, variant: s.variant, origin: 'tinted-theming/schemes (MIT)' },
  ),
);

export const BUILTIN_THEMES: readonly LiqueAmpTheme[] = [LIQUEAMP_DEFAULT, AMBER_NIGHT, ...BASE16_BUILTINS];

export interface ThemeGroup {
  label: string;
  themes: LiqueAmpTheme[];
}

/** Themes grouped for pickers: LIQUEAMP's own, Base16 dark, Base16 light, the user's. */
export function groupThemes(themes: readonly LiqueAmpTheme[]): ThemeGroup[] {
  const base16 = (t: LiqueAmpTheme) => t.source === 'builtin' && t.id.startsWith('base16-');
  const groups: ThemeGroup[] = [
    { label: 'LiqueAmp', themes: themes.filter((t) => t.source === 'builtin' && !base16(t)) },
    { label: 'Base16 · dark', themes: themes.filter((t) => base16(t) && t.variant !== 'light') },
    { label: 'Base16 · light', themes: themes.filter((t) => base16(t) && t.variant === 'light') },
    { label: 'Your themes', themes: themes.filter((t) => t.source !== 'builtin') },
  ];
  return groups.filter((g) => g.themes.length > 0);
}
