import type { AnalysisFrame } from '../analysis/analysis';
import type { FrequencyScale, VisualizerId } from '../../types/visualizer';

/** Visualizers only ever receive real analysis frames (VIS §6, §103). */
export type VisualizerFrame = AnalysisFrame;

/** Colors resolved from the active theme's CSS variables (VIS §36). */
export interface Palette {
  primary: string;
  secondary: string;
  /** Unlit cells, baselines, centerlines. */
  dim: string;
  /** Labels. */
  text: string;
  glow: string;
  /** Color across frequency (dual mode) instead of across height. */
  acrossFrequency: boolean;
}

/** Everything a visualizer needs besides the frame; built by the renderer. */
export interface RenderConfig {
  /** Floor for dB-scaled spectrum values: lower = more sensitive. */
  spectrumFloor: number;
  /** Gain for time-domain amplitude. */
  amplitudeGain: number;
  /** Release factor per 60 Hz frame, 0 = instant … 0.95 = very soft. */
  release: number;
  alpha: number;
  mirror: boolean;
  scale: FrequencyScale;
  peakHold: boolean;
  /** Glow blur in CSS px; 0 = off. */
  glow: number;
  palette: Palette;
}

/** Which settings a visualizer uses — the UI shows only these (VIS §29). */
export interface VisualizerCapabilities {
  smoothing: boolean;
  mirror: boolean;
  scale: boolean;
  peakHold: boolean;
  glow: boolean;
}

/**
 * Common visualizer interface (VIS §5). Each instance owns its own buffers;
 * the renderer owns the canvas, loop and sizing.
 */
export interface Visualizer {
  readonly id: VisualizerId;
  readonly name: string;
  readonly capabilities: VisualizerCapabilities;
  initialize(ctx: CanvasRenderingContext2D): void;
  /** CSS pixel size; the context is already scaled by dpr. */
  resize(width: number, height: number, dpr: number): void;
  render(frame: VisualizerFrame, config: RenderConfig): void;
  destroy(): void;
}

export interface VisualizerDefinition {
  id: VisualizerId;
  name: string;
  description: string;
  capabilities: VisualizerCapabilities;
  create(): Visualizer;
}
