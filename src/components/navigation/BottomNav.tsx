import { NavLink } from 'react-router';
import { SECTIONS } from '../../app/sections';

const SHORT: Record<string, string> = {
  'now-playing': 'Playing',
  browse: 'Browse',
  playlists: 'Lists',
  favourites: 'Favs',
  history: 'History',
  settings: 'Settings',
};

/** Mobile navigation; hidden on wider layouts via CSS. */
export function BottomNav() {
  return (
    <nav className="bottom-nav" aria-label="Main">
      {SECTIONS.map(({ id, label, path, icon: Icon }) => (
        <NavLink key={id} to={path} end={path === '/'} className="bottom-nav__item" aria-label={label}>
          <Icon size={20} aria-hidden="true" />
          <span>{SHORT[id]}</span>
        </NavLink>
      ))}
    </nav>
  );
}
