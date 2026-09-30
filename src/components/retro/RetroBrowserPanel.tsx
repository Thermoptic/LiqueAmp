import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Heart, ListPlus, Play, Search } from 'lucide-react';
import { RETRO_SYSTEMS, retroSystem } from '../../services/retro/systems';
import { retroSourceFor, type RetroSource, type RetroTrack } from '../../services/retro/sources';
import { getEngine } from '../../services/playback/engine';
import { isItemFavorite, myFavorites, useFavorites } from '../../stores/favoritesStore';
import { usePlayback } from '../../stores/playbackStore';
import { useRetro } from '../../stores/retroStore';
import { useSettings } from '../../stores/settingsStore';
import { useUi } from '../../stores/uiStore';
import { Link } from 'react-router';
import { ItemActionsMenu } from '../actions/ItemActions';
import { EmptyState, onTablistKeyDown, Status } from '../ui/controls';
import { RowList } from '../ui/RowList';

/**
 * Retro music (NES, C64, Mega Drive, …) in the Browse panel's place: the
 * same panel, tabs, search field and rows as the radio browser. Systems come
 * from RETRO_SYSTEMS and each searches its own source (services/retro), so a
 * new system is data, not layout.
 */
export function RetroBrowserPanel() {
  const systemId = useRetro((s) => s.systemId);
  const selectSystem = useRetro((s) => s.selectSystem);
  const system = retroSystem(systemId);
  const enabled = useSettings((s) => s.providers.retro?.enabled !== false);

  if (!enabled) {
    // Switched off in /control: no archive requests at all.
    return (
      <section className="panel radio-browser retro-browser area-radio" aria-label="Retro browser">
        <div className="panel__body">
          <EmptyState title="RETRO DISABLED">
            Retro music is switched off in <Link to="/control/providers">/control › Providers</Link>.
          </EmptyState>
        </div>
      </section>
    );
  }

  return (
    <section className="panel radio-browser retro-browser area-radio" aria-label="Retro browser">
      <div className="tabs radio-browser__tabs" role="tablist" aria-label="Retro systems" onKeyDown={onTablistKeyDown}>
        {RETRO_SYSTEMS.map((s, i) => (
          <button
            key={s.id}
            type="button"
            role="tab"
            id={`retro-tab-${s.id}`}
            aria-selected={s.id === systemId}
            // one Tab stop: the selected system, or the first before one is chosen
            tabIndex={(system ? s.id === systemId : i === 0) ? 0 : -1}
            aria-controls="retro-tabpanel"
            className="tab"
            title={`${s.label} · ${s.format}`}
            onClick={() => selectSystem(s.id)}
          >
            {s.name}
          </button>
        ))}
      </div>
      <div
        className="radio-browser__view"
        id="retro-tabpanel"
        role="tabpanel"
        aria-labelledby={system ? `retro-tab-${system.id}` : undefined}
        aria-label={system ? undefined : 'Retro music'}
      >
        {system ? (
          <SystemView key={system.id} systemId={system.id} />
        ) : (
          <div className="panel__body">
            <EmptyState title="RETRO MUSIC">Select a system to browse.</EmptyState>
          </div>
        )}
      </div>
      <footer className="radio-browser__source">
        {system ? `${system.label} · ${system.format} · ${retroSourceFor(system.id)?.name ?? 'no source connected'}` : 'Retro music · NSF · SID · VGM'}
      </footer>
    </section>
  );
}

type SearchState = { kind: 'idle' } | { kind: 'loading' } | { kind: 'ready'; tracks: RetroTrack[] } | { kind: 'error'; message: string };

