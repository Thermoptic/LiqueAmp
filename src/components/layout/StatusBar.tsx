import { Link } from 'react-router';
import { usePlayback, usePlaybackClock, type AnalysisAvailability, type AudioEngineState } from '../../stores/playbackStore';
import { useSystem } from '../../stores/systemStore';
import { Status, type StatusTone } from '../ui/controls';
import { statusTone } from '../player/NowPlayingPanel';

const ENGINE_LABEL: Record<AudioEngineState, [string, StatusTone]> = {
  'not-started': ['NOT STARTED', 'idle'],
  running: ['RUNNING', 'ok'],
  suspended: ['SUSPENDED', 'warn'],
  unavailable: ['NO WEB AUDIO', 'error'],
};

const ANALYSIS_LABEL: Record<AnalysisAvailability, [string, StatusTone]> = {
  inactive: ['OFF', 'idle'],
  available: ['SIGNAL AVAILABLE', 'ok'],
  'cors-blocked': ['BLOCKED BY SOURCE (CORS)', 'warn'],
  unsupported: ['UNSUPPORTED', 'error'],
  'provider-restricted': ['NOT EXPOSED BY PROVIDER', 'idle'],
};

/** Buffer is measured from the media element; shown only while something is loaded. */
function BufferReadout() {
  const bufferedAhead = usePlaybackClock((s) => s.bufferedAhead);
  const active = usePlayback((s) => s.mode === 'native-audio' && s.status !== 'idle' && s.status !== 'error');
  if (!active) return null;
  return (
    <>
      <span className="status-bar__sep" aria-hidden="true" />
      <span>BUFFER: {bufferedAhead.toFixed(1)}s</span>
    </>
  );
}

/** Only measured or known values (SPEC §44). No CPU/RAM/latency. */
export function StatusBar() {
  const status = usePlayback((s) => s.status);
  const item = usePlayback((s) => s.currentItem);
  const audioEngine = usePlayback((s) => s.audioEngine);
  const analysis = usePlayback((s) => s.analysis);
  const online = useSystem((s) => s.online);
  const storage = useSystem((s) => s.storage);
  const storageTone: StatusTone = storage === 'ready' ? 'ok' : storage === 'pending' ? 'warn' : 'error';
  const [engineText, engineTone] = ENGINE_LABEL[audioEngine];
  const [analysisText, analysisTone] = ANALYSIS_LABEL[analysis];

  return (
    <footer className="status-bar area-status" aria-label="System status">
      <Status tone={statusTone(status)}>
        <span className="truncate status-bar__playback">
          PLAYBACK: {status.toUpperCase()}
          {item ? ` — ${item.title}` : ''}
        </span>
      </Status>
      <BufferReadout />
      <span className="status-bar__sep" aria-hidden="true" />
      <Status tone={engineTone}>AUDIO ENGINE: {engineText}</Status>
      <span className="status-bar__sep" aria-hidden="true" />
      <Status tone={analysisTone}>ANALYSIS: {analysisText}</Status>
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
