import { useNavigate } from 'react-router';
import { useUi, type LibraryTab } from '../../stores/uiStore';
import { FavouritesView } from './FavouritesView';
import { HistoryView } from './HistoryView';
import { PlaylistsView } from './PlaylistsView';

const TABS: ReadonlyArray<{ id: LibraryTab; label: string; path: string }> = [
  { id: 'playlists', label: 'Playlists', path: '/playlists' },
  { id: 'favourites', label: 'Favourites', path: '/favourites' },
  { id: 'history', label: 'History', path: '/history' },
];

export function LibraryPanel() {
  const tab = useUi((s) => s.libraryTab);
  const navigate = useNavigate();

  return (
    <section className="panel library-panel area-library" aria-label="Library">
      <div className="tabs" role="tablist" aria-label="Library views">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            id={`lib-tab-${t.id}`}
            aria-selected={tab === t.id}
            aria-controls="lib-tabpanel"
            className="tab"
            onClick={() => navigate(t.path)}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="panel__body panel__body--flush" id="lib-tabpanel" role="tabpanel" aria-labelledby={`lib-tab-${tab}`}>
        {tab === 'playlists' && <PlaylistsView />}
        {tab === 'favourites' && <FavouritesView />}
        {tab === 'history' && <HistoryView />}
      </div>
    </section>
  );
}
