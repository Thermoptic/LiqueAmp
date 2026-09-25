// The Friend Lique preview (docs/LIQUEAMP_FRIEND_LIQUES_SPEC.md §12, §30):
// what a friend's Lique contains, without its content. The source is the
// lightweight `summary` their app stored next to the profile (summarizeProfile);
// if that is missing or unusable, the full profile is parsed and validated
// and summarized here. Remote data is untrusted: only well-formed numbers
// and short strings get through, and nothing personal (history, queue,
// device settings) is part of either source.
import { BUILTIN_THEMES } from '../themes/builtin';
import { parseProfile } from '../profile/profile';
import { visualizerRegistry } from '../visualizers/registry';
import type { VisualizerId } from '../../types/visualizer';

export interface FriendLiqueSummary {
  /** The cloud revision the preview describes. */
  revision: number;
  updatedAt: string;
  theme: { name: string; builtIn: boolean };
  visualizer: { name: string; enabled: boolean };
  counts: { playlists: number; categories: number; streams: number; stations: number };
}

const MAX_TEXT = 80;
const text = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim().slice(0, MAX_TEXT) : null);
const count = (v: unknown): number | null => (typeof v === 'number' && Number.isInteger(v) && v >= 0 && v < 1e7 ? v : null);
const obj = (v: unknown): Record<string, unknown> | null => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null);

/** A theme id → the name LiqueAmp knows for it; built-in names come from this app, not from the friend. */
function themeName(id: string | null, name: string | null): { name: string; builtIn: boolean } | null {
  const builtIn = id ? BUILTIN_THEMES.find((t) => t.id === id) : undefined;
  if (builtIn) return { name: builtIn.name, builtIn: true };
  const own = name ?? id;
  return own ? { name: own, builtIn: false } : null;
}

function visualizerName(type: string | null): string | null {
  if (!type) return null;
  return visualizerRegistry.get(type as VisualizerId)?.name ?? type;
}

/** Validates a stored summary (see ProfileSummary). Null when anything needed is missing or malformed. */
export function readStoredSummary(raw: unknown, head: { revision: number; updatedAt: string }): FriendLiqueSummary | null {
  const s = obj(raw);
  const theme = obj(s?.theme);
  const visualizer = obj(s?.visualizer);
  const counts = obj(s?.counts);
  if (!s || !theme || !visualizer || !counts) return null;
  const t = themeName(text(theme.id), text(theme.name));
  const v = visualizerName(text(visualizer.type));
  const c = { playlists: count(counts.playlists), categories: count(counts.categories), streams: count(counts.streams), stations: count(counts.stations) };
  if (!t || !v || typeof visualizer.enabled !== 'boolean' || Object.values(c).some((n) => n === null)) return null;
  return { ...head, theme: t, visualizer: { name: v, enabled: visualizer.enabled }, counts: c as FriendLiqueSummary['counts'] };
}

/** Summarizes a full profile after the regular profile validation (parseProfile). Null when it does not validate. */
export function summarizeProfileText(textValue: string, head: { revision: number; updatedAt: string }): FriendLiqueSummary | null {
  const parsed = parseProfile(textValue);
  if (!parsed.ok) return null;
  const { settings, themes, playlists, categories, media, stations } = parsed.profile.content;
  const themeId = settings?.activeThemeId ?? null;
  return readStoredSummary(
    {
      theme: { id: themeId, name: themes.items.find((t) => t.id === themeId)?.name ?? null },
      visualizer: { type: settings?.visualizer?.type ?? null, enabled: settings?.visualizer?.enabled ?? null },
      // valid records only, as they would be imported
      counts: { playlists: playlists.items.length, categories: categories.items.length, streams: media.items.length, stations: stations.items.length },
    },
    head,
  );
}
