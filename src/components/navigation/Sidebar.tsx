import { useMemo, useState } from 'react';
import { NavLink } from 'react-router';
import { Folder, Plus } from 'lucide-react';
import { SECTIONS } from '../../app/sections';
import { countByCategory, useLibrary } from '../../stores/libraryStore';
import { LogoMark } from '../ui/Logo';
import { EmptyState } from '../ui/controls';
import { CategoryDialog } from '../library/CategoryDialog';

export function Sidebar() {
  return (
    <aside className="sidebar area-side">
      <nav className="panel sidebar__nav" aria-label="Main">
        <ul className="nav-list">
          {SECTIONS.map(({ id, label, path, icon: Icon }) => (
            <li key={id}>
              <NavLink to={path} end={path === '/'} className="nav-item">
                <Icon size={18} aria-hidden="true" />
                <span>{label}</span>
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
      <LibraryCategories />
    </aside>
  );
}

export function LibraryCategories() {
  const categories = useLibrary((s) => s.categories);
  const media = useLibrary((s) => s.media);
  const counts = useMemo(() => countByCategory(media), [media]);
  const [adding, setAdding] = useState(false);
  const visible = categories.filter((c) => c.enabled);

  return (
    <section className="panel sidebar__library" aria-labelledby="library-heading">
      <header className="panel__header">
        <h2 className="panel__title panel__title--small" id="library-heading">
          Library
        </h2>
        <div className="panel__actions">
          <button type="button" className="btn btn--icon" aria-label="Add category" onClick={() => setAdding(true)}>
            <Plus size={14} />
          </button>
        </div>
      </header>
      <div className="panel__body panel__body--flush">
        {visible.length === 0 ? (
          <EmptyState title="NO CATEGORIES">Press + to create your first category.</EmptyState>
        ) : (
          <ul className="category-list">
            {visible.map((c) => (
              <li key={c.id} className="category-item">
                <Folder size={14} aria-hidden="true" />
                <span className="truncate">{c.name}</span>
                <span className="category-item__count" aria-label={`${counts.get(c.id) ?? 0} items`}>
                  {counts.get(c.id) ?? 0}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
      <footer className="sidebar__motto">
        <p>
          // GOOD SOUNDS
          <br />
          // FOR A
          <br />
          // BRIGHTER NOW.
        </p>
        <LogoMark />
      </footer>
      <CategoryDialog open={adding} onClose={() => setAdding(false)} />
    </section>
  );
}
