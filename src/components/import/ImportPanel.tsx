import { useId, useState } from 'react';
import { Check, ListPlus, Play, Save, Search } from 'lucide-react';
import { applyEdits, previewImport, type ImportPreview, type ImportStep } from '../../services/import/importer';
import { getEngine } from '../../services/playback/engine';
import { formatTime } from '../../lib/format';
import { useLibrary } from '../../stores/libraryStore';
import { useUi } from '../../stores/uiStore';
import { PROVIDER_LABEL } from '../player/NowPlayingPanel';
import { Status } from '../ui/controls';
import { RowList } from '../ui/RowList';
import { useSettings } from '../../stores/settingsStore';

const KIND_LABEL: Record<string, string> = {
  audio: 'Audio file',
  stream: 'Direct stream',
  hls: 'HLS stream',
  playlist: 'Playlist',
  provider: 'Provider item',
};

function playbackNote(item: { provider: string; playbackType: string }): string {
  const name = PROVIDER_LABEL[item.provider] ?? item.provider;
  if (item.playbackType === 'external') return `Opens on ${name}; it cannot be played inside LIQUEAMP.`;
  if (item.playbackType === 'embed') {
    const base = `Official ${name} player, embedded. LIQUEAMP controls it but cannot read its audio, so there is no visualizer or EQ.`;
    return item.provider === 'spotify'
      ? `${base} Spotify decides what plays: full tracks if you are logged in to Spotify in this browser, otherwise previews. Volume is set in the Spotify player.`
      : base;
  }
  return 'Native audio in the browser. Whether it plays, and whether analysis works, is known when it plays (CORS, codec).';
}

const STEP_LABEL: Record<ImportStep, string> = {
  detecting: 'DETECTING SOURCE…',
  resolving: 'RESOLVING MEDIA…',
};

type Phase = { kind: 'idle' } | { kind: 'running'; step: ImportStep } | { kind: 'done'; preview: ImportPreview };

/**
 * Paste a URL, see what it is, decide what to import (PROVIDERS §60).
 * Nothing is written to the library until the user saves.
 */
export function ImportPanel({ onDone }: { onDone?(): void }) {
  const [url, setUrl] = useState('');
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' });
  const inputId = useId();

  async function run() {
    const preview = await previewImport(url, {
      library: useLibrary.getState().media,
      onStep: (step) => setPhase({ kind: 'running', step }),
      isProviderEnabled: (p) => useSettings.getState().providers[p]?.enabled !== false,
    });
    setPhase({ kind: 'done', preview });
  }

  return (
    <div className="import">
      <form
        className="test-source"
        onSubmit={(e) => {
          e.preventDefault();
          void run();
        }}
      >
        <label htmlFor={inputId} className="field__label">
          Stream, audio file, playlist (M3U/PLS), HLS or provider URL
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
            data-autofocus
            onChange={(e) => {
              setUrl(e.currentTarget.value);
              if (phase.kind === 'done') setPhase({ kind: 'idle' });
            }}
          />
          <button type="submit" className="btn btn--primary" disabled={!url.trim() || phase.kind === 'running'}>
            <Search size={14} aria-hidden="true" /> Resolve
          </button>
        </div>
      </form>

      <div aria-live="polite">
        {phase.kind === 'running' && <p className="import__step">{STEP_LABEL[phase.step]}</p>}
        {phase.kind === 'done' && phase.preview.status === 'error' && (
          <div className="now-playing__error" role="alert">
            <Status tone="error">{phase.preview.title}</Status>
            <p>{phase.preview.message}</p>
          </div>
        )}
        {phase.kind === 'done' && phase.preview.status === 'ready' && (
          <PreviewEditor preview={phase.preview} onDone={onDone} />
        )}
      </div>
    </div>
  );
}

