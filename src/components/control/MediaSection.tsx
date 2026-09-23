import { useId, useState } from 'react';
import { ListPlus, Play } from 'lucide-react';
import { getEngine } from '../../services/playback/engine';
import { createId, nowIso } from '../../lib/id';
import { titleFromUrl } from '../../lib/format';
import { usePlayback } from '../../stores/playbackStore';
import { useUi } from '../../stores/uiStore';
import type { MediaItem } from '../../types/media';
import { PendingTag, Status } from '../ui/controls';

function testItem(url: string): MediaItem {
  const now = nowIso();
  return {
    id: createId('test'),
    provider: 'direct',
    title: titleFromUrl(url),
    sourceUrl: url,
    playbackType: 'direct',
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * "Test sources" (SPEC §35): plays a URL through the real engine without
 * saving it to the library. The full import pipeline comes with URL import.
 */
export function MediaSection() {
  const [url, setUrl] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const inputId = useId();
  const toast = useUi((s) => s.toast);
  const current = usePlayback((s) => s.currentItem);
  const status = usePlayback((s) => s.status);
  const analysis = usePlayback((s) => s.analysis);
  const error = usePlayback((s) => s.error);

  function parse(): string | null {
    const trimmed = url.trim();
    try {
      const u = new URL(trimmed);
      if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new Error();
      setProblem(null);
      return u.href;
    } catch {
      setProblem('Enter a full http:// or https:// URL.');
      return null;
    }
  }

  return (
    <div className="control-stack">
      <section className="panel">
        <header className="panel__header">
          <h2 className="panel__title">Test source</h2>
        </header>
        <div className="panel__body">
          <form
            className="test-source"
            onSubmit={(e) => {
              e.preventDefault();
              const href = parse();
              if (href) void getEngine().playNow(testItem(href));
            }}
          >
            <label htmlFor={inputId} className="field__label">
              Direct audio or stream URL
            </label>
            <div className="test-source__row">
              <input
                id={inputId}
                className="input"
                type="url"
                inputMode="url"
                placeholder="https://example.com/stream.mp3"
                value={url}
                onChange={(e) => setUrl(e.currentTarget.value)}
              />
              <button type="submit" className="btn btn--primary">
                <Play size={14} aria-hidden="true" /> Play now
              </button>
              <button
                type="button"
                className="btn"
                onClick={() => {
                  const href = parse();
                  if (!href) return;
                  getEngine().enqueue([testItem(href)]);
                  toast('Added to queue', 'success');
                }}
              >
                <ListPlus size={14} aria-hidden="true" /> Add to queue
              </button>
            </div>
            {problem && (
              <p className="form-error" role="alert">
                {problem}
              </p>
            )}
          </form>
          <p className="muted control-note">
            Plays through the real playback engine but is not saved to your library. Playlist files (M3U/PLS) and provider links are not
            resolved yet.
          </p>
          {current && (
            <dl className="kv-list">
              <div className="kv-list__row">
                <dt>Source</dt>
                <dd>{current.sourceUrl}</dd>
              </div>
              <div className="kv-list__row">
                <dt>State</dt>
                <dd>
                  <Status tone={status === 'error' ? 'error' : status === 'playing' ? 'ok' : 'idle'}>{status.toUpperCase()}</Status>
                </dd>
              </div>
              <div className="kv-list__row">
                <dt>Audio analysis</dt>
                <dd>
                  {analysis === 'available'
                    ? 'Available — the source allows CORS, audio is routed through Web Audio'
                    : analysis === 'cors-blocked'
                      ? 'Not available — the source does not send CORS headers, played without Web Audio'
                      : analysis === 'unsupported'
                        ? 'Not available — Web Audio could not start'
                        : '—'}
                </dd>
              </div>
              {error && (
                <div className="kv-list__row">
                  <dt>Error</dt>
                  <dd>
                    {error.title}: {error.message}
                  </dd>
                </div>
              )}
            </dl>
          )}
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
