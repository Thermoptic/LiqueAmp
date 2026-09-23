import { useEffect, useRef, useState } from 'react';
import { Search } from 'lucide-react';
import { EmptyState } from '../ui/controls';

const TABS = [
  { id: 'radio', label: 'Radio' },
  { id: 'genres', label: 'Genres' },
  { id: 'locations', label: 'Locations' },
  { id: 'mood', label: 'Mood' },
] as const;

type TabId = (typeof TABS)[number]['id'];

export function RadioBrowserPanel({ focusSearch }: { focusSearch: boolean }) {
  const [tab, setTab] = useState<TabId>('radio');
  const [query, setQuery] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (focusSearch) searchRef.current?.focus({ preventScroll: true });
  }, [focusSearch]);

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
      <div className="radio-browser__search">
        <Search size={16} aria-hidden="true" />
        <input
          ref={searchRef}
          type="search"
          className="input"
          placeholder="Search stations, genres, locations…"
          aria-label="Search stations"
          value={query}
          onChange={(e) => setQuery(e.currentTarget.value)}
        />
      </div>
      <div className="panel__body panel__body--flush" id="radio-tabpanel" role="tabpanel" aria-labelledby={`radio-tab-${tab}`}>
        <EmptyState title="NO STATIONS LOADED">
          The radio directory is not connected in this build yet. Station search arrives with the radio integration.
        </EmptyState>
      </div>
    </section>
  );
}
