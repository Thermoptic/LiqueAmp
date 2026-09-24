import { DEFAULT_VISUALIZER, type VisualizerSettings } from './visualizer';
import { DEFAULT_ANALYSIS, DEFAULT_PROVIDERS, DEFAULT_RENDER, type AnalysisConfig, type ProviderConfigs, type RenderConfigSettings } from './advanced';

export type MotionPreference = 'system' | 'reduced' | 'full';

export type RepeatMode = 'off' | 'all' | 'one';

/** Three-band EQ in dB (−12…+12). Applied only where the browser may process the audio. */
export interface EqSettings {
  enabled: boolean;
  /** Preset id, or 'custom' after manual changes. */
  preset: string;
  bass: number;
  mid: number;
  treble: number;
}

export const EQ_LIMIT_DB = 12;

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
  eq: EqSettings;
  visualizer: VisualizerSettings;
  /** Global single-key shortcuts; can be turned off (WCAG 2.1.4). */
  shortcuts: boolean;
  // advanced — managed in /control
  providers: ProviderConfigs;
  analysis: AnalysisConfig;
  render: RenderConfigSettings;
}

export const DEFAULT_SETTINGS: Settings = {
  activeThemeId: 'liqueamp-default',
  motion: 'system',
  glowLevel: 1,
  volume: 0.8,
  muted: false,
  shuffle: false,
  repeat: 'off',
  eq: { enabled: true, preset: 'flat', bass: 0, mid: 0, treble: 0 },
  visualizer: DEFAULT_VISUALIZER,
  shortcuts: true,
  providers: DEFAULT_PROVIDERS,
  analysis: DEFAULT_ANALYSIS,
  render: DEFAULT_RENDER,
};
