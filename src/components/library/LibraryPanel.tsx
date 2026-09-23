import { useNavigate } from 'react-router';
import { useFavorites } from '../../stores/favoritesStore';
import { useUi, type LibraryTab } from '../../stores/uiStore';
import { EmptyState } from '../ui/controls';
import { StationRow } from '../radio/StationRow';

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
        {tab === 'playlists' && <EmptyState title="NO PLAYLISTS">Playlist editing is not available in this build yet.</EmptyState>}
        {tab === 'favourites' && <FavouritesList />}
        {tab === 'history' && <EmptyState title="NO HISTORY">Played items will be recorded here.</EmptyState>}
      </div>
    </section>
  );
}

function FavouritesList() {
  const favorites = useFavorites((s) => s.favorites);
  const stations = useFavorites((s) => s.stations);
  const favStations = favorites.filter((f) => f.type === 'station').map((f) => stations[f.refId]).filter((s) => s !== undefined);
  if (favStations.length === 0) return <EmptyState title="NO FAVOURITES">Add a station to your favourites with the heart button.</EmptyState>;
  return (
    <ol className="row-list" aria-label="Favourite stations">
      {favStations.map((s, i) => (
        <StationRow key={s.id} station={s} index={i} />
      ))}
    </ol>
  );
}
