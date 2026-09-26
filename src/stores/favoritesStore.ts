import { create } from 'zustand';
import { nowIso } from '../lib/id';
import { repositoriesFor } from '../services/storage/repository';
import { assertWritableScope, getActiveScope, isActiveScope, MY_LIQUE, type ProfileScope } from '../services/storage/scope';
import type { Favorite, FavoriteType, MediaItem, RadioStation } from '../types/media';
import { mediaIdentity, useLibrary } from './libraryStore';

interface FavoritesStore {
  /** The profile scope this store was hydrated from; all its writes go there (never to another profile). */
  scope: ProfileScope;
  favorites: Favorite[];
  /** Saved station records, so favourite stations work offline and without the directory. */
  stations: Record<string, RadioStation>;
  /**
   * While a Friend Lique is shown (`scope` is the friend's): the viewer's OWN
   * favourites (MY_LIQUE), which the hearts show and "favourite for myself"
   * changes (D3). Null while the own profile is shown — then that is `favorites`.
   */
  own: { favorites: Favorite[]; stations: Record<string, RadioStation> } | null;
  hydrate(): Promise<void>;
  isFavorite(type: FavoriteType, refId: string): boolean;
  toggleStation(station: RadioStation): Promise<boolean>;
  /** Tracks and sources; the item is saved to the library so the favourite can be played later. */
  toggleMedia(item: MediaItem): Promise<boolean>;
  togglePlaylist(playlistId: string): Promise<boolean>;
  /** Remembers stations seen this session so a playing station can be favourited from the player. */
  rememberStation(station: RadioStation): void;
  /** Favourites any playable item: a known radio station as a station, anything else as media. */
  toggleItem(item: MediaItem): Promise<boolean>;
  remove(type: FavoriteType, refId: string): Promise<void>;
  /** The heart on a station: always the viewer's own favourites, whichever profile is shown. */
  toggleOwnStation(station: RadioStation): Promise<boolean>;
  /** The heart on any playable item: always the viewer's own favourites (the item is kept in the own library). */
  toggleOwnItem(item: MediaItem): Promise<boolean>;
}

const favId = (type: FavoriteType, refId: string) => `${type}:${refId}`;

/** The saved/seen station record behind a playing radio item, if any. */
export function stationFor(item: MediaItem, stations: Record<string, RadioStation>): RadioStation | undefined {
  const id = typeof item.metadata?.stationId === 'string' ? item.metadata.stationId : item.id;
  return item.provider === 'radio' ? stations[id] : undefined;
}

/** Whether an item is a favourite, whichever way it was stored. Pure, for selectors. */
export function isItemFavorite(item: MediaItem, favorites: Favorite[], stations: Record<string, RadioStation>): boolean {
  const station = stationFor(item, stations);
  const id = station ? favId('station', station.id) : favId('media', item.id);
  return favorites.some((f) => f.id === id);
}

/** The viewer's own favourites and station records (MY_LIQUE), whichever profile is shown. Selectors. */
export const myFavorites = (s: FavoritesStore): Favorite[] => (s.own ? s.own.favorites : s.favorites);
export const myStations = (s: FavoritesStore): Record<string, RadioStation> => (s.own ? s.own.stations : s.stations);

/** What the store shows for `scope`: its favourites and stations, plus MY_LIQUE's own favourites when `scope` is a friend's. */
export async function readFavorites(scope: ProfileScope): Promise<Pick<FavoritesStore, 'favorites' | 'stations' | 'own'>> {
  const load = (s: ProfileScope) => Promise.all([repositoriesFor(s).favorites.getAll(), repositoriesFor(s).stations.getAll()]);
  const [[favorites, stations], own] = await Promise.all([load(scope), scope.kind === 'own' ? null : load(MY_LIQUE)]);
  const shape = (f: Favorite[], s: RadioStation[]) => ({ favorites: f.sort((a, b) => b.addedAt.localeCompare(a.addedAt)), stations: Object.fromEntries(s.map((x) => [x.id, x])) });
  return { ...shape(favorites, stations), own: own ? shape(own[0], own[1]) : null };
}

/** Repositories of the profile this store holds — never simply the active one. */
function repos() {
  return repositoriesFor(useFavorites.getState().scope);
}

