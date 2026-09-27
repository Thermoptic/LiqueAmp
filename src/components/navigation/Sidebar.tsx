import { useMemo, useState } from 'react';
import { NavLink, useNavigate } from 'react-router';
import { Download, Folder, Library, ListMusic, Plus } from 'lucide-react';
import { CONTROL_PANEL_LINK, SECTIONS } from '../../app/sections';
import { useUi } from '../../stores/uiStore';
import { ImportDialog } from '../import/ImportDialog';
import { collectionMedia, countByCategory, useLibrary } from '../../stores/libraryStore';
import { usePlaylists } from '../../stores/playlistStore';
import { LogoMark } from '../ui/Logo';
import { CategoryDialog } from '../library/CategoryDialog';
import { useLibraryCategory } from '../library/MediaLibraryView';

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
          <li>
            <NavLink to={CONTROL_PANEL_LINK.path} className="nav-item">
              <CONTROL_PANEL_LINK.icon size={18} aria-hidden="true" />
              <span>{CONTROL_PANEL_LINK.label}</span>
            </NavLink>
          </li>
        </ul>
      </nav>
      <LibraryCategories />
    </aside>
  );
}

export function LibraryCategories() {
  const categories = useLibrary((s) => s.categories);
  const allMedia = useLibrary((s) => s.media);
  const playlists = usePlaylists((s) => s.playlists);
  // what Collection lists: videos saved only for an imported playlist are counted under that playlist
  const media = useMemo(() => collectionMedia(allMedia, playlists), [allMedia, playlists]);
  const counts = useMemo(() => countByCategory(media), [media]);
  const imported = playlists.filter((p) => p.source);
  const [adding, setAdding] = useState(false);
  const [importing, setImporting] = useState(false);
  const visible = categories.filter((c) => c.enabled);
  const libraryView = useLibraryCategory();
  const libraryTab = useUi((s) => s.libraryTab);
  const openPlaylistId = useUi((s) => s.openPlaylistId);
  const showLibrary = useUi((s) => s.showLibrary);
  const navigate = useNavigate();

  // The category filters the Collection tab of the Library panel, which is on
  // screen wherever these categories are (phones show both only on the
  // library screens), so no navigation is needed.
  function open(view: string) {
    showLibrary(view);
  }

  // An imported playlist is one Library entry: it opens in the Playlists tab
  // (the same state and route as the tab itself); it does not start playing.
  function openImported(id: string) {
    useUi.getState().openPlaylist(id);
    useUi.getState().setLibraryTab('playlists');
    navigate('/playlists');
  }

  return (
    <section className="panel sidebar__library" aria-label="Library categories">
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
            <button type="button" className="category-item" aria-pressed={libraryTab === 'collection' && libraryView === 'all'} onClick={() => open('all')}>
              <Library size={14} aria-hidden="true" />
              <span className="truncate">All media</span>
              <span className="category-item__count" aria-label={`${media.length} items`}>
                {media.length}
              </span>
            </button>
          </li>
          {visible.map((c) => (
            <li key={c.id}>
              <button type="button" className="category-item" aria-pressed={libraryTab === 'collection' && libraryView === c.id} onClick={() => open(c.id)}>
                <Folder size={14} aria-hidden="true" />
                <span className="truncate">{c.name}</span>
                <span className="category-item__count" aria-label={`${counts.get(c.id) ?? 0} items`}>
                  {counts.get(c.id) ?? 0}
                </span>
              </button>
            </li>
          ))}
          {imported.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                className="category-item category-item--playlist"
                aria-pressed={libraryTab === 'playlists' && openPlaylistId === p.id}
                onClick={() => openImported(p.id)}
              >
                <ListMusic size={14} aria-hidden="true" />
                <span className="category-item__name">
                  <span className="truncate">{p.name}</span>
                  <span className="category-item__meta">Playlist · {p.items.length === 1 ? '1 video' : `${p.items.length} videos`}</span>
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
