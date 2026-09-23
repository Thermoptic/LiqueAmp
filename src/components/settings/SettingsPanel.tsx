import { Link } from 'react-router';
import { useSettings } from '../../stores/settingsStore';
import { useSystem } from '../../stores/systemStore';
import type { MotionPreference } from '../../types/settings';
import { PendingTag, Segmented, Status } from '../ui/controls';
import { MiniPlayer } from '../player/MiniPlayer';

const MOTION_OPTIONS = [
  { value: 'system', label: 'System' },
  { value: 'reduced', label: 'Reduced' },
  { value: 'full', label: 'Full' },
] as const satisfies ReadonlyArray<{ value: MotionPreference; label: string }>;

/**
 * User-facing settings (MASTER §32). The desktop control strip already covers
 * audio/player/appearance; this panel holds the rest. Advanced configuration
 * lives in /control.
 */
export function SettingsPanel() {
  const motion = useSettings((s) => s.motion);
  const update = useSettings((s) => s.update);
  const storage = useSystem((s) => s.storage);

  return (
    <section className="panel panel--strong settings-panel area-settings" aria-labelledby="settings-heading">
      <header className="panel__header">
        <h2 className="panel__title panel__title--accent" id="settings-heading">
          Settings
        </h2>
      </header>
      <MiniPlayer />
      <div className="panel__body settings-panel__grid">
        <section className="settings-group" aria-labelledby="set-access">
          <h3 id="set-access" className="settings-group__title">
            Accessibility
          </h3>
          <div className="field">
            <span className="field__label">Motion</span>
            <Segmented label="Motion" value={motion} options={MOTION_OPTIONS} onChange={(v) => update({ motion: v })} />
          </div>
          <p className="settings-group__note">System follows your operating system's reduced-motion preference.</p>
        </section>

        <section className="settings-group" aria-labelledby="set-keys">
          <h3 id="set-keys" className="settings-group__title">
            Keyboard
          </h3>
          <PendingTag>Shortcuts not yet implemented</PendingTag>
        </section>

        <section className="settings-group" aria-labelledby="set-pwa">
          <h3 id="set-pwa" className="settings-group__title">
            Install / PWA
          </h3>
          <PendingTag>Not yet implemented</PendingTag>
        </section>

        <section className="settings-group" aria-labelledby="set-data">
          <h3 id="set-data" className="settings-group__title">
            Data
          </h3>
          <Status tone={storage === 'ready' ? 'ok' : storage === 'pending' ? 'warn' : 'error'}>
            {storage === 'ready' ? 'Saved locally in this browser (IndexedDB)' : `Local storage ${storage}`}
          </Status>
          <p className="settings-group__note">
            Library, themes and categories are managed in <Link to="/control">/control</Link>.
          </p>
        </section>
      </div>
    </section>
  );
}
