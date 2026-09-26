import { readFavorites, useFavorites } from './favoritesStore';
import { readLibrary, useLibrary } from './libraryStore';
import { readPlaylists, usePlaylists } from './playlistStore';
import { loadSettings, useSettings } from './settingsStore';
import { readThemes, useThemes } from './themeStore';
import { getActiveScope, isActiveScope, type ProfileScope } from '../services/storage/scope';
import { DEFAULT_SETTINGS } from '../types/settings';

/** Everything the profile stores show for one profile scope, read but not yet shown. */
export interface ProfileState {
  settings: Awaited<ReturnType<typeof loadSettings>>;
  themes: Awaited<ReturnType<typeof readThemes>>;
  library: Awaited<ReturnType<typeof readLibrary>>;
  playlists: Awaited<ReturnType<typeof readPlaylists>>;
  favorites: Awaited<ReturnType<typeof readFavorites>>;
}

/** Reads every profile store's data for `scope`. Changes nothing; rejects if any part cannot be read. */
export async function loadProfileState(scope: ProfileScope): Promise<ProfileState> {
  const [settings, themes, library, playlists, favorites] = await Promise.all([loadSettings(scope), readThemes(scope), readLibrary(scope), readPlaylists(scope), readFavorites(scope)]);
  return { settings, themes, library, playlists, favorites };
}

/**
 * Shows a loaded profile in every profile store at once — synchronously, so
 * no render ever mixes two profiles (the previous theme with the new
 * playlists, …).
 */
export function applyProfileState(scope: ProfileScope, state: ProfileState): void {
  useSettings.setState({ ...DEFAULT_SETTINGS, ...state.settings, hydrated: true, profileScope: scope });
  useThemes.setState({ scope, themes: state.themes });
  useLibrary.setState({ scope, ...state.library });
  usePlaylists.setState({ scope, playlists: state.playlists });
  useFavorites.setState({ scope, ...state.favorites });
}

/**
 * Re-reads every store that holds profile data for the active scope (after
 * the profile was replaced underneath them, e.g. a cloud profile was
 * installed). All or nothing: if any part cannot be read, the stores keep
 * what they show and this rejects. The queue, history and playback are
 * personal and are not touched.
 */
export async function reloadProfileStores(): Promise<void> {
  const scope = getActiveScope();
  const state = await loadProfileState(scope);
  if (isActiveScope(scope)) applyProfileState(scope, state); // else: a newer switch owns the stores
}
