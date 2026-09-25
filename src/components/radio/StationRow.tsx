import { useState } from 'react';
import { Heart, Play, Radio } from 'lucide-react';
import { playStation } from '../../services/radio/actions';
import { isInsecureForPage } from '../../services/radio/stations';
import { useFavorites, myFavorites } from '../../stores/favoritesStore';
import { usePlayback } from '../../stores/playbackStore';
import { useUi } from '../../stores/uiStore';
import type { RadioStation } from '../../types/media';

/** Station favicon with a neutral fallback instead of a broken image. */
export function StationIcon({ station, size = 22 }: { station: RadioStation; size?: number }) {
  const [failed, setFailed] = useState(false);
  if (!station.favicon || failed) {
    return (
      <span className="station-icon station-icon--fallback" style={{ width: size, height: size }} aria-hidden="true">
        <Radio size={Math.round(size * 0.6)} />
      </span>
    );
  }
  return (
    <img
      className="station-icon"
      src={station.favicon}
      alt=""
      width={size}
      height={size}
      loading="lazy"
      decoding="async"
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
    />
  );
}

export function stationMeta(station: RadioStation): string {
  const parts = [station.genre[0], station.countryCode, [station.codec, station.bitrate ? `${station.bitrate}k` : ''].filter(Boolean).join(' ')];
  return parts.filter(Boolean).join(' · ');
}

export function StationRow({ station, index }: { station: RadioStation; index: number }) {
  const isPlaying = usePlayback((s) => s.currentItem?.id === station.id);
  const selected = useUi((s) => s.selection?.kind === 'station' && s.selection.station.id === station.id);
  const select = useUi((s) => s.select);
  const toast = useUi((s) => s.toast);
  // the heart is always the viewer's own favourites, also in a Friend Lique (D3)
  const favorite = useFavorites((s) => myFavorites(s).some((f) => f.id === `station:${station.id}`));
  const toggleFavorite = useFavorites((s) => s.toggleOwnStation);
  const insecure = isInsecureForPage(station.streamUrl);

  return (
    <li className="station-row" aria-current={isPlaying ? 'true' : undefined} data-selected={selected || undefined}>
      <span className="row__index">{String(index + 1).padStart(2, '0')}</span>
      <button
        type="button"
        className="station-row__main"
        onClick={() => select({ kind: 'station', station })}
        onDoubleClick={() => void playStation(station)}
        aria-pressed={selected}
        aria-label={`${station.name}${isPlaying ? ', now playing' : ''}. Select for details`}
      >
        <StationIcon station={station} />
        <span className="station-row__text">
          <span className="station-row__name truncate">{station.name}</span>
          <span className="station-row__meta truncate">{stationMeta(station) || '—'}</span>
        </span>
      </button>
      <span className="station-row__flags">
        {insecure && (
          <span className="station-row__flag" title="http:// stream — blocked on https pages">
            HTTP
          </span>
        )}
        {station.online === false && <span className="station-row__flag station-row__flag--off">OFFLINE</span>}
      </span>
      <button type="button" className="btn btn--ghost btn--icon" aria-label={`Play ${station.name}`} onClick={() => void playStation(station)}>
        <Play size={14} />
      </button>
      <button
        type="button"
        className="btn btn--ghost btn--icon station-row__fav"
        aria-label={favorite ? `Remove ${station.name} from favourites` : `Add ${station.name} to favourites`}
        aria-pressed={favorite}
        onClick={() =>
          void toggleFavorite(station).then((added) => toast(added ? 'Added to favourites' : 'Removed from favourites', 'success'))
        }
      >
        <Heart size={14} />
      </button>
    </li>
  );
}
