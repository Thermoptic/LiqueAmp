import { useEffect, useState } from 'react';
import { DB_NAME, DB_VERSION } from '../../services/storage/db';
import { useSystem } from '../../stores/systemStore';
import { Status } from '../ui/controls';

const FORMATS: ReadonlyArray<[string, string]> = [
  ['MP3', 'audio/mpeg'],
  ['AAC', 'audio/aac'],
  ['OGG Vorbis', 'audio/ogg; codecs="vorbis"'],
  ['Opus', 'audio/ogg; codecs="opus"'],
  ['HLS (native)', 'application/vnd.apple.mpegurl'],
];

function formatBytes(n: number | undefined): string {
  if (n === undefined) return '—';
  if (n < 1024) return `${n} B`;
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MB`;
  return `${(n / 1024 ** 3).toFixed(2)} GB`;
}

/** Diagnostics made only of values the browser actually reports. */
export function SystemSection() {
  const online = useSystem((s) => s.online);
  const storage = useSystem((s) => s.storage);
  const storageError = useSystem((s) => s.storageError);
  const [estimate, setEstimate] = useState<StorageEstimate | null>(null);
  const [persisted, setPersisted] = useState<boolean | null>(null);
  const [formats, setFormats] = useState<Array<[string, string]>>([]);

  useEffect(() => {
    void navigator.storage?.estimate?.().then(setEstimate).catch(() => setEstimate(null));
    void navigator.storage?.persisted?.().then(setPersisted).catch(() => setPersisted(null));
    const audio = document.createElement('audio');
    setFormats(FORMATS.map(([label, mime]) => [label, audio.canPlayType(mime) || 'no']));
  }, []);

  const rows: Array<[string, React.ReactNode]> = [
    ['Network', <Status tone={online ? 'ok' : 'error'}>{online ? 'ONLINE' : 'OFFLINE'}</Status>],
    [
      'Local storage',
      <Status tone={storage === 'ready' ? 'ok' : storage === 'pending' ? 'warn' : 'error'}>
        {storage.toUpperCase()}
        {storageError ? ` — ${storageError}` : ''}
      </Status>,
    ],
    ['Database', `${DB_NAME} · schema v${DB_VERSION}`],
    ['Storage used', `${formatBytes(estimate?.usage)} of ${formatBytes(estimate?.quota)} available`],
    ['Persistent storage', persisted === null ? '—' : persisted ? 'Granted' : 'Not granted (browser may evict data)'],
    ['Device pixel ratio', String(window.devicePixelRatio)],
    ['Viewport', `${window.innerWidth} × ${window.innerHeight}`],
    ['Web Audio API', 'AudioContext' in window ? 'Available' : 'Not available'],
    ['Media Session API', 'mediaSession' in navigator ? 'Available' : 'Not available'],
    ['Web Share API', 'share' in navigator ? 'Available' : 'Not available'],
    ['Service worker', 'serviceWorker' in navigator ? 'Supported (not registered yet)' : 'Not supported'],
  ];

  return (
    <div className="control-stack">
      <section className="panel">
        <header className="panel__header">
          <h2 className="panel__title">System</h2>
        </header>
        <div className="panel__body">
          <dl className="kv-list">
            {rows.map(([k, v]) => (
              <div key={k} className="kv-list__row">
                <dt>{k}</dt>
                <dd>{v}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>
      <section className="panel">
        <header className="panel__header">
          <h2 className="panel__title">Browser audio formats</h2>
        </header>
        <div className="panel__body">
          <p className="muted control-note">What this browser reports via canPlayType(). "maybe" and "probably" are the browser's own answers.</p>
          <dl className="kv-list">
            {formats.map(([label, answer]) => (
              <div key={label} className="kv-list__row">
                <dt>{label}</dt>
                <dd>
                  <Status tone={answer === 'no' ? 'error' : answer === 'probably' ? 'ok' : 'warn'}>{answer.toUpperCase()}</Status>
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </section>
    </div>
  );
}
