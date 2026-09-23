import { Compass, Heart, History, House, ListMusic, Settings, type LucideIcon } from 'lucide-react';

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

export function sectionFromPath(pathname: string): SectionId {
  const match = SECTIONS.find((s) => s.path !== '/' && pathname.startsWith(s.path));
  return match?.id ?? 'now-playing';
}

export const LIBRARY_SECTIONS: ReadonlySet<SectionId> = new Set(['playlists', 'favourites', 'history']);
