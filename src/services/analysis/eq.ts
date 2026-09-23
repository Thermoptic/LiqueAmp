import type { EqSettings } from '../../types/settings';

export interface EqPreset {
  id: string;
  label: string;
  bass: number;
  mid: number;
  treble: number;
}

/** Three-band presets (dB). Plain starting points, not claims about genres. */
export const EQ_PRESETS: readonly EqPreset[] = [
  { id: 'flat', label: 'Flat', bass: 0, mid: 0, treble: 0 },
  { id: 'bass', label: 'Bass boost', bass: 6, mid: 0, treble: 0 },
  { id: 'warm', label: 'Warm', bass: 3, mid: 1, treble: -2 },
  { id: 'vocal', label: 'Vocal', bass: -2, mid: 4, treble: 1 },
  { id: 'bright', label: 'Bright', bass: -1, mid: 0, treble: 5 },
  { id: 'loudness', label: 'Loudness', bass: 5, mid: -1, treble: 4 },
];

export function applyPreset(eq: EqSettings, presetId: string): EqSettings {
  const p = EQ_PRESETS.find((x) => x.id === presetId);
  return p ? { ...eq, preset: p.id, bass: p.bass, mid: p.mid, treble: p.treble } : eq;
}

/** Changing a band becomes 'custom' unless the new values still match a preset. */
export function setBand(eq: EqSettings, band: 'bass' | 'mid' | 'treble', value: number): EqSettings {
  const next = { ...eq, [band]: value };
  const match = EQ_PRESETS.find((p) => p.bass === next.bass && p.mid === next.mid && p.treble === next.treble);
  return { ...next, preset: match?.id ?? 'custom' };
}

/** Gains actually applied: all zero when the EQ is switched off. */
export function effectiveGains(eq: EqSettings): { bass: number; mid: number; treble: number } {
  return eq.enabled ? { bass: eq.bass, mid: eq.mid, treble: eq.treble } : { bass: 0, mid: 0, treble: 0 };
}
