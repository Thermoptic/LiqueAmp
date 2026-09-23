import { create } from 'zustand';
import { kv } from '../services/storage/repository';
import { DEFAULT_SETTINGS, EQ_LIMIT_DB, type EqSettings, type Settings } from '../types/settings';

const KEY = 'settings';

interface SettingsStore extends Settings {
  hydrated: boolean;
  hydrate(): Promise<void>;
  update(patch: Partial<Settings>): void;
}

function pickSettings(s: Settings): Settings {
  const out = {} as Record<keyof Settings, unknown>;
  for (const key of Object.keys(DEFAULT_SETTINGS) as Array<keyof Settings>) out[key] = s[key];
  return out as unknown as Settings;
}

export const useSettings = create<SettingsStore>((set, get) => ({
  ...DEFAULT_SETTINGS,
  hydrated: false,

  async hydrate() {
    const stored = await kv.get<Partial<Settings>>(KEY);
    set({ ...DEFAULT_SETTINGS, ...sanitize(stored), hydrated: true });
  },

  update(patch) {
    set(patch);
    // UI updates immediately; persistence happens in the background (THEMING §81).
    void kv.set(KEY, pickSettings(get()));
  },
}));

function sanitize(input: Partial<Settings> | undefined): Partial<Settings> {
  if (!input || typeof input !== 'object') return {};
  const out: Partial<Settings> = {};
  if (typeof input.activeThemeId === 'string') out.activeThemeId = input.activeThemeId;
  if (input.motion === 'system' || input.motion === 'reduced' || input.motion === 'full') out.motion = input.motion;
  if (typeof input.glowLevel === 'number') out.glowLevel = Math.min(1.5, Math.max(0, input.glowLevel || 0));
  if (typeof input.volume === 'number') out.volume = clamp01(input.volume);
  if (typeof input.muted === 'boolean') out.muted = input.muted;
  if (typeof input.shuffle === 'boolean') out.shuffle = input.shuffle;
  if (input.repeat === 'off' || input.repeat === 'all' || input.repeat === 'one') out.repeat = input.repeat;
  if (input.eq && typeof input.eq === 'object') out.eq = sanitizeEq(input.eq);
  return out;
}

function sanitizeEq(eq: Partial<EqSettings>): EqSettings {
  const db = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(-EQ_LIMIT_DB, Math.min(EQ_LIMIT_DB, Math.round(v))) : 0);
  return {
    enabled: typeof eq.enabled === 'boolean' ? eq.enabled : true,
    preset: typeof eq.preset === 'string' ? eq.preset : 'custom',
    bass: db(eq.bass),
    mid: db(eq.mid),
    treble: db(eq.treble),
  };
}

function clamp01(v: number) {
  return Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0;
}
