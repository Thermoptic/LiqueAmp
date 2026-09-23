import { useEffect, useRef } from 'react';
import { getAnalysis } from '../../services/analysis/shared';

const METERS = ['rms', 'peak', 'bass', 'mid', 'treble'] as const;

/**
 * Live analysis diagnostics (VIS §91). Values come straight from the
 * AnalyserNode each animation frame and are written to the DOM directly —
 * no React state at frame rate (VIS §71). When no readable audio exists the
 * readout says so instead of showing anything.
 */
export function AnalysisReadout() {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const analysis = getAnalysis();
    const bars = new Map(METERS.map((m) => [m, root.querySelector<HTMLElement>(`[data-meter="${m}"]`)]));
    const values = new Map(METERS.map((m) => [m, root.querySelector<HTMLElement>(`[data-value="${m}"]`)]));
    const state = root.querySelector<HTMLElement>('[data-state]');
    const meta = root.querySelector<HTMLElement>('[data-meta]');
    let frameId = 0;
    let frames = 0;
    let fpsStart = performance.now();
    let fps = 0;

    const tick = (now: number) => {
      frameId = requestAnimationFrame(tick);
      const frame = analysis.read(now);
      frames++;
      if (now - fpsStart >= 1000) {
        fps = Math.round((frames * 1000) / (now - fpsStart));
        frames = 0;
        fpsStart = now;
      }
      if (!frame) {
        root.dataset.available = 'false';
        if (state) state.textContent = 'NO READABLE AUDIO — nothing to analyse for the current source';
        return;
      }
      root.dataset.available = 'true';
      if (state) state.textContent = frame.isPlaying ? 'ANALYSING LIVE AUDIO' : 'SIGNAL ROUTED · PLAYBACK PAUSED';
      if (meta) meta.textContent = `FFT ${frame.waveform.length} · ${frame.frequency.length} bins · ${frame.sampleRate} Hz · ${fps} fps (measured)`;
      for (const m of METERS) {
        const v = frame[m];
        bars.get(m)?.style.setProperty('--level', String(v));
        const el = values.get(m);
        if (el) el.textContent = v.toFixed(3);
      }
    };
    frameId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frameId);
  }, []);

  return (
    <div className="analysis-readout" ref={rootRef} data-available="false">
      <h3 className="settings-group__title control-subtitle">Audio analysis</h3>
      <p className="analysis-readout__state" data-state aria-live="off" />
      <div className="analysis-readout__meters">
        {METERS.map((m) => (
          <div key={m} className="analysis-readout__row">
            <span>{m.toUpperCase()}</span>
            <span className="analysis-readout__bar" data-meter={m} />
            <span className="analysis-readout__value" data-value={m}>
              —
            </span>
          </div>
        ))}
      </div>
      <p className="muted control-note" data-meta />
    </div>
  );
}
