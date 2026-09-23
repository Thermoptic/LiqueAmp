import { usePlayback } from '../../stores/playbackStore';
import { ImportPanel } from '../import/ImportPanel';
import { AnalysisReadout } from './AnalysisReadout';
import { Status } from '../ui/controls';

/**
 * Import sources into the library (same pipeline as the Library header's
 * Import button) plus live engine diagnostics for the current item.
 */
export function MediaSection() {
  return (
    <div className="control-stack">
      <section className="panel">
        <header className="panel__header">
          <h2 className="panel__title">Import source</h2>
        </header>
        <div className="panel__body">
          <ImportPanel />
          <NowPlayingDiagnostics />
          <AnalysisReadout />
        </div>
      </section>
    </div>
  );
}

/** What the engine is actually doing with the current item. */
function NowPlayingDiagnostics() {
  const current = usePlayback((s) => s.currentItem);
  const status = usePlayback((s) => s.status);
  const analysis = usePlayback((s) => s.analysis);
  const activeUrl = usePlayback((s) => s.activeUrl);
  const info = usePlayback((s) => s.streamInfo);
  const error = usePlayback((s) => s.error);
  if (!current) return null;
  const rows: Array<[string, React.ReactNode]> = [
    ['Now playing', current.title],
    ['Playing URL', activeUrl ?? '—'],
    ['State', <Status tone={status === 'error' ? 'error' : status === 'playing' ? 'ok' : 'idle'}>{status.toUpperCase()}</Status>],
    [
      'Audio analysis',
      analysis === 'available'
        ? 'Available — samples are readable (CORS or HLS via Media Source)'
        : analysis === 'cors-blocked'
          ? 'Not available — the source does not send CORS headers'
          : analysis === 'unsupported'
            ? 'Not available — Web Audio could not start'
            : '—',
    ],
    ['Codec', info?.codec ?? '—'],
    ['Bitrate', info?.bitrateKbps ? `${info.bitrateKbps} kbps` : '—'],
    ['Metadata source', info ? (info.source === 'hls-manifest' ? 'HLS manifest' : 'HTTP response headers') : 'Not readable'],
  ];
  if (error) rows.push(['Error', `${error.title}: ${error.message}`]);
  return (
    <>
      <h3 className="settings-group__title control-subtitle">Engine</h3>
      <dl className="kv-list">
        {rows.map(([k, v]) => (
          <div key={k} className="kv-list__row">
            <dt>{k}</dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>
    </>
  );
}
