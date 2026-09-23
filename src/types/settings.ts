export type MotionPreference = 'system' | 'reduced' | 'full';

export type RepeatMode = 'off' | 'all' | 'one';

/** Persistent user settings (ARCH §24). Ephemeral UI state lives elsewhere. */
export interface Settings {
  activeThemeId: string;
  motion: MotionPreference;
  /** Multiplier on the theme's own glow intensity: 0 = off, 1 = theme default, 1.5 = high. */
  glowLevel: number;
  volume: number;
  muted: boolean;
  shuffle: boolean;
  repeat: RepeatMode;
}

export const DEFAULT_SETTINGS: Settings = {
  activeThemeId: 'liqueamp-default',
  motion: 'system',
  glowLevel: 1,
  volume: 0.8,
  muted: false,
  shuffle: false,
  repeat: 'off',
};