function PreviewEditor({ preview, onDone }: { preview: Extract<ImportPreview, { status: 'ready' }>; onDone?(): void }) {
  const categories = useLibrary((s) => s.categories);
  const addMedia = useLibrary((s) => s.addMedia);
  const toast = useUi((s) => s.toast);
  const single = preview.entries.length === 1;
  const first = preview.entries[0]!.item;
  const [selected, setSelected] = useState<Set<number>>(() => new Set(preview.entries.flatMap((e, i) => (e.duplicateOf ? [] : [i]))));
  const [title, setTitle] = useState(first.title);
  const [artist, setArtist] = useState(first.artist ?? '');
  const [categoryId, setCategoryId] = useState<string>('');
  const ids = { title: useId(), artist: useId(), category: useId() };

  const chosen = preview.entries.filter((_, i) => selected.has(i)).map((e) => e.item);
  // Title/artist fields exist only for single-item imports; for playlists only
  // the category applies, even if just one entry is selected.
  const edited = () => applyEdits(chosen, single ? { title, artist, categoryId: categoryId || null } : { categoryId: categoryId || null });
  const duplicates = preview.entries.filter((e) => e.duplicateOf).length;

  async function save(thenPlay: boolean) {
    const saved = await addMedia(edited());
    toast(saved.length === 1 ? `Saved “${saved[0]!.title}” to library` : `${saved.length} items saved to library`, 'success');
    if (thenPlay) void getEngine().playList(saved);
    onDone?.();
  }

  function toggle(i: number) {
    const next = new Set(selected);
    if (next.has(i)) next.delete(i);
    else next.add(i);
    setSelected(next);
  }

  return (
    <div className="import__preview">
      <dl className="kv-list">
        <div className="kv-list__row">
          <dt>Provider</dt>
          <dd>{PROVIDER_LABEL[preview.detection.provider ?? ''] ?? '—'}</dd>
        </div>
        <div className="kv-list__row">
          <dt>Type</dt>
          <dd>
            {KIND_LABEL[preview.kind] ?? preview.kind} · {preview.detection.confidence} confidence
            {preview.detection.providerItemId ? ` · ${preview.detection.providerItemId}` : ''}
          </dd>
        </div>
        <div className="kv-list__row">
          <dt>Source</dt>
          <dd className="station-info__url">{preview.detection.normalizedUrl}</dd>
        </div>
        <div className="kv-list__row">
          <dt>Playback</dt>
          <dd>{playbackNote(first)}</dd>
        </div>
      </dl>
      {first.artwork && <img className="import__artwork" src={first.artwork} alt="" referrerPolicy="no-referrer" />}
      {preview.notes.map((n) => (
        <p key={n} className="notice">
          {n}
        </p>
      ))}

      {single ? (
        <div className="import__fields">
          <label htmlFor={ids.title} className="field__label">
            Title
          </label>
          <input id={ids.title} className="input" value={title} maxLength={200} onChange={(e) => setTitle(e.currentTarget.value)} />
          <label htmlFor={ids.artist} className="field__label">
            Artist <span className="muted">(optional)</span>
          </label>
          <input id={ids.artist} className="input" value={artist} maxLength={200} onChange={(e) => setArtist(e.currentTarget.value)} />
          {preview.entries[0]!.duplicateOf && (
            <p className="notice">Already in your library as “{preview.entries[0]!.duplicateOf.title}”. Saving again keeps the existing item.</p>
          )}
        </div>
      ) : (
        <fieldset className="import__entries">
          <legend className="field__label">
            {preview.entries.length} entries · {selected.size} selected{duplicates ? ` · ${duplicates} already in library` : ''}
          </legend>
          <RowList>
            {preview.entries.map((e, i) => (
              <li key={e.item.id} className="import__entry">
                <label>
                  <input type="checkbox" checked={selected.has(i)} onChange={() => toggle(i)} />
                  <span className="truncate" title={e.item.streamUrl ?? e.item.sourceUrl}>
                    {e.item.title}
                  </span>
                </label>
                <span className="row__index">
                  {e.duplicateOf ? 'IN LIBRARY' : e.item.duration ? formatTime(e.item.duration) : e.item.playbackType === 'radio' ? 'LIVE' : ''}
                </span>
              </li>
            ))}
          </RowList>
        </fieldset>
      )}

      <div className="import__fields">
        <label htmlFor={ids.category} className="field__label">
          Category
        </label>
        <select id={ids.category} className="select" value={categoryId} onChange={(e) => setCategoryId(e.currentTarget.value)}>
          <option value="">No category</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>

      <div className="test-source__row">
        <button type="button" className="btn btn--primary" disabled={chosen.length === 0} onClick={() => void save(false)}>
          <Save size={14} aria-hidden="true" /> Save to library
        </button>
        <button type="button" className="btn" disabled={chosen.length === 0} onClick={() => void save(true)}>
          <Check size={14} aria-hidden="true" /> Save &amp; play
        </button>
        <button type="button" className="btn" disabled={chosen.length === 0} onClick={() => void getEngine().playList(edited())}>
          <Play size={14} aria-hidden="true" /> Play without saving
        </button>
        <button
          type="button"
          className="btn"
          disabled={chosen.length === 0}
          onClick={() => {
            getEngine().enqueue(edited());
            toast(chosen.length === 1 ? 'Added to queue' : `${chosen.length} items added to queue`, 'success');
          }}
        >
          <ListPlus size={14} aria-hidden="true" /> Queue
        </button>
      </div>
    </div>
  );
}
