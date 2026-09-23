import { Link } from 'react-router';
import { usePlayback } from '../../stores/playbackStore';
import { useSystem } from '../../stores/systemStore';
import { Status, type StatusTone } from '../ui/controls';

/** Only measured or known values (SPEC §44). No CPU/RAM/latency. */
export function StatusBar() {
  const status = usePlayback((s) => s.status);
  const item = usePlayback((s) => s.currentItem);
  const online = useSystem((s) => s.online);
  const storage = useSystem((s) => s.storage);

  const playbackTone: StatusTone =
    status === 'error' ? 'error' : status === 'playing' ? 'ok' : status === 'idle' || status === 'paused' ? 'idle' : 'warn';
  const storageTone: StatusTone = storage === 'ready' ? 'ok' : storage === 'pending' ? 'warn' : 'error';

  return (
    <footer className="status-bar area-status" aria-label="System status">
      <Status tone={playbackTone}>
        PLAYBACK: {status.toUpperCase()}
        {item ? ` — ${item.title}` : ''}
      </Status>
      <span className="status-bar__sep" aria-hidden="true" />
      <Status tone="idle">AUDIO ENGINE: NOT STARTED</Status>
      <span className="status-bar__sep" aria-hidden="true" />
      <Status tone="idle">VISUALIZER: OFF</Status>
      <span className="status-bar__sep" aria-hidden="true" />
      <Status tone={online ? 'ok' : 'error'}>NETWORK: {online ? 'ONLINE' : 'OFFLINE'}</Status>
      <span className="status-bar__sep" aria-hidden="true" />
      <Status tone={storageTone}>STORAGE: {storage === 'ready' ? 'LOCAL' : storage.toUpperCase()}</Status>
      <Link to="/control" className="status-bar__control">
        /CONTROL
      </Link>
    </footer>
  );
}
