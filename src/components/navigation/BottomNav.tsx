import { NavLink } from 'react-router';
import { SECTIONS } from '../../app/sections';
import { useSyncAttention } from '../../stores/accountStore';

const SHORT: Record<string, string> = {
  'now-playing': 'Playing',
  browse: 'Browse',
  playlists: 'Lists',
  favourites: 'Favs',
  retro: 'Retro',
  settings: 'Settings',
};

/** Mobile navigation; hidden on wider layouts via CSS. */
export function BottomNav() {
  // phones show the status bar only in Settings: the marker says when sync needs the user
  const attention = useSyncAttention();
  return (
    <nav className="bottom-nav" aria-label="Main">
      {SECTIONS.map(({ id, label, path, icon: Icon }) => {
        const marked = id === 'settings' && attention;
        return (
          <NavLink key={id} to={path} end={path === '/'} className="bottom-nav__item" aria-label={marked ? `${label}, sync needs you` : label}>
            <span className="bottom-nav__icon">
              <Icon size={20} aria-hidden="true" />
              {marked && <span className="sync-marker" aria-hidden="true" />}
            </span>
            <span>{SHORT[id]}</span>
          </NavLink>
        );
      })}
    </nav>
  );
}
