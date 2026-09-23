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
  'primary',
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

export interface LiqueAmpTheme {
  id: string;
  name: string;
  version: number;
  source: ThemeSource;
  colors: ThemeColors;
  effects: ThemeEffects;
  /** Original imported palette (base00…), kept for remapping (THEMING §6). */
  palette?: Record<string, string>;
  createdAt?: string;
  updatedAt?: string;
}
