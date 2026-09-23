import { useId } from 'react';
import { visualizerRegistry } from '../../services/visualizers/registry';
import { useSettings } from '../../stores/settingsStore';
import { DEFAULT_VISUALIZER, type FrequencyScale, type VisualizerColorMode, type VisualizerId, type VisualizerSettings } from '../../types/visualizer';
import { Segmented, Slider, Toggle } from '../ui/controls';

const COLOR_OPTIONS = [
  { value: 'theme', label: 'Theme' },
  { value: 'accent', label: 'Accent' },
  { value: 'dual', label: 'Dual' },
  { value: 'mono', label: 'Mono' },
] as const satisfies ReadonlyArray<{ value: VisualizerColorMode; label: string }>;

const SCALE_OPTIONS = [
  { value: 'log', label: 'Log' },
  { value: 'linear', label: 'Linear' },
] as const satisfies ReadonlyArray<{ value: FrequencyScale; label: string }>;

const pct = (v: number) => `${Math.round(v * 100)}%`;

function useVisualizerSettings() {
  const settings = useSettings((s) => s.visualizer);
  const update = useSettings((s) => s.update);
  const set = (patch: Partial<VisualizerSettings>) => update({ visualizer: { ...settings, ...patch } });
  return [settings, set] as const;
}

function StyleSelect({ id }: { id?: string }) {
  const [settings, set] = useVisualizerSettings();
  const fallback = useId();
  return (
    <select id={id ?? fallback} className="select" aria-label="Visualizer style" value={settings.type} onChange={(e) => set({ type: e.currentTarget.value as VisualizerId })}>
      {visualizerRegistry.getAll().map((d) => (
        <option key={d.id} value={d.id}>
          {d.name}
        </option>
      ))}
    </select>
  );
}

function SliderRow({ label, value, onChange, disabled }: { label: string; value: number; onChange(v: number): void; disabled?: boolean }) {
  return (
    <div className="field viz-controls__slider">
      <span className="field__label">{label}</span>
      <span className="eq__slider">
        <Slider value={value} onChange={onChange} label={label} valueText={pct(value)} disabled={disabled} />
        <span className="eq__value">{pct(value)}</span>
      </span>
    </div>
  );
}

/** Compact controls for the Visualizer module in the control strip. */
export function VisualizerQuickControls() {
  const [settings, set] = useVisualizerSettings();
  const styleId = useId();
  return (
    <>
      <div className="field">
        <label className="field__label" htmlFor={styleId}>
          Style
        </label>
        <StyleSelect id={styleId} />
      </div>
      <div className="field">
        <span className="field__label">Visualizer</span>
        <Toggle checked={settings.enabled} onChange={(v) => set({ enabled: v })} label="Visualizer on" />
      </div>
      <SliderRow label="Sensitivity" value={settings.sensitivity} onChange={(v) => set({ sensitivity: v })} disabled={!settings.enabled} />
    </>
  );
}

/**
 * All user visualizer settings (VIS §29, §64). Only the settings the
 * selected visualizer actually uses are shown.
 */
export function VisualizerControls() {
  const [settings, set] = useVisualizerSettings();
  const def = visualizerRegistry.get(settings.type);
  const caps = def?.capabilities;
  const styleId = useId();
  const off = !settings.enabled;

  return (
    <div className="viz-controls">
      <div className="field">
        <span className="field__label">Visualizer</span>
        <Toggle checked={settings.enabled} onChange={(v) => set({ enabled: v })} label="Visualizer on" />
      </div>
      <div className="field">
        <label className="field__label" htmlFor={styleId}>
          Style
        </label>
        <StyleSelect id={styleId} />
      </div>
      {def && <p className="control-note muted">{def.description}</p>}
      <SliderRow label="Intensity" value={settings.intensity} onChange={(v) => set({ intensity: v })} disabled={off} />
      <SliderRow label="Sensitivity" value={settings.sensitivity} onChange={(v) => set({ sensitivity: v })} disabled={off} />
      {caps?.smoothing && <SliderRow label="Smoothing" value={settings.smoothing} onChange={(v) => set({ smoothing: v })} disabled={off} />}
      <div className="field">
        <span className="field__label">Color</span>
        <Segmented label="Color mode" value={settings.colorMode} options={COLOR_OPTIONS} onChange={(v) => set({ colorMode: v })} />
      </div>
      {caps?.scale && (
        <div className="field">
          <span className="field__label">Scale</span>
          <Segmented label="Frequency scale" value={settings.scale} options={SCALE_OPTIONS} onChange={(v) => set({ scale: v })} />
        </div>
      )}
      {caps?.glow && (
        <div className="field">
          <span className="field__label">Glow</span>
          <Toggle checked={settings.glow} onChange={(v) => set({ glow: v })} label="Visualizer glow" />
        </div>
      )}
      {caps?.mirror && (
        <div className="field">
          <span className="field__label">Mirror</span>
          <Toggle checked={settings.mirror} onChange={(v) => set({ mirror: v })} label="Mirror mode" />
        </div>
      )}
      {caps?.peakHold && (
        <div className="field">
          <span className="field__label">Peak hold</span>
          <Toggle checked={settings.peakHold} onChange={(v) => set({ peakHold: v })} label="Peak hold" />
        </div>
      )}
      <div className="viz-controls__footer">
        <button type="button" className="btn" onClick={() => set({ ...DEFAULT_VISUALIZER, enabled: settings.enabled })}>
          Reset to defaults
        </button>
      </div>
    </div>
  );
}
