import { Link } from 'react-router';
import { useSettings } from '../../stores/settingsStore';
import { useSystem } from '../../stores/systemStore';
import type { MotionPreference } from '../../types/settings';
import { Segmented, Status, Toggle } from '../ui/controls';
import { SHORTCUTS } from '../../services/input/keyboard';
import { PwaSettings } from '../pwa/PwaControls';
import { EqControls } from '../audio/EqControls';
import { MiniPlayer } from '../player/MiniPlayer';
import { AccountSection } from './AccountSection';

const MOTION_OPTIONS = [
  { value: 'system', label: 'System' },
  { value: 'reduced', label: 'Reduced' },
  { value: 'full', label: 'Full' },
] as const satisfies ReadonlyArray<{ value: MotionPreference; label: string }>;

/**
 * User-facing settings (MASTER §32). The desktop control strip already covers
 * audio/player/appearance; this page holds the rest. Advanced configuration
 * lives in /control.
 *
 * On wider screens Settings is a page of its own: the groups are cards on the
 * dashboard's columns (layout.css), so their edges line up with the header.
 */
export function SettingsPanel() {
  const motion = useSettings((s) => s.motion);
  const shortcuts = useSettings((s) => s.shortcuts);
  const artwork = useSettings((s) => s.artwork);
  const update = useSettings((s) => s.update);
  const storage = useSystem((s) => s.storage);

  return (
    <section className="settings-panel area-settings" aria-labelledby="settings-heading">
      <h2 className="sr-only" id="settings-heading">
        Settings
      </h2>
      {/* phones only: the page has no Now Playing panel of its own */}
      <div className="panel settings-panel__mini">
        <MiniPlayer />
      </div>

      {/* under the header's ticker: Account | Equalizer over Keyboard | Install */}
      <div className="settings-panel__main">
        <div className="panel settings-card">
          <AccountSection />
        </div>

        <div className="panel settings-card">
          <section className="settings-group" aria-labelledby="set-eq">
            <h3 id="set-eq" className="settings-group__title">
              Equalizer
            </h3>
            <EqControls />
          </section>
        </div>

        <div className="panel settings-card settings-card--keys">
          <section className="settings-group" aria-labelledby="set-keys">
            <h3 id="set-keys" className="settings-group__title">
              Keyboard
            </h3>
            <div className="field">
              <span className="field__label">Shortcuts</span>
              <Toggle checked={shortcuts} onChange={(v) => update({ shortcuts: v })} label="Keyboard shortcuts" />
            </div>
            <dl className={`shortcut-list ${shortcuts ? '' : 'shortcut-list--off'}`}>
              {SHORTCUTS.map((s) => (
                <div key={s.keys} className="shortcut-list__row">
                  <dt>
                    <kbd>{s.keys}</kbd>
                  </dt>
                  <dd>{s.action}</dd>
                </div>
              ))}
            </dl>
            <p className="settings-group__note">Not active while typing in a field or when a dialog is open.</p>
          </section>
        </div>

        <div className="panel settings-card">
          <section className="settings-group" aria-labelledby="set-pwa">
            <h3 id="set-pwa" className="settings-group__title">
              Install / PWA
            </h3>
            <PwaSettings />
          </section>
        </div>
      </div>

      {/* under the header's clock and status */}
      <section className="panel settings-card settings-panel__interface" aria-labelledby="set-interface">
        <h3 id="set-interface" className="settings-card__title">
          Interface
        </h3>
        <section className="settings-group" aria-labelledby="set-access">
          <h4 id="set-access" className="settings-group__title">
            Accessibility
          </h4>
          <div className="field">
            <span className="field__label">Motion</span>
            <Segmented label="Motion" value={motion} options={MOTION_OPTIONS} onChange={(v) => update({ motion: v })} />
          </div>
          <p className="settings-group__note">System follows your operating system's reduced-motion preference.</p>
        </section>

        <section className="settings-group" aria-labelledby="set-np">
          <h4 id="set-np" className="settings-group__title">
            Now Playing
          </h4>
          <div className="field">
            <span className="field__label">Artwork</span>
            <Toggle checked={artwork} onChange={(v) => update({ artwork: v })} label="Artwork" />
          </div>
          <p className="settings-group__note">
            Off: the Now Playing box always shows the LIQUEAMP default image. YouTube, SoundCloud and Spotify players must stay visible to play, so they move to
            the corner instead.
          </p>
        </section>
      </section>

      <div className="panel settings-card settings-panel__data">
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