/** Favourites reference entities by id (ARCH §20); the station itself is stored once. */
export const useFavorites = create<FavoritesStore>((set, get) => ({
  scope: MY_LIQUE,
  favorites: [],
  stations: {},
  own: null,

  async hydrate() {
    const scope = getActiveScope();
    const shown = await readFavorites(scope);
    if (!isActiveScope(scope)) return; // the profile changed meanwhile; its own hydrate wins
    set({ scope, ...shown });
  },

  isFavorite(type, refId) {
    return get().favorites.some((f) => f.id === favId(type, refId));
  },

  async toggleStation(station) {
    assertWritableScope(get().scope); // a Friend Lique is read-only: refused before anything changes
    if (get().isFavorite('station', station.id)) {
      await get().remove('station', station.id);
      return false;
    }
    const fav: Favorite = { id: favId('station', station.id), type: 'station', refId: station.id, addedAt: nowIso() };
    set({ favorites: [fav, ...get().favorites], stations: { ...get().stations, [station.id]: station } });
    await Promise.all([repos().favorites.put(fav), repos().stations.put(station)]);
    return true;
  },

  async toggleMedia(item) {
    assertWritableScope(get().scope);
    const [saved] = await useLibrary.getState().addMedia([item]);
    const refId = saved?.id ?? item.id;
    if (get().isFavorite('media', refId)) {
      await get().remove('media', refId);
      return false;
    }
    const fav: Favorite = { id: favId('media', refId), type: 'media', refId, addedAt: nowIso() };
    set({ favorites: [fav, ...get().favorites] });
    await repos().favorites.put(fav);
    return true;
  },

  async togglePlaylist(playlistId) {
    assertWritableScope(get().scope);
    if (get().isFavorite('playlist', playlistId)) {
      await get().remove('playlist', playlistId);
      return false;
    }
    const fav: Favorite = { id: favId('playlist', playlistId), type: 'playlist', refId: playlistId, addedAt: nowIso() };
    set({ favorites: [fav, ...get().favorites] });
    await repos().favorites.put(fav);
    return true;
  },

  async toggleItem(item) {
    const station = stationFor(item, get().stations);
    return station ? get().toggleStation(station) : get().toggleMedia(item);
  },

  rememberStation(station) {
    if (!get().stations[station.id]) set({ stations: { ...get().stations, [station.id]: station } });
  },

  async remove(type, refId) {
    assertWritableScope(get().scope);
    set({ favorites: get().favorites.filter((f) => f.id !== favId(type, refId)) });
    await repos().favorites.delete(favId(type, refId));
  },

  async toggleOwnStation(station) {
    const own = get().own;
    if (!own) return get().toggleStation(station); // the own profile is shown: the usual path
    const id = favId('station', station.id);
    const mine = repositoriesFor(MY_LIQUE);
    if (own.favorites.some((f) => f.id === id)) {
      set({ own: { ...own, favorites: own.favorites.filter((f) => f.id !== id) } });
      await mine.favorites.delete(id);
      return false;
    }
    const fav: Favorite = { id, type: 'station', refId: station.id, addedAt: nowIso() };
    set({ own: { favorites: [fav, ...own.favorites], stations: { ...own.stations, [station.id]: station } } });
    await Promise.all([mine.favorites.put(fav), mine.stations.put(station)]);
    return true;
  },

  async toggleOwnItem(item) {
    const own = get().own;
    if (!own) return get().toggleItem(item);
    const station = stationFor(item, { ...get().stations, ...own.stations });
    if (station) return get().toggleOwnStation(station);
    // Only this one item goes into the own library (so the favourite plays later), never the rest of the Friend Lique.
    const mine = repositoriesFor(MY_LIQUE);
    const existing = (await mine.media.getAll()).find((m) => m.id === item.id || mediaIdentity(m) === mediaIdentity(item));
    const id = favId('media', existing?.id ?? item.id);
    const current = get().own ?? own;
    if (current.favorites.some((f) => f.id === id)) {
      set({ own: { ...current, favorites: current.favorites.filter((f) => f.id !== id) } });
      await mine.favorites.delete(id);
      return false;
    }
    if (!existing) await mine.media.put({ ...item });
    const fav: Favorite = { id, type: 'media', refId: existing?.id ?? item.id, addedAt: nowIso() };
    set({ own: { ...current, favorites: [fav, ...current.favorites] } });
    await mine.favorites.put(fav);
    return true;
  },
}));