function SystemView({ systemId }: { systemId: string }) {
  const system = retroSystem(systemId)!;
  const source = retroSourceFor(systemId);
  const query = useRetro((s) => s.query);
  const setQuery = useRetro((s) => s.setQuery);
  const openFile = useRetro((s) => s.openFile);
  const [state, setState] = useState<SearchState>({ kind: 'idle' });

  // search as the user types (debounced; a newer search cancels the previous one)
  useEffect(() => {
    const text = query.trim();
    if (!source || !text) {
      setState({ kind: 'idle' });
      return;
    }
    const abort = new AbortController();
    const timer = window.setTimeout(() => {
      setState({ kind: 'loading' });
      source
        .search(text, { signal: abort.signal })
        .then((tracks) => !abort.signal.aborted && setState({ kind: 'ready', tracks }))
        .catch((err: unknown) => !abort.signal.aborted && setState({ kind: 'error', message: err instanceof Error ? err.message : String(err) }));
    }, 300);
    return () => {
      window.clearTimeout(timer);
      abort.abort();
    };
  }, [source, query]);

  return (
    <>
      <div className="radio-browser__search">
        <Search size={16} aria-hidden="true" />
        <input
          type="search"
          className="input"
          placeholder={`Search ${system.name} music…`}
          aria-label={`Search ${system.name} music`}
          value={query}
          disabled={!source}
          onChange={(e) => setQuery(e.currentTarget.value)}
        />
      </div>
      <div className="panel__body panel__body--flush radio-browser__list" aria-busy={state.kind === 'loading'}>
        {!source ? (
          <EmptyState title="SOURCE NOT CONNECTED">
            {system.name} music ({system.format}) is not connected yet. Search works once a source for {system.label} is added.
          </EmptyState>
        ) : openFile ? (
          <TuneList source={source} file={openFile} />
        ) : (
          <SearchResults state={state} source={source} system={system.name} />
        )}
      </div>
    </>
  );
}

function SearchResults({ state, source, system }: { state: SearchState; source: RetroSource; system: string }) {
  const openTunes = useRetro((s) => s.openTunes);
  if (state.kind === 'idle') return <EmptyState title={`SEARCH ${system} MUSIC`}>Type a game, tune or composer.</EmptyState>;
  if (state.kind === 'loading') return <p className="radio-browser__state">SEARCHING…</p>;
  if (state.kind === 'error')
    return (
      <div className="now-playing__error radio-browser__error" role="alert">
        <Status tone="error">SEARCH FAILED</Status>
        <p>{state.message}</p>
      </div>
    );
  if (state.tracks.length === 0) return <EmptyState title="NO MATCHES">Try another game, tune or composer.</EmptyState>;
  return (
    <RowList aria-label={`${system} results`}>
      {state.tracks.map((t, i) => (
        <RetroTrackRow key={t.id} track={t} index={i} source={source} onOpen={isMultiTune(t) ? () => openTunes(t) : undefined} />
      ))}
    </RowList>
  );
}

const isMultiTune = (t: RetroTrack) => t.subtune === undefined && (t.hasTunes === true || (t.subtuneCount ?? 1) > 1);
const tunesLabel = (t: RetroTrack) => (t.subtuneCount ? `${t.subtuneCount} tunes` : 'tunes');

/** A file's subtunes, each its own playable track. */
function TuneList({ source, file }: { source: RetroSource; file: RetroTrack }) {
  const openTunes = useRetro((s) => s.openTunes);
  const [tunes, setTunes] = useState<RetroTrack[] | null>(null);
  const note = tunes?.find((t) => t.note)?.note;
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const abort = new AbortController();
    source
      .getTracks(file, { signal: abort.signal })
      .then((t) => !abort.signal.aborted && setTunes(t))
      .catch((err: unknown) => !abort.signal.aborted && setError(err instanceof Error ? err.message : String(err)));
    return () => abort.abort();
  }, [source, file]);

  return (
    <>
      <div className="library-toolbar retro-browser__file">
        <button type="button" className="btn btn--ghost" onClick={() => openTunes(null)}>
          <ArrowLeft size={14} aria-hidden="true" /> Results
        </button>
        <span className="retro-browser__file-text">
          <span className="library-toolbar__title truncate">{tunes?.[0]?.game ?? file.game ?? file.title}</span>
          <span className="station-row__meta truncate">
            {[tunes?.[0]?.composer ?? file.composer, `${system(file)} · ${file.format}`, tunes ? `${tunes.length} ${tunes.length === 1 ? 'tune' : 'tunes'}` : undefined]
              .filter(Boolean)
              .join(' · ')}
          </span>
        </span>
      </div>
      {error ? (
        <div className="now-playing__error radio-browser__error" role="alert">
          <Status tone="error">TUNES UNAVAILABLE</Status>
          <p>{error}</p>
        </div>
      ) : tunes === null ? (
        <p className="radio-browser__state">LOADING TUNES…</p>
      ) : tunes.length === 0 ? (
        <EmptyState title="NO TUNES">This file lists no playable tunes.</EmptyState>
      ) : (
        <>
        {note && <p className="notice retro-browser__note">{note}: those parts are silent.</p>}
        <RowList aria-label={`${file.game ?? file.title} tunes`}>
          {tunes.map((t, i) => (
            <RetroTrackRow key={t.id} track={t} index={i} source={source} />
          ))}
        </RowList>
        </>
      )}
    </>
  );
}

