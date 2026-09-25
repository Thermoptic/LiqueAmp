import { useEffect, useState } from 'react';
import { Maximize, Minimize } from 'lucide-react';
import { Link } from 'react-router';
import { usePlayback } from '../../stores/playbackStore';
import { useSystem } from '../../stores/systemStore';
import { Status } from '../ui/controls';

const VERSION = 'v1.0';

export function Header() {
  return (
    <header className="app-header">
      <Link to="/" className="brand" aria-label="LIQUEAMP — Now Playing">
        <span className="brand__name display">
          LIQUEAMP <span className="brand__version">{VERSION}</span>
        </span>
        <span className="brand__tagline">STREAM // RADIO // WORLDWIDE</span>
      </Link>
      {/* grouped so wide layouts can put these on the dashboard's own columns (layout.css) */}
      <div className="app-header__rest">
        <Ticker />
        <div className="app-header__end">
          <Clock />
          <LiveBlock />
          <FullscreenButton />
        </div>
      </div>
    </header>
  );
}

function Ticker() {
  const item = usePlayback((s) => s.currentItem);
  const status = usePlayback((s) => s.status);
  const text = item
    ? `${status.toUpperCase()}  ${item.artist ? `${item.artist} — ` : ''}${item.title}`
    : 'MUSIC  PEOPLE  PLACES  ALWAYS ON';
  return (
    <div className="app-header__ticker">
      <span className="app-header__prompt" aria-hidden="true">
        &gt;
      </span>
      <span className="truncate">{text}</span>
    </div>
  );
}

const dateFmt = new Intl.DateTimeFormat(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
const timeFmt = new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' });

/** Isolated so the per-second tick re-renders only this element. */
function Clock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(t);
  }, []);
  return (
    <div className="app-header__block app-header__clock">
      <time dateTime={now.toISOString()}>
        <span>{dateFmt.format(now)}</span> <span className="app-header__time">{timeFmt.format(now)}</span>
      </time>
      <span className="app-header__sub">{Intl.DateTimeFormat().resolvedOptions().timeZone}</span>
    </div>
  );
}

function LiveBlock() {
  const online = useSystem((s) => s.online);
  const isLive = usePlayback((s) => s.isLive);
  const playing = usePlayback((s) => s.status === 'playing');
  return (
    <div className="app-header__block app-header__live">
      {isLive && playing ? (
        <Status tone="live">
          <span className="app-header__live-label display">LIVE</span>
        </Status>
      ) : (
        <Status tone={online ? 'ok' : 'error'}>{online ? 'ONLINE' : 'OFFLINE'}</Status>
      )}
      <span className="app-header__sub">{online ? 'Network available' : 'Local data only'}</span>
    </div>
  );
}

function FullscreenButton() {
  const [active, setActive] = useState(() => Boolean(document.fullscreenElement));
  useEffect(() => {
    const onChange = () => setActive(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);
  if (!document.fullscreenEnabled) return null;
  return (
    <button
      type="button"
      className="btn btn--ghost btn--icon app-header__fs"
      aria-label={active ? 'Exit fullscreen' : 'Enter fullscreen'}
      onClick={() => (active ? document.exitFullscreen() : document.documentElement.requestFullscreen())}
    >
      {active ? <Minimize size={16} /> : <Maximize size={16} />}
    </button>
  );
}
