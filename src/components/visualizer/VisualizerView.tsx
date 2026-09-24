import { useEffect, useRef, useState } from 'react';
import { Maximize2 } from 'lucide-react';
import { getAnalysis } from '../../services/analysis/shared';
import { visualizerRegistry } from '../../services/visualizers/registry';
import { buildRenderConfig, resolvePalette, VisualizerRenderer } from '../../services/visualizers/renderer';
import { usePlayback, type AnalysisAvailability, type PlaybackStatus } from '../../stores/playbackStore';
import { useSettings } from '../../stores/settingsStore';
import { useThemes } from '../../stores/themeStore';
import { useUi } from '../../stores/uiStore';
import { useReducedMotion } from './useReducedMotion';

const UNAVAILABLE_TEXT: Record<Exclude<AnalysisAvailability, 'available'>, string> = {
  inactive: 'VISUALIZER · NO AUDIO SIGNAL',
  'cors-blocked': 'VISUALIZER UNAVAILABLE · THIS SOURCE DOES NOT ALLOW BROWSER AUDIO ANALYSIS',
  unsupported: 'VISUALIZER UNAVAILABLE · WEB AUDIO IS NOT AVAILABLE',
  'provider-restricted': 'VISUALIZER UNAVAILABLE · THE PROVIDER DOES NOT EXPOSE RAW AUDIO FOR BROWSER ANALYSIS',
};

const FLOWING: ReadonlySet<PlaybackStatus> = new Set(['playing', 'buffering', 'loading']);

/**
 * The canvas visualizer plus honest states around it. React only handles
 * configuration and availability; every frame is drawn by the renderer
 * outside React (VIS §71–72).
 */
interface VisualizerViewProps {
  className?: string;
  allowFullscreen?: boolean;
  /**
   * Measured renderer diagnostics (VIS §91): below the canvas, or on top of
   * it (no layout change) when turned on via /control › Visualizers › Debug.
   */
  diagnostics?: 'below' | 'overlay' | false;
}

