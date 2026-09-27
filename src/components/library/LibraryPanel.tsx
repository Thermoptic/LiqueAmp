import { useNavigate } from 'react-router';
import { useUi, type LibraryTab } from '../../stores/uiStore';
import { FavouritesView } from './FavouritesView';
import { HistoryView } from './HistoryView';
import { PlaylistsView } from './PlaylistsView';
import { MediaLibraryView, useLibraryCategory } from './MediaLibraryView';
import { onTablistKeyDown } from '../ui/controls';

// Collection has no route of its own: it is the Library, filtered by the
// category selected in the LIBRARY panel.
const TABS: ReadonlyArray<{ id: LibraryTab; label: string; path: string | null }> = [
  { id: 'collection', label: 'Collection', path: null },
  { id: 'playlists', label: 'Playlists', path: '/playlists' },
  { id: 'favourites', label: 'Favourites', path: '/favourites' },
  { id: 'history', label: 'History', path: '/history' },
];

export function LibraryPanel() {
  const tab = useUi((s) => s.libraryTab);
  const setLibraryTab = useUi((s) => s.setLibraryTab);
  const category = useLibraryCategory();
  const navigate = useNavigate();

  return (
    <section className="panel library-panel area-library" aria-label="Library">
      <div className="tabs" role="tablist" aria-label="Library views" onKeyDown={onTablistKeyDown}>
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            id={`lib-tab-${t.id}`}
            aria-selected={tab === t.id}
            tabIndex={tab === t.id ? 0 : -1}
            aria-controls="lib-tabpanel"
            className="tab"
            onClick={() => {
              setLibraryTab(t.id);
              if (t.path) navigate(t.path);
            }}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="panel__body panel__body--flush" id="lib-tabpanel" role="tabpanel" aria-labelledby={`lib-tab-${tab}`}>
        {tab === 'collection' && <MediaLibraryView view={category} />}
        {tab === 'playlists' && <PlaylistsView />}
        {tab === 'favourites' && <FavouritesView />}
        {tab === 'history' && <HistoryView />}
      </div>
    </section>
  );
}
