import { usePlayback } from '../../stores/playbackStore';
import { Status } from '../ui/controls';
import { VisualizerControls } from '../visualizer/VisualizerControls';
import { VisualizerView } from '../visualizer/VisualizerView';

/**
 * Visualizer settings with a live preview of the current audio. The preview
 * uses the same renderer as Now Playing; changing anything here never
 * touches playback (VIS §50).
 */
export function VisualizersSection() {
  const analysis = usePlayback((s) => s.analysis);
  return (
    <div className="control-stack">
      <section className="panel">
        <header className="panel__header">
          <h2 className="panel__title">Visualizers</h2>
          <div className="panel__actions">
            <Status tone={analysis === 'available' ? 'ok' : 'idle'}>{analysis === 'available' ? 'REAL AUDIO ANALYSIS' : 'NO READABLE AUDIO'}</Status>
          </div>
        </header>
        <div className="panel__body viz-section">
          <div className="viz-section__preview">
            <VisualizerView className="viz-section__canvas" diagnostics />
          </div>
          <VisualizerControls />
        </div>
      </section>
    </div>
  );
}
