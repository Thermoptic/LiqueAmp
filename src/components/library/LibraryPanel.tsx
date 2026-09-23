import { useNavigate } from 'react-router';
import { useUi, type LibraryTab } from '../../stores/uiStore';
import { FavouritesView } from './FavouritesView';
import { HistoryView } from './HistoryView';
import { PlaylistsView } from './PlaylistsView';
import { MediaLibraryView } from './MediaLibraryView';
import { onTablistKeyDown } from '../ui/controls';

const TABS: ReadonlyArray<{ id: LibraryTab; label: string; path: string }> = [
  { id: 'playlists', label: 'Playlists', path: '/playlists' },
  { id: 'favourites', label: 'Favourites', path: '/favourites' },
  { id: 'history', label: 'History', path: '/history' },
];

export function LibraryPanel() {
  const tab = useUi((s) => s.libraryTab);
  const libraryView = useUi((s) => s.libraryView);
  const showLibrary = useUi((s) => s.showLibrary);
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
            aria-selected={!libraryView && tab === t.id}
            // one Tab stop: the selected tab, or the first while a category view is open
            tabIndex={(libraryView ? t.id === TABS[0]!.id : tab === t.id) ? 0 : -1}
            aria-controls="lib-tabpanel"
            className="tab"
            onClick={() => {
              showLibrary(null);
              navigate(t.path);
            }}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="panel__body panel__body--flush" id="lib-tabpanel" role="tabpanel" aria-labelledby={`lib-tab-${tab}`}>
        {libraryView ? (
          <MediaLibraryView view={libraryView} />
        ) : (
          <>
            {tab === 'playlists' && <PlaylistsView />}
            {tab === 'favourites' && <FavouritesView />}
            {tab === 'history' && <HistoryView />}
          </>
        )}
      </div>
    </section>
  );
}