export function VisualizerView({ className = '', allowFullscreen = false, diagnostics = false }: VisualizerViewProps) {
  const settings = useSettings((s) => s.visualizer);
  const update = useSettings((s) => s.update);
  const analysis = usePlayback((s) => s.analysis);
  const status = usePlayback((s) => s.status);
  const item = usePlayback((s) => s.currentItem);
  const themeId = useSettings((s) => s.activeThemeId);
  const glowLevel = useSettings((s) => s.glowLevel);
  const themes = useThemes((s) => s.themes);
  const reducedMotion = useReducedMotion();
  const limits = useSettings((s) => s.render);

  const rootRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<VisualizerRenderer | null>(null);
  const [error, setError] = useState<string | null>(null);

  const enabled = settings.enabled && !error;
  const available = analysis === 'available';
  const def = visualizerRegistry.get(settings.type);

  // Renderer exists only while the visualizer is on and there is readable
  // audio; otherwise everything is released (VIS §54).
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!enabled || !available || !canvas) return;
    let renderer: VisualizerRenderer;
    try {
      renderer = new VisualizerRenderer(canvas, getAnalysis(), (e) => setError(e instanceof Error ? e.message : String(e)));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      return;
    }
    rendererRef.current = renderer;
    return () => {
      renderer.destroy();
      rendererRef.current = null;
    };
  }, [enabled, available]);

  useEffect(() => {
    rendererRef.current?.setVisualizer(settings.type);
  }, [settings.type, enabled, available]);

  // Theme, glow and settings changes apply live, without restarting audio (VIS §63).
  useEffect(() => {
    const renderer = rendererRef.current;
    const canvas = canvasRef.current;
    if (!renderer || !canvas) return;
    const glowAmount = Number(getComputedStyle(canvas).getPropertyValue('--la-glow-amount')) || 0;
    const palette = resolvePalette(canvas, settings.colorMode);
    renderer.configure(buildRenderConfig(settings, palette, { reducedMotion, glowAmount }, renderer.devicePixelRatio), reducedMotion);
  }, [settings, themeId, glowLevel, themes, reducedMotion, enabled, available]);

  useEffect(() => {
    rendererRef.current?.setLimits(limits.frameLimit === 'auto' ? null : limits.frameLimit, limits.dprCap);
  }, [limits, enabled, available]);

  useEffect(() => {
    rendererRef.current?.setActive(FLOWING.has(status));
  }, [status, enabled, available]);

  const [stats, setStats] = useState<string | null>(null);
  // Diagnostics refresh twice a second from measured values — never per frame.
  useEffect(() => {
    if (!diagnostics) return;
    const id = window.setInterval(() => {
      const r = rendererRef.current;
      const canvas = canvasRef.current;
      if (!r || !canvas || !r.running) return setStats(null);
      const { fps, frameMs } = r.stats;
      setStats(`RENDER ${fps || '—'} fps · ${frameMs.toFixed(2)} ms/frame · canvas ${canvas.width}×${canvas.height} px · DPR ${r.devicePixelRatio}`);
    }, 500);
    return () => window.clearInterval(id);
  }, [diagnostics]);

  const name = def?.name ?? 'Visualizer';
  let overlay: string | null = null;
  if (error) overlay = 'VISUALIZER ERROR · AUDIO ANALYSIS CANNOT BE DRAWN';
  else if (!settings.enabled) overlay = 'VISUALIZER OFF';
  else if (!available) overlay = UNAVAILABLE_TEXT[analysis];

  // VIS §85: the canvas is labelled; messages are plain visible text.
  const label = `${name} visualizer. ${status === 'playing' ? 'Playback active.' : status === 'paused' ? 'Playback paused.' : `Playback ${status}.`}`;

  const fullscreen = () => {
    const el = rootRef.current;
    if (!el) return;
    if (document.fullscreenElement) void document.exitFullscreen();
    else void el.requestFullscreen?.().catch(() => useUi.getState().toast('Fullscreen was blocked by the browser', 'error'));
  };

  const view = (
    <div ref={rootRef} className={`viz ${className}`} data-analysis={analysis} data-state={overlay ? 'message' : 'live'}>
      <canvas
        ref={canvasRef}
        className="viz__canvas"
        role={overlay ? undefined : 'img'}
        aria-label={overlay ? undefined : label}
        aria-hidden={overlay ? true : undefined}
        onClick={() => document.fullscreenElement && void document.exitFullscreen()}
      />
      {overlay && (
        <div className="viz__message">
          <span>{overlay}</span>
          {error && (
            <span className="viz__error-actions">
              <button type="button" className="btn" onClick={() => setError(null)}>
                Retry
              </button>
              <button
                type="button"
                className="btn"
                onClick={() => {
                  setError(null);
                  update({ visualizer: { ...settings, enabled: false } });
                }}
              >
                Disable visualizer
              </button>
            </span>
          )}
        </div>
      )}
      {allowFullscreen && !overlay && document.fullscreenEnabled && (
        <button type="button" className="viz__fullscreen" onClick={fullscreen} aria-label="Toggle fullscreen visualizer" title="Fullscreen (Esc to exit)">
          <Maximize2 size={13} aria-hidden="true" />
        </button>
      )}
      {diagnostics === 'overlay' && <p className="viz__debug">{stats ?? 'RENDER LOOP IDLE'}</p>}
      {allowFullscreen && item && (
        <p className="viz__caption" aria-hidden="true">
          {item.artist ? `${item.artist} — ${item.title}` : item.title}
          <span className="viz__caption-hint">ESC OR CLICK TO EXIT</span>
        </p>
      )}
    </div>
  );
  if (diagnostics !== 'below') return view;
  return (
    <>
      {view}
      <p className="muted control-note viz-diagnostics">{stats ?? 'RENDER LOOP IDLE · nothing is being drawn'}</p>
    </>
  );
}
