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
  /**
   * Now Playing box: show the item's artwork / the provider player (true), or
   * always the LIQUEAMP default image (false). Provider players then dock in
   * the corner, because they must stay visible to play.
   */
  artwork: boolean;
  // advanced — managed in /control
  providers: ProviderConfigs;
  analysis: AnalysisConfig;
  render: RenderConfigSettings;
}

/**
 * Settings that travel with a LiqueAmp profile: how this LiqueAmp looks and
 * sounds. A Friend Lique brings these along (docs/LIQUEAMP_PROFILE_SPEC.md §7).
 */
export const PROFILE_SETTING_KEYS = ['activeThemeId', 'glowLevel', 'visualizer', 'eq', 'artwork'] as const;

/**
 * Settings that stay with the device and the viewer's own session: output
 * level, accessibility, performance, provider switches, and the shuffle/repeat
 * modes of the personal queue (they only steer Next/Previous in the queue).
 */
export const DEVICE_SETTING_KEYS = ['volume', 'muted', 'shuffle', 'repeat', 'motion', 'shortcuts', 'providers', 'analysis', 'render'] as const;

export type ProfileSettingKey = (typeof PROFILE_SETTING_KEYS)[number];
export type DeviceSettingKey = (typeof DEVICE_SETTING_KEYS)[number];
export type ProfileSettings = Pick<Settings, ProfileSettingKey>;
export type DeviceSettings = Pick<Settings, DeviceSettingKey>;

// Compile-time check: the two lists cover every setting, and no setting is in both.
type Missing = Exclude<keyof Settings, ProfileSettingKey | DeviceSettingKey>;
type Overlap = ProfileSettingKey & DeviceSettingKey;
const _settingsSplitIsComplete: [Missing, Overlap] extends [never, never] ? true : never = true;
void _settingsSplitIsComplete;

function pick<K extends keyof Settings>(s: Partial<Settings>, keys: readonly K[]): Partial<Pick<Settings, K>> {
  const out: Partial<Pick<Settings, K>> = {};
  for (const key of keys) if (key in s && s[key] !== undefined) out[key] = s[key];
  return out;
}

/** The fields of (possibly partial) settings that travel with a profile. */
export function pickProfileSettings(s: Settings): ProfileSettings;
export function pickProfileSettings(s: Partial<Settings>): Partial<ProfileSettings>;
export function pickProfileSettings(s: Partial<Settings>): Partial<ProfileSettings> {
  return pick(s, PROFILE_SETTING_KEYS);
}

/** The fields of (possibly partial) settings that stay with the device. */
export function pickDeviceSettings(s: Settings): DeviceSettings;
export function pickDeviceSettings(s: Partial<Settings>): Partial<DeviceSettings>;
export function pickDeviceSettings(s: Partial<Settings>): Partial<DeviceSettings> {
  return pick(s, DEVICE_SETTING_KEYS);
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
  artwork: true,
  providers: DEFAULT_PROVIDERS,
  analysis: DEFAULT_ANALYSIS,
  render: DEFAULT_RENDER,
};
