import { useId } from 'react';
import { applyPreset, EQ_PRESETS, setBand } from '../../services/analysis/eq';
import { usePlayback, type AnalysisAvailability } from '../../stores/playbackStore';
import { useSettings } from '../../stores/settingsStore';
import { EQ_LIMIT_DB } from '../../types/settings';
import { Slider, Status, type StatusTone } from '../ui/controls';

const fmt = (db: number) => `${db > 0 ? '+' : ''}${db} dB`;

/**
 * Whether the EQ actually changes what is heard (ARCH §32: "DSP ACTIVE"
 * versus a setting that cannot affect the current source).
 */
export function eqStatus(analysis: AnalysisAvailability, enabled: boolean): [string, StatusTone] {
  if (!enabled) return ['EQ OFF', 'idle'];
  switch (analysis) {
    case 'available':
      return ['DSP ACTIVE', 'ok'];
    case 'cors-blocked':
      return ['NOT APPLIED · SOURCE DOES NOT ALLOW BROWSER PROCESSING', 'warn'];
    case 'provider-restricted':
      return ['NOT APPLIED · PROVIDER PLAYER', 'warn'];
    case 'unsupported':
      return ['NOT APPLIED · WEB AUDIO UNAVAILABLE', 'error'];
    case 'inactive':
      return ['READY · APPLIES TO READABLE SOURCES', 'idle'];
  }
}

export function EqStatusLine() {
  const analysis = usePlayback((s) => s.analysis);
  const enabled = useSettings((s) => s.eq.enabled);
  const [text, tone] = eqStatus(analysis, enabled);
  return (
    <p className="eq__status">
      <Status tone={tone}>{text}</Status>
    </p>
  );
}

export function EqPresetSelect({ id, compact }: { id?: string; compact?: boolean }) {
  const eq = useSettings((s) => s.eq);
  const update = useSettings((s) => s.update);
  const fallbackId = useId();
  return (
    <select
      id={id ?? fallbackId}
      className={`select ${compact ? 'eq__preset--compact' : ''}`}
      aria-label="EQ preset"
      value={eq.preset}
      onChange={(e) => update({ eq: applyPreset(eq, e.currentTarget.value) })}
    >
      {EQ_PRESETS.map((p) => (
        <option key={p.id} value={p.id}>
          {p.label}
        </option>
      ))}
      {eq.preset === 'custom' && <option value="custom">Custom</option>}
    </select>
  );
}

/** Full EQ controls for the Audio module and Settings. */
export function EqControls() {
  const eq = useSettings((s) => s.eq);
  const update = useSettings((s) => s.update);
  const presetId = useId();
  return (
    <div className="eq">
      <div className="field">
        <label className="field__label" htmlFor={presetId}>
          EQ
        </label>
        <div className="eq__head">
          <EqPresetSelect id={presetId} />
          <button
            type="button"
            role="switch"
            className="toggle"
            aria-checked={eq.enabled}
            aria-label="Equalizer on"
            onClick={() => update({ eq: { ...eq, enabled: !eq.enabled } })}
          >
            <span className="toggle__track" aria-hidden="true" />
          </button>
        </div>
      </div>
      {(['bass', 'mid', 'treble'] as const).map((band) => (
        <div key={band} className="field eq__band">
          <span className="field__label">{band[0]!.toUpperCase() + band.slice(1)}</span>
          <span className="eq__slider">
            <Slider
              value={eq[band]}
              min={-EQ_LIMIT_DB}
              max={EQ_LIMIT_DB}
              step={1}
              disabled={!eq.enabled}
              label={`${band} gain`}
              valueText={fmt(eq[band])}
              onChange={(v) => update({ eq: setBand(eq, band, v) })}
            />
            <span className="eq__value">{fmt(eq[band])}</span>
          </span>
        </div>
      ))}
      <EqStatusLine />
    </div>
  );
}

/** Compact EQ readout for the Now Playing panel, like the reference design. */
export function EqSummary() {
  const eq = useSettings((s) => s.eq);
  const analysis = usePlayback((s) => s.analysis);
  const [, tone] = eqStatus(analysis, eq.enabled);
  const short = (db: number) => `${db > 0 ? '+' : ''}${db}`;
  return (
    <div className={`eq-summary eq-summary--${tone}`} title={eqStatus(analysis, eq.enabled)[0]}>
      <EqPresetSelect compact />
      <span className="eq-summary__band">BASS {short(eq.bass)}</span>
      <span className="eq-summary__band">MID {short(eq.mid)}</span>
      <span className="eq-summary__band">TREBLE {short(eq.treble)}</span>
    </div>
  );
}
