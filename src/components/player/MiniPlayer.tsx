import { Pause, Play, SkipForward } from 'lucide-react';
import { Link } from 'react-router';
import { getEngine } from '../../services/playback/engine';
import { usePlayback } from '../../stores/playbackStore';
import { useQueue } from '../../stores/queueStore';
import { Artwork } from '../ui/Artwork';

/** Compact player shown when the full Now Playing view is not visible. */
export function MiniPlayer() {
  const item = usePlayback((s) => s.currentItem);
  const status = usePlayback((s) => s.status);
  const queueLength = useQueue((s) => s.entries.length);
  if (!item) return null;
  const active = status === 'playing' || status === 'buffering' || status === 'loading';
  return (
    <div className="mini-player" role="region" aria-label="Mini player">
      <Link to="/" className="mini-player__link">
        <Artwork src={item.artwork} alt="" className="mini-player__art" />
        <span className="mini-player__text">
          <span className="truncate">{item.title}</span>
          <span className="truncate muted">{status === 'error' ? 'Error — open player' : (item.artist ?? status.toUpperCase())}</span>
        </span>
      </Link>
      <button type="button" className="btn btn--icon" aria-label={active ? 'Pause' : 'Play'} onClick={() => void getEngine().togglePlay()}>
        {active ? <Pause size={18} /> : <Play size={18} />}
      </button>
      <button type="button" className="btn btn--icon" aria-label="Next" disabled={queueLength < 2} onClick={() => void getEngine().next()}>
        <SkipForward size={18} />
      </button>
    </div>
  );
}
