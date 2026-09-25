// LIQUEAMP theme format (THEMING §35).

export type ThemeSource = 'builtin' | 'imported' | 'user';

export const THEME_COLOR_KEYS = [
  'bg',
  'surface',
  'surface2',
  'surface3',
  'border',
  'borderSubtle',
  'borderStrong',
  'text',
  'textSecondary',
  'textMuted',
  'textDisabled',
  'heading',
  'strong',
  'primary',
  'onPrimary',
  'secondary',
  'accent',
  'accentBright',
  'success',
  'warning',
  'danger',
  'info',
  'live',
  'visualizer',
  'visualizerSecondary',
  'glow',
  'glowStrong',
  'focus',
  'hover',
  'hoverText',
  'onHover',
  'link',
  'icon',
  'selection',
  'onSelection',
  'tag',
  'toggleOn',
  'onToggleOn',
  'toggleOff',
  'toggleOnText',
  'toggleOffText',
  'onDanger',
] as const;

export type ThemeColorKey = (typeof THEME_COLOR_KEYS)[number];

export type ThemeColors = Record<ThemeColorKey, string>;

export interface ThemeEffects {
  glowEnabled: boolean;
  /** 0..1 */
  glowIntensity: number;
  /** px */
  borderRadius: number;
}

/** The 16 Base16 slots (tinted-theming spec 0.11). */
export const BASE16_KEYS = [
  'base00',
  'base01',
  'base02',
  'base03',
  'base04',
  'base05',
  'base06',
  'base07',
  'base08',
  'base09',
  'base0A',
  'base0B',
  'base0C',
  'base0D',
  'base0E',
  'base0F',
] as const;

export type Base16Key = (typeof BASE16_KEYS)[number];

export type Base16Palette = Record<Base16Key, string>;

/**
 * A LIQUEAMP theme is a Base16 scheme: 16 colors plus effects. The 25
 * semantic colors the UI uses are always derived from the palette with one
 * fixed rule (services/themes/base16.ts) and are never edited on their own.
 */
export interface LiqueAmpTheme {
  id: string;
  name: string;
  /** 2 = Base16 model. Version-1 themes (25 free colors) are migrated on load. */
  version: number;
  source: ThemeSource;
  /** The theme itself. */
  palette: Base16Palette;
  /** Derived from `palette` by deriveColors(); kept on the object for consumers. */
  colors: ThemeColors;
  effects: ThemeEffects;
  author?: string;
  variant?: 'dark' | 'light';
  /** Where the palette came from, e.g. "tinted-theming/schemes (MIT)" or "Base24 import". */
  origin?: string;
  createdAt?: string;
  updatedAt?: string;
}
