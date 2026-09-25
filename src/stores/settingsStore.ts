import { create } from 'zustand';
import { kv, profileKvFor } from '../services/storage/repository';
import { getActiveScope, isActiveScope, isReadOnlyScope, MY_LIQUE, ProfileScopeError, READ_ONLY_SCOPE_MESSAGE, type ProfileScope } from '../services/storage/scope';
import { notifyReadOnly } from '../services/friends/readOnlyNotice';
import { sanitizeVisualizer } from '../types/visualizer';
import { sanitizeAnalysis, sanitizeProviders, sanitizeRender } from '../types/advanced';
import {
  DEFAULT_SETTINGS,
  DEVICE_SETTING_KEYS,
  EQ_LIMIT_DB,
  PROFILE_SETTING_KEYS,
  pickDeviceSettings,
  pickProfileSettings,
  type EqSettings,
  type ProfileSettings,
  type Settings,
} from '../types/settings';

/**
 * Storage (docs/LIQUEAMP_PROFILE_SPEC.md §7):
 * - device settings: kv `settings` (the record every earlier version used)
 * - profile settings: kv `profile.settings`, in the active profile scope
 *
 * Before the split, `settings` held everything. On first start after the
 * split, the profile fields are copied from it into `profile.settings`. The
 * old record is never deleted or emptied: its profile fields are kept as
 * they were (only its device fields are updated from then on), so nothing a
 * user had is lost, and an older app version can still read it.
 */
const DEVICE_KEY = 'settings';
const PROFILE_KEY = 'settings';

/** Profile fields found in the old single record, kept untouched when device settings are written. */
let legacyProfileFields: Partial<ProfileSettings> = {};

interface SettingsStore extends Settings {
  hydrated: boolean;
  /** The profile scope the profile settings were loaded from; profile-setting writes go there only. */
  profileScope: ProfileScope;
  hydrate(): Promise<void>;
  update(patch: Partial<Settings>): void;
}

/** Only the persisted settings fields (no store methods / flags). */
export function pickSettings(s: Settings): Settings {
  const out = {} as Record<keyof Settings, unknown>;
  for (const key of Object.keys(DEFAULT_SETTINGS) as Array<keyof Settings>) out[key] = s[key];
  return out as unknown as Settings;
}

const touches = (patch: Partial<Settings>, keys: readonly (keyof Settings)[]) => keys.some((k) => k in patch);

/**
 * Reads the device record (always this device's) and the profile record of
 * `scope`. In the own profile, the first time, the profile fields are
 * migrated out of the old single record. Idempotent: once `profile.settings`
 * exists, it is the only source of profile settings and nothing is migrated
 * again. A friend's profile is never migrated into or written to.
 */
export async function loadSettings(scope: ProfileScope = MY_LIQUE): Promise<Partial<Settings>> {
  const device = await kv.get<Partial<Settings>>(DEVICE_KEY);
  let profile = await profileKvFor(scope).get<Partial<Settings>>(PROFILE_KEY);
  legacyProfileFields = device && typeof device === 'object' ? pickProfileSettings(device) : {};
  if (!isReadOnlyScope(scope) && profile === undefined && Object.keys(legacyProfileFields).length > 0) {
    profile = sanitizeSettings(legacyProfileFields);
    await profileKvFor(scope).set(PROFILE_KEY, pickProfileSettings(profile));
  }
  return {
    ...pickDeviceSettings(sanitizeSettings(device)),
    ...pickProfileSettings(sanitizeSettings(profile)),
  };
}

/** Writes the device record, keeping any profile fields the old single record still holds. */
function saveDevice(s: Settings): Promise<void> {
  return kv.set(DEVICE_KEY, { ...legacyProfileFields, ...pickDeviceSettings(s) });
}

function saveProfile(scope: ProfileScope, s: Settings): Promise<void> {
  // rejects with ProfileScopeError for a friend's (read-only) profile
  return profileKvFor(scope).set(PROFILE_KEY, pickProfileSettings(s));
}

export const useSettings = create<SettingsStore>((set, get) => ({
  ...DEFAULT_SETTINGS,
  hydrated: false,
  profileScope: MY_LIQUE,

  async hydrate() {
    const scope = getActiveScope();
    const loaded = await loadSettings(scope);
    if (!isActiveScope(scope)) return; // the profile changed meanwhile; its own hydrate wins
    set({ ...DEFAULT_SETTINGS, ...loaded, hydrated: true, profileScope: scope });
  },

  update(patch) {
    const refused = isReadOnlyScope(get().profileScope) && touches(patch, PROFILE_SETTING_KEYS);
    // A Friend Lique is read-only: its profile fields (theme, visualizer, EQ, …) do not change,
    // not even on screen; device fields (volume, shuffle, …) are the viewer's and still do.
    set(refused ? pickDeviceSettings(patch as Settings) : patch);
    // UI updates immediately; persistence happens in the background (THEMING §81).
    // Each half is written only when it changed, to its own record.
    const s = pickSettings(get());
    if (touches(patch, DEVICE_SETTING_KEYS)) void saveDevice(s);
    if (refused) {
      // never redirected to the own profile; reported, not silently dropped
      console.error('Profile settings were not saved:', new ProfileScopeError(READ_ONLY_SCOPE_MESSAGE));
      notifyReadOnly();
    } else if (touches(patch, PROFILE_SETTING_KEYS)) {
      saveProfile(get().profileScope, s).catch((err: unknown) => console.error('Profile settings were not saved:', err));
    }
  },
}));

/** Validates stored or imported settings; unknown/invalid fields are dropped. */
export function sanitizeSettings(input: Partial<Settings> | undefined): Partial<Settings> {
  if (!input || typeof input !== 'object') return {};
  const out: Partial<Settings> = {};
  if (typeof input.activeThemeId === 'string') out.activeThemeId = input.activeThemeId;
  if (input.motion === 'system' || input.motion === 'reduced' || input.motion === 'full') out.motion = input.motion;
  if (typeof input.glowLevel === 'number') out.glowLevel = Math.min(1.5, Math.max(0, input.glowLevel || 0));
  if (typeof input.volume === 'number') out.volume = clamp01(input.volume);
  if (typeof input.muted === 'boolean') out.muted = input.muted;
  if (typeof input.shuffle === 'boolean') out.shuffle = input.shuffle;
  if (typeof input.shortcuts === 'boolean') out.shortcuts = input.shortcuts;
  if (typeof input.artwork === 'boolean') out.artwork = input.artwork;
  if ('providers' in input) out.providers = sanitizeProviders(input.providers);
  if ('analysis' in input) out.analysis = sanitizeAnalysis(input.analysis);
  if ('render' in input) out.render = sanitizeRender(input.render);
  if (input.repeat === 'off' || input.repeat === 'all' || input.repeat === 'one') out.repeat = input.repeat;
  if (input.eq && typeof input.eq === 'object') out.eq = sanitizeEq(input.eq);
  if (input.visualizer && typeof input.visualizer === 'object') out.visualizer = sanitizeVisualizer(input.visualizer);
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
