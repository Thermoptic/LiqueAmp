import { Pause, Play } from 'lucide-react';
import { Link } from 'react-router';
import { usePlayback } from '../../stores/playbackStore';
import { Artwork } from '../ui/Artwork';

/** Compact player shown when the full Now Playing view is not visible. */
export function MiniPlayer() {
  const item = usePlayback((s) => s.currentItem);
  const playing = usePlayback((s) => s.status === 'playing');
  if (!item) return null;
  return (
    <div className="mini-player" role="region" aria-label="Mini player">
      <Link to="/" className="mini-player__link">
        <Artwork src={item.artwork} alt="" className="mini-player__art" />
        <span className="mini-player__text">
          <span className="truncate">{item.title}</span>
          {item.artist && <span className="truncate muted">{item.artist}</span>}
        </span>
      </Link>
      <button type="button" className="btn btn--icon" aria-label={playing ? 'Pause' : 'Play'}>
        {playing ? <Pause size={18} /> : <Play size={18} />}
      </button>
    </div>
  );
}
