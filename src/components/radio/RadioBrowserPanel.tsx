import { useEffect, useMemo, useRef, useState } from 'react';
import { RotateCcw, Search, X } from 'lucide-react';
import { MOODS } from '../../services/radio/moods';
import type { StationOrder } from '../../services/radio/radioBrowser';
import { useRadio, type RadioTab } from '../../stores/radioStore';
import { EmptyState, Status, Toggle } from '../ui/controls';
import { StationRow } from './StationRow';

const TABS: ReadonlyArray<{ id: RadioTab; label: string }> = [
  { id: 'radio', label: 'Radio' },
  { id: 'genres', label: 'Genres' },
  { id: 'locations', label: 'Locations' },
  { id: 'mood', label: 'Mood' },
];

const ORDERS: ReadonlyArray<{ value: StationOrder; label: string }> = [
  { value: 'clickcount', label: 'Most played' },
  { value: 'votes', label: 'Most voted' },
  { value: 'name', label: 'Name A–Z' },
  { value: 'bitrate', label: 'Bitrate' },
];

export function RadioBrowserPanel({ focusSearch }: { focusSearch: boolean }) {
  const tab = useRadio((s) => s.tab);
  const setTab = useRadio((s) => s.setTab);

  return (
    <section className="panel radio-browser area-radio" aria-label="Radio browser">
      <div className="tabs radio-browser__tabs" role="tablist" aria-label="Radio browser views">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            id={`radio-tab-${t.id}`}
            aria-selected={tab === t.id}
            aria-controls="radio-tabpanel"
            className="tab"
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="radio-browser__view" id="radio-tabpanel" role="tabpanel" aria-labelledby={`radio-tab-${tab}`}>
        {tab === 'radio' && <StationsView focusSearch={focusSearch} />}
        {tab === 'genres' && <GenresView />}
        {tab === 'locations' && <LocationsView />}
        {tab === 'mood' && <MoodView />}
      </div>
      <footer className="radio-browser__source">Directory: radio-browser.info · community data</footer>
    </section>
  );
}

function StationsView({ focusSearch }: { focusSearch: boolean }) {
  const { query, order, onlineOnly, filter, stations, stationsState, error } = useRadio();
  const { setQuery, setOrder, setOnlineOnly, applyFilter, searchStations } = useRadio.getState();
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (useRadio.getState().stationsState === 'idle') void searchStations();
  }, [searchStations]);

  useEffect(() => {
    if (focusSearch) searchRef.current?.focus({ preventScroll: true });
  }, [focusSearch]);

  return (
    <>
      <div className="radio-browser__search">
        <Search size={16} aria-hidden="true" />
        <input
          ref={searchRef}
          type="search"
          className="input"
          placeholder="Search stations…"
          aria-label="Search stations by name"
          value={query}
          onChange={(e) => setQuery(e.currentTarget.value)}
        />
      </div>
      <div className="radio-browser__toolbar">
        {filter && (
          <span className="filter-chip">
            {filter.kind === 'mood' ? 'Mood' : filter.kind === 'tag' ? 'Genre' : 'Location'}: {filter.label}
            <button type="button" aria-label="Clear filter" onClick={() => applyFilter(null)}>
              <X size={12} />
            </button>
          </span>
        )}
        <label className="sr-only" htmlFor="radio-order">
          Sort stations
        </label>
        <select id="radio-order" className="select radio-browser__order" value={order} onChange={(e) => setOrder(e.currentTarget.value as StationOrder)}>
          {ORDERS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <span className="radio-browser__online">
          <span className="muted">Working only</span>
          <Toggle checked={onlineOnly} onChange={setOnlineOnly} label="Only stations that passed the directory's last check" showState={false} />
        </span>
      </div>
      <div className="panel__body panel__body--flush radio-browser__list" aria-busy={stationsState === 'loading'}>
        {stationsState === 'loading' && stations.length === 0 && <p className="radio-browser__state">LOADING STATIONS…</p>}
        {stationsState === 'error' && error && (
          <div className="now-playing__error radio-browser__error" role="alert">
            <Status tone="error">{error.title}</Status>
            <p>{error.message}</p>
            <button type="button" className="btn" onClick={() => void searchStations()}>
              <RotateCcw size={14} aria-hidden="true" /> Retry
            </button>
          </div>
        )}
        {stationsState === 'ready' && stations.length === 0 && <EmptyState title="NO STATIONS FOUND">Try another name, genre or location.</EmptyState>}
        {stations.length > 0 && (
          <ol className="row-list" aria-label="Stations">
            {stations.map((s, i) => (
              <StationRow key={s.id} station={s} index={i} />
            ))}
          </ol>
        )}
      </div>
    </>
  );
}