const system = (t: RetroTrack) => retroSystem(t.systemId)?.name ?? t.systemId;

/** Game · composer · SYSTEM FORMAT, like a station's genre · country · codec. */
export function retroTrackMeta(t: RetroTrack): string {
  const parts = [t.game && t.game !== t.title ? t.game : undefined, t.composer, `${system(t)} · ${t.format}`];
  if (isMultiTune(t) && t.subtuneCount) parts.push(tunesLabel(t));
  return parts.filter(Boolean).join(' · ');
}

/**
 * One result, in the station rows' style: ▶ play, ＋ queue, ♥ favourite,
 * ⋯ more (add to playlist, …). A file with several subtunes opens its tune
 * list instead. All actions use LIQUEAMP's normal player, queue, favourites
 * and playlists through the source's media item.
 */
export function RetroTrackRow({ track, index, source, onOpen }: { track: RetroTrack; index: number; source: RetroSource; onOpen?(): void }) {
  const item = useMemo(() => source.toMediaItem(track), [source, track]);
  const isPlaying = usePlayback((s) => s.currentItem?.id === item.id);
  const toast = useUi((s) => s.toast);
  // the heart is always the viewer's own favourites, as on station rows
  const favorite = useFavorites((s) => isItemFavorite(item, myFavorites(s), s.stations));
  const toggleFavorite = useFavorites((s) => s.toggleOwnItem);

  return (
    <li className="station-row retro-row" aria-current={isPlaying ? 'true' : undefined}>
      <span className="row__index">{String(index + 1).padStart(2, '0')}</span>
      <button
        type="button"
        className="station-row__main"
        onClick={onOpen ?? (() => void getEngine().playList([item]))}
        // named like a station row's main button ("…. Select for details"), distinct from ▶
        aria-label={onOpen ? `${track.title}: show its ${tunesLabel(track)}` : `${track.title}${isPlaying ? ', now playing' : ''}. Play`}
      >
        <span className="station-row__text">
          <span className="station-row__name truncate">{track.title}</span>
          <span className="station-row__meta truncate">{retroTrackMeta(track)}</span>
        </span>
      </button>
      {onOpen ? (
        <span className="station-row__flag">{tunesLabel(track).toUpperCase()}</span>
      ) : (
        <>
          {track.note && (
            <span className="station-row__flag" title={track.note}>
              PARTIAL
            </span>
          )}
          <button type="button" className="btn btn--ghost btn--icon" aria-label={`Play ${track.title}`} onClick={() => void getEngine().playList([item])}>
            <Play size={14} />
          </button>
          <button
            type="button"
            className="btn btn--ghost btn--icon"
            aria-label={`Add ${track.title} to queue`}
            onClick={() => {
              getEngine().enqueue([item]);
              toast('Added to queue', 'success');
            }}
          >
            <ListPlus size={14} />
          </button>
          <button
            type="button"
            className="btn btn--ghost btn--icon station-row__fav"
            aria-label={favorite ? `Remove ${track.title} from favourites` : `Add ${track.title} to favourites`}
            aria-pressed={favorite}
            onClick={() => void toggleFavorite(item).then((added) => toast(added ? 'Added to favourites' : 'Removed from favourites', 'success'))}
          >
            <Heart size={14} />
          </button>
          <ItemActionsMenu target={{ kind: 'media', item }} favourite={false} />
        </>
      )}
    </li>
  );
}
