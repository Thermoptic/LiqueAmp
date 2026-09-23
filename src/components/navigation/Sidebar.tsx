import { useMemo, useState } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router';
import { Download, Folder, Library, Plus } from 'lucide-react';
import { LIBRARY_SECTIONS, SECTIONS, sectionFromPath } from '../../app/sections';
import { useUi } from '../../stores/uiStore';
import { ImportDialog } from '../import/ImportDialog';
import { countByCategory, useLibrary } from '../../stores/libraryStore';
import { LogoMark } from '../ui/Logo';
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
  const [importing, setImporting] = useState(false);
  const visible = categories.filter((c) => c.enabled);
  const libraryView = useUi((s) => s.libraryView);
  const showLibrary = useUi((s) => s.showLibrary);
  const libraryTab = useUi((s) => s.libraryTab);
  const navigate = useNavigate();
  const { pathname } = useLocation();

  // The Library panel shows the media list. On phones it is only visible on a
  // library screen, so go there if needed.
  function open(view: string) {
    showLibrary(view);
    if (!LIBRARY_SECTIONS.has(sectionFromPath(pathname))) navigate(`/${libraryTab}`);
  }

  return (
    <section className="panel sidebar__library" aria-labelledby="library-heading">
      <header className="panel__header">
        <h2 className="panel__title panel__title--small" id="library-heading">
          Library
        </h2>
        <div className="panel__actions">
          <button type="button" className="btn btn--icon" aria-label="Import a source" title="Import a source" onClick={() => setImporting(true)}>
            <Download size={14} />
          </button>
          <button type="button" className="btn btn--icon" aria-label="Add category" title="Add category" onClick={() => setAdding(true)}>
            <Plus size={14} />
          </button>
        </div>
      </header>
      <div className="panel__body panel__body--flush">
        <ul className="category-list">
          <li>
            <button type="button" className="category-item" aria-pressed={libraryView === 'all'} onClick={() => open('all')}>
              <Library size={14} aria-hidden="true" />
              <span className="truncate">All media</span>
              <span className="category-item__count" aria-label={`${media.length} items`}>
                {media.length}
              </span>
            </button>
          </li>
          {visible.map((c) => (
            <li key={c.id}>
              <button type="button" className="category-item" aria-pressed={libraryView === c.id} onClick={() => open(c.id)}>
                <Folder size={14} aria-hidden="true" />
                <span className="truncate">{c.name}</span>
                <span className="category-item__count" aria-label={`${counts.get(c.id) ?? 0} items`}>
                  {counts.get(c.id) ?? 0}
                </span>
              </button>
            </li>
          ))}
        </ul>
        {visible.length === 0 && <p className="sidebar__hint muted">Press + to create a category.</p>}
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
      <ImportDialog open={importing} onClose={() => setImporting(false)} />
    </section>
  );
}