function useFiltered<T extends { name: string }>(items: T[], text: string): T[] {
  return useMemo(() => {
    const t = text.trim().toLowerCase();
    return t ? items.filter((i) => i.name.toLowerCase().includes(t)) : items;
  }, [items, text]);
}

function ListFilter({ value, onChange, label }: { value: string; onChange(v: string): void; label: string }) {
  return (
    <div className="radio-browser__search">
      <Search size={16} aria-hidden="true" />
      <input type="search" className="input" placeholder={label} aria-label={label} value={value} onChange={(e) => onChange(e.currentTarget.value)} />
    </div>
  );
}

function LoadStateView({ state, retry, label }: { state: string; retry(): void; label: string }) {
  const error = useRadio((s) => s.error);
  if (state === 'loading') return <p className="radio-browser__state">LOADING {label}…</p>;
  if (state === 'error')
    return (
      <div className="now-playing__error radio-browser__error" role="alert">
        <Status tone="error">{error?.title ?? 'ERROR'}</Status>
        <p>{error?.message}</p>
        <button type="button" className="btn" onClick={retry}>
          <RotateCcw size={14} aria-hidden="true" /> Retry
        </button>
      </div>
    );
  return null;
}

function GenresView() {
  const tags = useRadio((s) => s.tags);
  const state = useRadio((s) => s.tagsState);
  const applyFilter = useRadio((s) => s.applyFilter);
  const [text, setText] = useState('');
  const shown = useFiltered(tags, text);
  return (
    <>
      <ListFilter value={text} onChange={setText} label="Filter genres…" />
      <div className="panel__body panel__body--flush radio-browser__list">
        <LoadStateView
          state={state}
          label="GENRES"
          retry={() => {
            useRadio.setState({ tagsState: 'idle' });
            void useRadio.getState().loadTags();
          }}
        />
        <ol className="row-list" aria-label="Genres">
          {shown.map((t, i) => (
            <li key={t.name} className="count-row">
              <span className="row__index">{String(i + 1).padStart(2, '0')}</span>
              <button type="button" className="count-row__main" onClick={() => applyFilter({ kind: 'tag', value: t.name, label: t.name })}>
                <span className="truncate">{t.name}</span>
              </button>
              <span className="count-row__count" aria-label={`${t.stationCount} stations`}>
                {t.stationCount.toLocaleString()}
              </span>
            </li>
          ))}
        </ol>
      </div>
    </>
  );
}

function LocationsView() {
  const countries = useRadio((s) => s.countries);
  const state = useRadio((s) => s.countriesState);
  const applyFilter = useRadio((s) => s.applyFilter);
  const [text, setText] = useState('');
  const shown = useFiltered(countries, text);
  return (
    <>
      <ListFilter value={text} onChange={setText} label="Filter countries…" />
      <div className="panel__body panel__body--flush radio-browser__list">
        <LoadStateView
          state={state}
          label="LOCATIONS"
          retry={() => {
            useRadio.setState({ countriesState: 'idle' });
            void useRadio.getState().loadCountries();
          }}
        />
        <ol className="row-list" aria-label="Countries">
          {shown.map((c, i) => (
            <li key={c.code} className="count-row">
              <span className="row__index">{String(i + 1).padStart(2, '0')}</span>
              <button type="button" className="count-row__main" onClick={() => applyFilter({ kind: 'country', value: c.code, label: c.name })}>
                <span className="count-row__code">{c.code}</span>
                <span className="truncate">{c.name}</span>
              </button>
              <span className="count-row__count" aria-label={`${c.stationCount} stations`}>
                {c.stationCount.toLocaleString()}
              </span>
            </li>
          ))}
        </ol>
      </div>
    </>
  );
}

function MoodView() {
  const applyFilter = useRadio((s) => s.applyFilter);
  return (
    <div className="panel__body radio-browser__moods">
      <p className="muted radio-browser__note">Moods are groups of directory genre tags. Stations are matched by these tags.</p>
      {MOODS.map((m) => (
        <button key={m.id} type="button" className="mood-card" onClick={() => applyFilter({ kind: 'mood', value: m.id, label: m.label })}>
          <span className="mood-card__label display">{m.label}</span>
          <span className="mood-card__tags">{m.tags.map((t) => `#${t}`).join('  ')}</span>
        </button>
      ))}
    </div>
  );
}
