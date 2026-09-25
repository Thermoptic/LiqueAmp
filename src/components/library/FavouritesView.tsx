import { Heart, ListMusic } from 'lucide-react';
import { useNavigate } from 'react-router';
import { getEngine } from '../../services/playback/engine';
import { myFavorites, useFavorites } from '../../stores/favoritesStore';
import { useLibrary } from '../../stores/libraryStore';
import { usePlaylists } from '../../stores/playlistStore';
import { useUi } from '../../stores/uiStore';
import type { MediaItem, Playlist, RadioStation } from '../../types/media';
import { EmptyState } from '../ui/controls';
import { StationRow } from '../radio/StationRow';
import { MediaRow } from './MediaRow';
import { RowList } from '../ui/RowList';

/**
 * Favourite stations, tracks/sources and playlists (SPEC §21) of the profile
 * shown — a friend's while their Lique is active. The hearts are always the
 * viewer's own favourites (D3).
 */
export function FavouritesView() {
  const favorites = useFavorites((s) => s.favorites);
  const stationMap = useFavorites((s) => s.stations);
  const removeFav = useFavorites((s) => s.remove);
  const friendShown = useFavorites((s) => s.own !== null);
  const mine = useFavorites(myFavorites);
  const toggleOwnItem = useFavorites((s) => s.toggleOwnItem);
  const media = useLibrary((s) => s.media);
  const playlists = usePlaylists((s) => s.playlists);
  const openPlaylist = useUi((s) => s.openPlaylist);
  const navigate = useNavigate();

  const stations: RadioStation[] = [];
  const items: MediaItem[] = [];
  const lists: Playlist[] = [];
  for (const f of favorites) {
    if (f.type === 'station' && stationMap[f.refId]) stations.push(stationMap[f.refId]!);
    if (f.type === 'media') {
      const m = media.find((x) => x.id === f.refId);
      if (m) items.push(m);
    }
    if (f.type === 'playlist') {
      const p = playlists.find((x) => x.id === f.refId);
      if (p) lists.push(p);
    }
  }

  if (!stations.length && !items.length && !lists.length) {
    return <EmptyState title="NO FAVOURITES">Add a station, track or playlist to your favourites with the heart button.</EmptyState>;
  }

  return (
    <div className="favourites">
      {stations.length > 0 && (
        <section aria-label="Favourite stations">
          <h3 className="list-heading">Stations · {stations.length}</h3>
          <RowList>
            {stations.map((s, i) => (
              <StationRow key={s.id} station={s} index={i} />
            ))}
          </RowList>
        </section>
      )}
      {items.length > 0 && (
        <section aria-label="Favourite tracks and sources">
          <h3 className="list-heading">Tracks &amp; sources · {items.length}</h3>
          <RowList>
            {items.map((item, i) => (
              <MediaRow
                key={item.id}
                item={item}
                index={i}
                onActivate={() => void getEngine().playNow(item)}
                actions={
                  friendShown ? (
                    // a friend's favourite: the heart adds it to (or removes it from) MY favourites
                    <OwnFavouriteButton item={item} pressed={mine.some((f) => f.id === `media:${item.id}`)} onToggle={() => void toggleOwnItem(item)} />
                  ) : (
                    <button
                      type="button"
                      className="btn btn--ghost btn--icon station-row__fav"
                      aria-pressed="true"
                      aria-label={`Remove ${item.title} from favourites`}
                      onClick={() => void removeFav('media', item.id)}
                    >
                      <Heart size={14} />
                    </button>
                  )
                }
              />
            ))}
          </RowList>
        </section>
      )}
      {lists.length > 0 && (
        <section aria-label="Favourite playlists">
          <h3 className="list-heading">Playlists · {lists.length}</h3>
          <RowList>
            {lists.map((p, i) => (
              <li key={p.id} className="media-row">
                <span className="row__index">{String(i + 1).padStart(2, '0')}</span>
                <button
                  type="button"
                  className="media-row__main"
                  onClick={() => {
                    openPlaylist(p.id);
                    navigate('/playlists');
                  }}
                >
                  <span className="media-row__title truncate">
                    <ListMusic size={12} aria-hidden="true" /> {p.name}
                  </span>
                  <span className="media-row__meta">{p.items.length} items</span>
                </button>
              </li>
            ))}
          </RowList>
        </section>
      )}
    </div>
  );
}

function OwnFavouriteButton({ item, pressed, onToggle }: { item: MediaItem; pressed: boolean; onToggle(): void }) {
  return (
    <button
      type="button"
      className="btn btn--ghost btn--icon station-row__fav"
      aria-pressed={pressed}
      aria-label={pressed ? `Remove ${item.title} from my favourites` : `Add ${item.title} to my favourites`}
      onClick={onToggle}
    >
      <Heart size={14} />
    </button>
  );
}
