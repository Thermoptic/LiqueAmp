// Visualizer settings (VIS §29, §51, §61). Kept separate from player state:
// nothing here knows about the current track, queue or volume.

export const VISUALIZER_IDS = ['spectrum-bars', 'waveform', 'terminal-spectrum', 'minimal-meter', 'oscilloscope'] as const;
export type VisualizerId = (typeof VISUALIZER_IDS)[number];

export const COLOR_MODES = ['theme', 'accent', 'dual', 'mono'] as const;
export type VisualizerColorMode = (typeof COLOR_MODES)[number];

export type FrequencyScale = 'log' | 'linear';

export interface VisualizerSettings {
  enabled: boolean;
  type: VisualizerId;
  /** Visual strength of the drawing, 0…1 (opacity) — never changes the data. */
  intensity: number;
  /** How strongly the visualizer reacts, 0…1 (display gain / floor). */
  sensitivity: number;
  /** Temporal release, 0 = sharp … 1 = soft. */
  smoothing: number;
  colorMode: VisualizerColorMode;
  glow: boolean;
  mirror: boolean;
  scale: FrequencyScale;
  peakHold: boolean;
}

/** VIS §99: Spectrum Bars, theme colors, moderate smoothing/sensitivity, subtle glow. */
export const DEFAULT_VISUALIZER: VisualizerSettings = {
  enabled: true,
  type: 'spectrum-bars',
  intensity: 0.85,
  sensitivity: 0.5,
  smoothing: 0.5,
  colorMode: 'theme',
  glow: true,
  mirror: true,
  scale: 'log',
  peakHold: true,
};

export function sanitizeVisualizer(input: Partial<VisualizerSettings>): VisualizerSettings {
  const d = DEFAULT_VISUALIZER;
  const unit = (v: unknown, fallback: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : fallback);
  const bool = (v: unknown, fallback: boolean) => (typeof v === 'boolean' ? v : fallback);
  return {
    enabled: bool(input.enabled, d.enabled),
    type: (VISUALIZER_IDS as readonly string[]).includes(input.type as string) ? (input.type as VisualizerId) : d.type,
    intensity: unit(input.intensity, d.intensity),
    sensitivity: unit(input.sensitivity, d.sensitivity),
    smoothing: unit(input.smoothing, d.smoothing),
    colorMode: (COLOR_MODES as readonly string[]).includes(input.colorMode as string) ? (input.colorMode as VisualizerColorMode) : d.colorMode,
    glow: bool(input.glow, d.glow),
    mirror: bool(input.mirror, d.mirror),
    scale: input.scale === 'linear' || input.scale === 'log' ? input.scale : d.scale,
    peakHold: bool(input.peakHold, d.peakHold),
  };
}
