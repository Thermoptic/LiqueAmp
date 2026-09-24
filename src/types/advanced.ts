// Advanced configuration managed in /control (VIS §90, PROVIDERS §44).
// Kept out of the user-facing settings UI.
import type { ProviderId } from './media';

export const PROVIDER_IDS: readonly ProviderId[] = ['direct', 'radio', 'youtube', 'youtube-music', 'spotify', 'soundcloud'];

/** Per-provider configuration, separate from provider code (PROVIDERS §44). No secrets are stored. */
export interface ProviderConfig {
  enabled: boolean;
}

export type ProviderConfigs = Record<ProviderId, ProviderConfig>;

export const DEFAULT_PROVIDERS: ProviderConfigs = {
  direct: { enabled: true },
  radio: { enabled: true },
  youtube: { enabled: true },
  'youtube-music': { enabled: true },
  spotify: { enabled: true },
  soundcloud: { enabled: true },
};

export const FFT_SIZES = [512, 1024, 2048, 4096, 8192] as const;
export type FftSize = (typeof FFT_SIZES)[number];

/** AnalyserNode configuration (VIS §9–11). */
export interface AnalysisConfig {
  fftSize: FftSize;
  /** AnalyserNode.smoothingTimeConstant, 0…0.95. */
  smoothing: number;
}

export const DEFAULT_ANALYSIS: AnalysisConfig = { fftSize: 2048, smoothing: 0.7 };

export type FrameLimit = 'auto' | 60 | 30;
export const DPR_CAPS = [1, 1.5, 2, 3] as const;
export type DprCap = (typeof DPR_CAPS)[number];

/** Visualizer engine configuration (VIS §40, §46, §91). */
export interface RenderConfigSettings {
  /** auto = the display's own refresh rate. */
  frameLimit: FrameLimit;
  dprCap: DprCap;
  /** Show measured render diagnostics on the Now Playing visualizer. */
  debug: boolean;
}

export const DEFAULT_RENDER: RenderConfigSettings = { frameLimit: 'auto', dprCap: 2, debug: false };

export function sanitizeProviders(input: unknown): ProviderConfigs {
  const out = { ...DEFAULT_PROVIDERS };
  if (!input || typeof input !== 'object') return out;
  for (const id of PROVIDER_IDS) {
    const cfg = (input as Record<string, unknown>)[id];
    if (cfg && typeof cfg === 'object' && typeof (cfg as ProviderConfig).enabled === 'boolean') out[id] = { enabled: (cfg as ProviderConfig).enabled };
  }
  return out;
}

export function sanitizeAnalysis(input: unknown): AnalysisConfig {
  const i = (input && typeof input === 'object' ? input : {}) as Partial<AnalysisConfig>;
  return {
    fftSize: (FFT_SIZES as readonly number[]).includes(i.fftSize as number) ? (i.fftSize as FftSize) : DEFAULT_ANALYSIS.fftSize,
    smoothing: typeof i.smoothing === 'number' && Number.isFinite(i.smoothing) ? Math.min(0.95, Math.max(0, i.smoothing)) : DEFAULT_ANALYSIS.smoothing,
  };
}

export function sanitizeRender(input: unknown): RenderConfigSettings {
  const i = (input && typeof input === 'object' ? input : {}) as Partial<RenderConfigSettings>;
  return {
    frameLimit: i.frameLimit === 'auto' || i.frameLimit === 60 || i.frameLimit === 30 ? i.frameLimit : DEFAULT_RENDER.frameLimit,
    dprCap: (DPR_CAPS as readonly number[]).includes(i.dprCap as number) ? (i.dprCap as DprCap) : DEFAULT_RENDER.dprCap,
    debug: typeof i.debug === 'boolean' ? i.debug : DEFAULT_RENDER.debug,
  };
}
