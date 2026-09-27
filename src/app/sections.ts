import { Compass, Heart, History, House, ListMusic, Settings, Settings2, type LucideIcon } from 'lucide-react';

export type SectionId = 'now-playing' | 'browse' | 'playlists' | 'favourites' | 'history' | 'settings';

export interface SectionDef {
  id: SectionId;
  label: string;
  path: string;
  icon: LucideIcon;
}

/** Main navigation (SPEC §16, MASTER §12). */
export const SECTIONS: readonly SectionDef[] = [
  { id: 'now-playing', label: 'Now Playing', path: '/', icon: House },
  { id: 'browse', label: 'Browse', path: '/browse', icon: Compass },
  { id: 'playlists', label: 'Playlists', path: '/playlists', icon: ListMusic },
  { id: 'favourites', label: 'Favourites', path: '/favourites', icon: Heart },
  { id: 'history', label: 'History', path: '/history', icon: History },
  { id: 'settings', label: 'Settings', path: '/settings', icon: Settings },
];

/**
 * The Control Panel in the main menu, under Settings. Not a dashboard section:
 * /control is a page of its own (router.tsx), so it is not in SECTIONS (which
 * also drives the dashboard's section logic and the six-slot mobile bar).
 */
export const CONTROL_PANEL_LINK = { id: 'control', label: 'Control Panel', path: '/control', icon: Settings2 } as const;

export function sectionFromPath(pathname: string): SectionId {
  const match = SECTIONS.find((s) => s.path !== '/' && pathname.startsWith(s.path));
  return match?.id ?? 'now-playing';
}

export const LIBRARY_SECTIONS: ReadonlySet<SectionId> = new Set(['playlists', 'favourites', 'history']);
