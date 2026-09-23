import { create } from 'zustand';
import { MOODS, mergeByPopularity } from '../services/radio/moods';
import { radioBrowser, type CountryCount, type StationOrder, type TagCount } from '../services/radio/radioBrowser';
import { ProviderError } from '../services/providers/errors';
import type { RadioStation } from '../types/media';

export type RadioTab = 'radio' | 'genres' | 'locations' | 'mood';

export type StationFilter =
  | { kind: 'tag'; value: string; label: string }
  | { kind: 'country'; value: string; label: string }
  | { kind: 'mood'; value: string; label: string };

type LoadState = 'idle' | 'loading' | 'ready' | 'error';

interface RadioStore {
  tab: RadioTab;
  query: string;
  order: StationOrder;
  onlineOnly: boolean;
  filter: StationFilter | null;
  stations: RadioStation[];
  stationsState: LoadState;
  error: { title: string; message: string } | null;
  tags: TagCount[];
  tagsState: LoadState;
  countries: CountryCount[];
  countriesState: LoadState;

  setTab(tab: RadioTab): void;
  setQuery(query: string): void;
  setOrder(order: StationOrder): void;
  setOnlineOnly(onlineOnly: boolean): void;
  applyFilter(filter: StationFilter | null): void;
  searchStations(): Promise<void>;
  loadTags(): Promise<void>;
  loadCountries(): Promise<void>;
}

let stationController: AbortController | null = null;
let searchTimer: ReturnType<typeof setTimeout> | undefined;
const SEARCH_DEBOUNCE_MS = 350;

function describe(err: unknown): { title: string; message: string } {
  if (err instanceof ProviderError) return { title: err.title, message: err.message };
  return { title: 'RADIO DIRECTORY ERROR', message: String(err) };
}

/** Radio browser session state: survives switching screens, not reloads. */
export const useRadio = create<RadioStore>((set, get) => ({
  tab: 'radio',
  query: '',
  order: 'clickcount',
  onlineOnly: true,
  filter: null,
  stations: [],
  stationsState: 'idle',
  error: null,
  tags: [],
  tagsState: 'idle',
  countries: [],
  countriesState: 'idle',

  setTab(tab) {
    set({ tab });
    if (tab === 'genres') void get().loadTags();
    if (tab === 'locations') void get().loadCountries();
  },

  setQuery(query) {
    set({ query });
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => void get().searchStations(), SEARCH_DEBOUNCE_MS);
  },

  setOrder(order) {
    set({ order });
    void get().searchStations();
  },

  setOnlineOnly(onlineOnly) {
    set({ onlineOnly });
    void get().searchStations();
  },

  applyFilter(filter) {
    set({ filter, tab: 'radio' });
    void get().searchStations();
  },

  async searchStations() {
    clearTimeout(searchTimer);
    stationController?.abort();
    const controller = new AbortController();
    stationController = controller;
    const { query, order, onlineOnly, filter } = get();
    set({ stationsState: 'loading', error: null });
    try {
      let stations: RadioStation[];
      if (filter?.kind === 'mood') {
        const mood = MOODS.find((m) => m.id === filter.value);
        const lists = await Promise.all(
          (mood?.tags ?? []).map((tag) => radioBrowser.searchStations({ name: query, tag, order, onlineOnly, limit: 40 }, controller.signal)),
        );
        stations = mergeByPopularity(lists);
      } else {
        stations = await radioBrowser.searchStations(
          {
            name: query,
            tag: filter?.kind === 'tag' ? filter.value : undefined,
            countryCode: filter?.kind === 'country' ? filter.value : undefined,
            order,
            onlineOnly,
          },
          controller.signal,
        );
      }
      if (controller.signal.aborted) return;
      set({ stations, stationsState: 'ready' });
    } catch (err) {
      if (controller.signal.aborted) return;
      set({ stationsState: 'error', error: describe(err) });
    }
  },

  async loadTags() {
    if (get().tagsState === 'ready' || get().tagsState === 'loading') return;
    set({ tagsState: 'loading' });
    try {
      set({ tags: await radioBrowser.topTags(120), tagsState: 'ready' });
    } catch (err) {
      set({ tagsState: 'error', error: describe(err) });
    }
  },

  async loadCountries() {
    if (get().countriesState === 'ready' || get().countriesState === 'loading') return;
    set({ countriesState: 'loading' });
    try {
      set({ countries: await radioBrowser.countries(), countriesState: 'ready' });
    } catch (err) {
      set({ countriesState: 'error', error: describe(err) });
    }
  },
}));
