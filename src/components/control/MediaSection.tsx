import { useId, useState } from 'react';
import { ListPlus, Play, Search } from 'lucide-react';
import { getEngine } from '../../services/playback/engine';
import { detectSource, InvalidUrlError, type Detection } from '../../services/providers/detect';
import { resolveDirect, type DirectResolution } from '../../services/providers/direct';
import { ProviderError } from '../../services/providers/errors';
import { formatTime } from '../../lib/format';
import { usePlayback } from '../../stores/playbackStore';
import { useUi } from '../../stores/uiStore';
import { PendingTag, Status } from '../ui/controls';
import { PROVIDER_LABEL } from '../player/NowPlayingPanel';

type ResolveState =
  | { phase: 'idle' }
  | { phase: 'resolving' }
  | { phase: 'error'; title: string; message: string }
  | { phase: 'other-provider'; detection: Detection }
  | { phase: 'ready'; result: DirectResolution };

const KIND_LABEL: Record<string, string> = {
  audio: 'Audio file',
  stream: 'Direct stream',
  hls: 'HLS stream',
  playlist: 'Playlist',
};

/**
 * Resolves a URL through the real provider pipeline (detect → normalize →
 * resolve) and plays it, without saving anything to the library. Saving with a
 * preview is part of URL import.
 */
export function MediaSection() {
  const [url, setUrl] = useState('');
  const [state, setState] = useState<ResolveState>({ phase: 'idle' });
  const inputId = useId();
  const toast = useUi((s) => s.toast);

  async function resolve() {
    let detection: Detection;
    try {
      detection = detectSource(url);
    } catch (err) {
      setState({ phase: 'error', title: 'INVALID URL', message: err instanceof InvalidUrlError ? err.message : String(err) });
      return;
    }
    if (detection.kind === 'unsupported') {
      setState({ phase: 'error', title: 'UNSUPPORTED SOURCE', message: detection.reason ?? 'This address cannot be played.' });
      return;
    }
    if (detection.provider !== 'direct') {
      setState({ phase: 'other-provider', detection });
      return;
    }
    setState({ phase: 'resolving' });
    try {
      setState({ phase: 'ready', result: await resolveDirect(detection.normalizedUrl) });
    } catch (err) {
      setState(
        err instanceof ProviderError
          ? { phase: 'error', title: err.title, message: err.message }
          : { phase: 'error', title: 'UNKNOWN ERROR', message: String(err) },
      );
    }
  }

  return (
    <div className="control-stack">
      <section className="panel">
        <header className="panel__header">
          <h2 className="panel__title">Resolve source</h2>
        </header>
        <div className="panel__body">
          <form
            className="test-source"
            onSubmit={(e) => {
              e.preventDefault();
              void resolve();
            }}
          >
            <label htmlFor={inputId} className="field__label">
              Stream, audio file, playlist (M3U/PLS) or HLS URL
            </label>
            <div className="test-source__row">
              <input
                id={inputId}
                className="input"
                type="text"
                inputMode="url"
                autoComplete="off"
                spellCheck={false}
                placeholder="https://example.com/stream.mp3"
                value={url}
                onChange={(e) => setUrl(e.currentTarget.value)}
              />
              <button type="submit" className="btn btn--primary" disabled={!url.trim() || state.phase === 'resolving'}>
                <Search size={14} aria-hidden="true" /> Resolve
              </button>
            </div>
          </form>
          <p className="muted control-note">Resolved sources play through the real engine but are not saved to your library.</p>

          <div aria-live="polite">
            {state.phase === 'resolving' && <p className="muted">RESOLVING…</p>}
            {state.phase === 'error' && (
              <div className="now-playing__error" role="alert">
                <Status tone="error">{state.title}</Status>
                <p>{state.message}</p>
              </div>
            )}
            {state.phase === 'other-provider' && (
              <div className="resolve-result">
                <DetectionTable detection={state.detection} />
                <p className="muted">
                  {PROVIDER_LABEL[state.detection.provider ?? ''] ?? state.detection.provider} sources are recognised, but their playback
                  integration is not built yet.
                </p>
              </div>
            )}
            {state.phase === 'ready' && (
              <ResolvedItems
                result={state.result}
                onQueued={(n) => toast(n === 1 ? 'Added to queue' : `${n} items added to queue`, 'success')}
              />
            )}
          </div>
          <NowPlayingDiagnostics />
        </div>
      </section>
      <section className="panel">
        <header className="panel__header">
          <h2 className="panel__title">Library media</h2>
          <div className="panel__actions">
            <PendingTag />
          </div>
        </header>
        <div className="panel__body">
          <p className="muted">Adding, editing and organising saved media arrives with the library and URL import.</p>
        </div>
      </section>
    </div>
  );
}

function DetectionTable({ detection, kind }: { detection: Detection; kind?: string }) {
  return (
    <dl className="kv-list">
      <div className="kv-list__row">
        <dt>Provider</dt>
        <dd>{PROVIDER_LABEL[detection.provider ?? ''] ?? '—'}</dd>
      </div>
      <div className="kv-list__row">
        <dt>Type</dt>
        <dd>
          {kind ?? detection.kind} · {detection.confidence} confidence
        </dd>
      </div>
      <div className="kv-list__row">
        <dt>Normalized URL</dt>
        <dd>{detection.normalizedUrl}</dd>
      </div>
      {detection.providerItemId && (
        <div className="kv-list__row">
          <dt>Provider ID</dt>
          <dd>{detection.providerItemId}</dd>
        </div>
      )}
    </dl>
  );
}

function ResolvedItems({ result, onQueued }: { result: DirectResolution; onQueued(n: number): void }) {
  const engine = getEngine();
  return (
    <div className="resolve-result">
      <DetectionTable detection={result.detection} kind={KIND_LABEL[result.kind]} />
      {result.notes.map((n) => (
        <p key={n} className="muted control-note">
          {n}
        </p>
      ))}
      <div className="test-source__row">
        <button type="button" className="btn btn--primary" onClick={() => void engine.playList(result.items)}>
          <Play size={14} aria-hidden="true" /> {result.items.length > 1 ? `Play all (${result.items.length})` : 'Play now'}
        </button>
        <button
          type="button"
          className="btn"
          onClick={() => {
            engine.enqueue(result.items);
            onQueued(result.items.length);
          }}
        >
          <ListPlus size={14} aria-hidden="true" /> Add to queue
        </button>
      </div>
      {result.items.length > 1 && (
        <ol className="row-list resolve-result__list" aria-label="Playlist entries">
          {result.items.map((item, i) => (
            <li key={item.id} className="row">
              <span className="row__index">{String(i + 1).padStart(2, '0')}</span>
              <span className="truncate" title={item.streamUrl ?? undefined}>
                {item.title}
              </span>
              <span className="queue-row__meta">
                <span className="row__index">{item.duration ? formatTime(item.duration) : 'LIVE'}</span>
                <button type="button" className="btn btn--ghost btn--icon" aria-label={`Play ${item.title}`} onClick={() => void engine.playNow(item)}>
                  <Play size={14} />
                </button>
              </span>
            </li>
          ))}
        </ol>
      )}
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
