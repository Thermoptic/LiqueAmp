import { getDb } from '../services/storage/db';
import { LIQUEAMP_DEFAULT } from '../services/themes/builtin';
import { applyTheme } from '../services/themes/theme';
import { useLibrary } from '../stores/libraryStore';
import { useSettings } from '../stores/settingsStore';
import { useThemes } from '../stores/themeStore';
import { wireSystemListeners } from '../stores/systemStore';

/** Applies the active theme, glow level and motion preference to <html>. */
function syncAppearance() {
  const settings = useSettings.getState();
  applyTheme(useThemes.getState().getTheme(settings.activeThemeId), settings.glowLevel);
  const root = document.documentElement;
  if (settings.motion === 'system') delete root.dataset.motion;
  else root.dataset.motion = settings.motion;
}

async function hydrateAll() {
  await getDb();
  await Promise.all([useSettings.getState().hydrate(), useThemes.getState().hydrate(), useLibrary.getState().hydrate()]);
}

/**
 * Loads persisted state before first render. If storage is slow or blocked,
 * the app renders after a short timeout with defaults instead of hanging.
 */
export async function bootstrap(): Promise<void> {
  applyTheme(LIQUEAMP_DEFAULT);
  wireSystemListeners();
  await Promise.race([hydrateAll(), new Promise((resolve) => setTimeout(resolve, 2000))]);
  syncAppearance();
  useSettings.subscribe(syncAppearance);
  useThemes.subscribe(syncAppearance);
}
