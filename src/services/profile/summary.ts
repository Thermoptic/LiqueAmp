// A lightweight summary of a profile (docs/LIQUEAMP_FRIEND_LIQUES_SPEC.md
// §12, §30): what a Friend Lique preview shows without the full profile.
// Derived from the profile, never stored in it; pure.
import { BUILTIN_THEMES } from '../themes/builtin';
import type { LiqueAmpProfile } from './profile';

export interface ProfileSummary {
  username: string;
  revision: number;
  updatedAt: string;
  theme: { id: string; name: string; builtIn: boolean };
  visualizer: { type: string; enabled: boolean };
  counts: { playlists: number; categories: number; streams: number; stations: number };
}

export function summarizeProfile(profile: LiqueAmpProfile, username: string): ProfileSummary {
  const { settings, themes, playlists, categories, media, stations } = profile.data;
  const themeId = settings.activeThemeId;
  const builtIn = BUILTIN_THEMES.find((t) => t.id === themeId);
  const own = themes.find((t) => t.id === themeId);
  return {
    username,
    revision: profile.meta.revision,
    updatedAt: profile.meta.updatedAt,
    theme: { id: themeId, name: builtIn?.name ?? own?.name ?? themeId, builtIn: Boolean(builtIn) },
    visualizer: { type: settings.visualizer.type, enabled: settings.visualizer.enabled },
    counts: {
      playlists: playlists.length,
      categories: categories.length,
      // library items (streams, tracks, provider links) and saved radio stations
      streams: media.length,
      stations: stations.length,
    },
  };
}
