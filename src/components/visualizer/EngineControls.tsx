import { useId } from 'react';
import { useSettings } from '../../stores/settingsStore';
import { DEFAULT_ANALYSIS, DEFAULT_RENDER, DPR_CAPS, FFT_SIZES, type DprCap, type FftSize, type FrameLimit } from '../../types/advanced';
import { Segmented, Slider, Toggle } from '../ui/controls';

const FRAME_OPTIONS = [
  { value: 'auto', label: 'Auto' },
  { value: '60', label: '60' },
  { value: '30', label: '30' },
] as const;

/**
 * Advanced analysis/visualizer engine settings (VIS §90). Changes apply
 * live; audio playback is never restarted.
 */
export function EngineControls() {
  const analysis = useSettings((s) => s.analysis);
  const render = useSettings((s) => s.render);
  const update = useSettings((s) => s.update);
  const fftId = useId();
  const deviceDpr = typeof window === 'undefined' ? 1 : window.devicePixelRatio || 1;
  const binHz = Math.round(48000 / analysis.fftSize);

  return (
    <div className="viz-controls">
      <div className="field">
        <label className="field__label" htmlFor={fftId}>
          FFT size
        </label>
        <select
          id={fftId}
          className="select"
          value={analysis.fftSize}
          onChange={(e) => update({ analysis: { ...analysis, fftSize: Number(e.currentTarget.value) as FftSize } })}
        >
          {FFT_SIZES.map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
      </div>
      <p className="control-note muted">
        {analysis.fftSize / 2} frequency bins, about {binHz} Hz each at 48 kHz. Larger = finer frequency detail, slower reaction.
      </p>
      <div className="field viz-controls__slider">
        <span className="field__label">Analysis smoothing</span>
        <span className="eq__slider">
          <Slider
            value={analysis.smoothing}
            min={0}
            max={0.95}
            step={0.05}
            label="Analysis smoothing"
            valueText={analysis.smoothing.toFixed(2)}
            onChange={(v) => update({ analysis: { ...analysis, smoothing: Math.round(v * 100) / 100 } })}
          />
          <span className="eq__value">{analysis.smoothing.toFixed(2)}</span>
        </span>
      </div>
      <div className="field">
        <span className="field__label">Frame limit</span>
        <Segmented
          label="Frame limit"
          value={String(render.frameLimit)}
          options={FRAME_OPTIONS}
          onChange={(v) => update({ render: { ...render, frameLimit: (v === 'auto' ? 'auto' : Number(v)) as FrameLimit } })}
        />
      </div>
      <div className="field">
        <span className="field__label">DPR cap</span>
        <Segmented
          label="Device pixel ratio cap"
          value={String(render.dprCap)}
          options={DPR_CAPS.map((d) => ({ value: String(d), label: `${d}×` }))}
          onChange={(v) => update({ render: { ...render, dprCap: Number(v) as DprCap } })}
        />
      </div>
      <p className="control-note muted">This screen reports a device pixel ratio of {deviceDpr}. Canvas resolution uses the lower of the two.</p>
      <div className="field">
        <span className="field__label">Debug</span>
        <Toggle checked={render.debug} onChange={(v) => update({ render: { ...render, debug: v } })} label="Show render diagnostics on Now Playing" />
      </div>
      <div className="viz-controls__footer">
        <button type="button" className="btn" onClick={() => update({ analysis: DEFAULT_ANALYSIS, render: DEFAULT_RENDER })}>
          Reset engine defaults
        </button>
      </div>
    </div>
  );
}
