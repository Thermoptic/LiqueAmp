import { useEffect, useState } from 'react';
import { Download, RefreshCw } from 'lucide-react';
import { applyUpdate, checkForUpdate, promptInstall, readStorageInfo, requestPersistentStorage, usePwa, type OfflineStatus, type StorageInfo } from '../../services/pwa/pwa';
import { usePlayback } from '../../stores/playbackStore';
import { useUi } from '../../stores/uiStore';
import { Status, type StatusTone } from '../ui/controls';

const OFFLINE_TEXT: Record<OfflineStatus, [string, StatusTone]> = {
  ready: ['OFFLINE READY · opens without a network', 'ok'],
  registering: ['PREPARING OFFLINE SUPPORT…', 'warn'],
  dev: ['DEVELOPMENT SERVER · offline support only in production builds', 'idle'],
  unsupported: ['OFFLINE SUPPORT NOT AVAILABLE IN THIS BROWSER', 'idle'],
  error: ['OFFLINE SUPPORT FAILED TO START', 'error'],
};

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let v = bytes / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v < 10 ? v.toFixed(1) : Math.round(v)} ${units[i]}`;
}

function UpdateNotice() {
  const updateAvailable = usePwa((s) => s.updateAvailable);
  const playing = usePlayback((s) => s.status === 'playing' || s.status === 'buffering');
  if (!updateAvailable) return null;
  return (
    <div className="pwa__update">
      <Status tone="warn">UPDATE AVAILABLE</Status>
      <button type="button" className="btn" onClick={applyUpdate}>
        <RefreshCw size={14} aria-hidden="true" /> Reload to update
      </button>
      {playing && <p className="settings-group__note">Reloading stops the current playback.</p>}
    </div>
  );
}

/** Install and offline status for user Settings (SPEC §5). */
export function PwaSettings() {
  const { offline, installable, installed } = usePwa();
  const toast = useUi((s) => s.toast);
  const [text, tone] = OFFLINE_TEXT[offline];

  const install = async () => {
    const outcome = await promptInstall();
    if (outcome === 'accepted') toast('LIQUEAMP installed', 'success');
  };

  return (
    <div className="pwa">
      {installed ? (
        <Status tone="ok">INSTALLED · running as an app</Status>
      ) : installable ? (
        <button type="button" className="btn btn--accent-outline" onClick={() => void install()}>
          <Download size={14} aria-hidden="true" /> Install LIQUEAMP
        </button>
      ) : (
        <p className="settings-group__note">To install, use your browser's “Install app” or “Add to Home Screen” option when it offers one.</p>
      )}
      <Status tone={tone}>{text}</Status>
      <p className="settings-group__note">Your library, playlists, favourites, history, themes and settings are stored on this device and work offline. Streams and online directories need a connection.</p>
      <UpdateNotice />
    </div>
  );
}

/** Technical PWA details for /control (all values measured). */
export function PwaSection() {
  const { offline, error, info, installed } = usePwa();
  const toast = useUi((s) => s.toast);
  const [storage, setStorage] = useState<StorageInfo | null>(null);
  const [checking, setChecking] = useState(false);
  const [text, tone] = OFFLINE_TEXT[offline];

  useEffect(() => {
    void readStorageInfo().then(setStorage);
  }, []);

  const persist = async () => {
    const granted = await requestPersistentStorage();
    toast(granted ? 'Local data will be kept' : 'The browser did not grant persistent storage', granted ? 'success' : 'info');
    setStorage(await readStorageInfo());
  };

  const check = async () => {
    setChecking(true);
    try {
      await checkForUpdate();
      if (!usePwa.getState().updateAvailable) toast('No update found — or it is still downloading');
    } catch {
      toast('Could not check for updates', 'error');
    } finally {
      setChecking(false);
    }
  };

  const rows: Array<[string, string]> = [
    ['Display mode', installed ? 'Installed app (standalone)' : 'Browser tab'],
    ['Service worker', offline === 'ready' ? 'Active' : offline === 'dev' ? 'Off (development server)' : offline],
    ['Shell version', info?.version ?? '—'],
    ['Precached files', info ? String(info.precached) : '—'],
    ['Cache', info?.cache ?? '—'],
    ['Storage used', storage?.usage != null ? formatBytes(storage.usage) : '—'],
    ['Storage quota', storage?.quota != null ? formatBytes(storage.quota) : '—'],
    ['Persistent storage', storage?.persisted == null ? '—' : storage.persisted ? 'Granted' : 'Not granted (the browser may evict data under storage pressure)'],
  ];

  return (
    <div className="control-stack">
      <section className="panel">
        <header className="panel__header">
          <h2 className="panel__title">PWA</h2>
          <div className="panel__actions">
            <Status tone={tone}>{text}</Status>
          </div>
        </header>
        <div className="panel__body pwa">
          {error && <p className="settings-group__note">Error: {error}</p>}
          <dl className="kv-list">
            {rows.map(([k, v]) => (
              <div key={k} className="kv-list__row">
                <dt>{k}</dt>
                <dd>{v}</dd>
              </div>
            ))}
          </dl>
          <div className="pwa__actions">
            <button type="button" className="btn" disabled={offline !== 'ready' || checking} onClick={() => void check()}>
              <RefreshCw size={14} aria-hidden="true" /> {checking ? 'Checking…' : 'Check for updates'}
            </button>
            {storage?.persisted === false && (
              <button type="button" className="btn" onClick={() => void persist()}>
                Keep local data (persistent storage)
              </button>
            )}
          </div>
          <UpdateNotice />
          <p className="muted control-note">
            Cached: the app itself (HTML, scripts, styles, fonts, icons). Never cached: streams, the radio directory, artwork and provider players — they always come
            from the network. The HLS library is cached the first time an HLS stream plays.
          </p>
        </div>
      </section>
    </div>
  );
}
