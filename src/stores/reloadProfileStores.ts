import { useFavorites } from './favoritesStore';
import { useLibrary } from './libraryStore';
import { usePlaylists } from './playlistStore';
import { useSettings } from './settingsStore';
import { useThemes } from './themeStore';

/**
 * Re-reads every store that holds profile data, after the profile was
 * replaced underneath them (a cloud profile was installed). The queue,
 * history and playback are personal and are not touched.
 */
export async function reloadProfileStores(): Promise<void> {
  await Promise.all([useSettings.getState().hydrate(), useThemes.getState().hydrate(), useLibrary.getState().hydrate(), usePlaylists.getState().hydrate(), useFavorites.getState().hydrate()]);
}
