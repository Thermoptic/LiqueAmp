import { useId, useRef, useState } from 'react';
import { Check, ListPlus, Play, Save, Search } from 'lucide-react';
import { applyEdits, previewImport, type ImportPreview, type ImportStep, type PlaylistPreview } from '../../services/import/importer';
import { getEngine } from '../../services/playback/engine';
import { readYouTubePlaylist } from '../../services/playback/embedded/youtube';
import { formatTime } from '../../lib/format';
import { useLibrary } from '../../stores/libraryStore';
import { usePlaylists } from '../../stores/playlistStore';
import { useUi } from '../../stores/uiStore';
import { PROVIDER_LABEL } from '../player/NowPlayingPanel';
import { Status, Toggle } from '../ui/controls';
import { RowList } from '../ui/RowList';
import { useSettings } from '../../stores/settingsStore';

const KIND_LABEL: Record<string, string> = {
  audio: 'Audio file',
  stream: 'Direct stream',
  hls: 'HLS stream',
  playlist: 'Playlist',
  provider: 'Provider item',
  'youtube-playlist': 'YouTube playlist',
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
  playlist: 'READING THE YOUTUBE PLAYLIST…',
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
  // YouTube's own player, shown here while it lists a playlist's videos
  const probe = useRef<HTMLDivElement>(null);

  async function run() {
    const preview = await previewImport(url, {
      library: useLibrary.getState().media,
      playlists: usePlaylists.getState().playlists,
      onStep: (step) => setPhase({ kind: 'running', step }),
      isProviderEnabled: (p) => useSettings.getState().providers[p]?.enabled !== false,
      readPlaylistIds: (listId) => readYouTubePlaylist(listId, probe.current!),
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
        <div ref={probe} className="import__probe" aria-hidden="true" />
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
  const updateMedia = useLibrary((s) => s.updateMedia);
  const toast = useUi((s) => s.toast);
  const list = preview.playlist;
  // a YouTube playlist always shows its entries, even when only one video is available
  const single = !list && preview.entries.length === 1;
  const first = preview.entries[0]!.item;
  // A playlist keeps every video, including those already in the library (they are reused).
  // An item saved only inside an imported playlist is not in the library yet, so it is selected too.
  const inLibrary = (e: (typeof preview.entries)[number]) => !!e.duplicateOf && !e.duplicateOf.playlistOnly;
  const [selected, setSelected] = useState<Set<number>>(() => new Set(preview.entries.flatMap((e, i) => (inLibrary(e) && !list ? [] : [i]))));
  const [title, setTitle] = useState(first.title);
  const [artist, setArtist] = useState(first.artist ?? '');
  const [categoryId, setCategoryId] = useState<string>('');
  const [asPlaylist, setAsPlaylist] = useState(!!list);
  const [playlistName, setPlaylistName] = useState(list?.title ?? '');
  const ids = { title: useId(), artist: useId(), category: useId(), playlistName: useId() };

  const chosen = preview.entries.filter((_, i) => selected.has(i)).map((e) => e.item);
  // Title/artist fields exist only for single-item imports; for playlists only
  // the category applies, even if just one entry is selected.
  const edited = () => applyEdits(chosen, single ? { title, artist, categoryId: categoryId || null } : { categoryId: categoryId || null });
  const duplicates = preview.entries.filter((e) => e.duplicateOf).length;
  const creating = !!list && asPlaylist;
  const canSave = chosen.length > 0 && (!creating || playlistName.trim().length > 0);

  async function save(thenPlay: boolean) {
    if (creating) return savePlaylist(list, thenPlay);
    const saved = await addMedia(edited());
    // saving to the library explicitly lists items that were only in an imported playlist
    await Promise.all(saved.filter((m) => m.playlistOnly).map((m) => updateMedia(m.id, { playlistOnly: false })));
    toast(saved.length === 1 ? `Saved “${saved[0]!.title}” to library` : `${saved.length} items saved to library`, 'success');
    if (thenPlay) void getEngine().playList(saved);
    onDone?.();
  }

  /** ONE LIQUEAMP playlist with the selected videos, in YouTube's order. */
  async function savePlaylist(source: PlaylistPreview, thenPlay: boolean) {
    const playlists = usePlaylists.getState();
    const provider = preview.detection.provider === 'youtube-music' ? 'youtube-music' : 'youtube';
    const created = await playlists.create(playlistName, chosen, { source: { provider, listId: source.listId, url: source.url } });
    toast(`Playlist “${created.name}” created · ${created.items.length === 1 ? '1 video' : `${created.items.length} videos`}`, 'success');
    // show it in the Library panel's Playlists tab
    useUi.getState().openPlaylist(created.id);
    useUi.getState().setLibraryTab('playlists');
    if (thenPlay) void getEngine().playList(playlists.resolve(created.id).items);
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
      {list && (
        <div className="import__playlist">
          <span className="import__playlist-kind">YouTube playlist</span>
          <h3 className="import__playlist-title">{list.title}</h3>
          <span className="import__playlist-count">
            {list.total === 1 ? '1 video' : `${list.total} videos`}
            {list.unavailable.length > 0 && ` · ${preview.entries.length} available · ${list.unavailable.length} unavailable`}
          </span>
          {list.titleMissing && <p className="notice">YouTube did not give this playlist a title.</p>}
        </div>
      )}
      {!list && first.artwork && <img className="import__artwork" src={first.artwork} alt="" referrerPolicy="no-referrer" />}
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
          {preview.entries[0]!.duplicateOf &&
            (preview.entries[0]!.duplicateOf.playlistOnly ? (
              <p className="notice">Already saved in an imported playlist. Saving lists it in the library as well.</p>
            ) : (
              <p className="notice">Already in your library as “{preview.entries[0]!.duplicateOf.title}”. Saving again keeps the existing item.</p>
            ))}
        </div>
      ) : (
        <fieldset className="import__entries">
          <legend className="field__label">
            {preview.entries.length} entries · {selected.size} selected{duplicates ? ` · ${duplicates} already in library` : ''}
          </legend>
          <RowList aria-label={list ? 'Playlist videos' : undefined}>
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
            {/* listed by YouTube, but nothing is imported for them */}
            {list?.unavailable.map((u) => (
              <li key={u.videoId} className="import__entry import__entry--unavailable">
                <span className="truncate" title={u.reason}>
                  {u.url}
                </span>
                <span className="row__index" title={u.reason}>
                  UNAVAILABLE
                </span>
              </li>
            ))}
          </RowList>
        </fieldset>
      )}

      {list && (
        <div className="import__fields">
          <div className="field">
            <span className="field__label">Create playlist</span>
            <Toggle checked={asPlaylist} onChange={setAsPlaylist} label="Create playlist" />
          </div>
          <p className="settings-group__note">
            {asPlaylist
              ? `One LIQUEAMP playlist with the ${chosen.length === 1 ? 'selected video' : `${chosen.length} selected videos`}, in YouTube's order. It is one entry in the Library; the videos are not listed there one by one.`
              : 'Off: the selected videos are saved to the library as separate items, as for any other import.'}
          </p>
          {asPlaylist && (
            <>
              <label htmlFor={ids.playlistName} className="field__label">
                Playlist name
              </label>
              <input
                id={ids.playlistName}
                className="input"
                value={playlistName}
                maxLength={80}
                onChange={(e) => setPlaylistName(e.currentTarget.value)}
              />
              {list.existing && (
                <p className="notice">
                  Already imported as “{list.existing.name}”. Saving creates another playlist; videos already saved are reused.
                </p>
              )}
            </>
          )}
        </div>
      )}

      <div className="import__fields" hidden={creating}>
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
        <button type="button" className="btn btn--primary" disabled={!canSave} onClick={() => void save(false)}>
          <Save size={14} aria-hidden="true" /> {creating ? 'Save playlist' : 'Save to library'}
        </button>
        <button type="button" className="btn" disabled={!canSave} onClick={() => void save(true)}>
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
