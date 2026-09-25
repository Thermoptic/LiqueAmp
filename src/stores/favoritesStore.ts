import { create } from 'zustand';
import { nowIso } from '../lib/id';
import { repositoriesFor } from '../services/storage/repository';
import { getActiveScope, isActiveScope, MY_LIQUE, type ProfileScope } from '../services/storage/scope';
import type { Favorite, FavoriteType, MediaItem, RadioStation } from '../types/media';
import { useLibrary } from './libraryStore';

interface FavoritesStore {
  /** The profile scope this store was hydrated from; all its writes go there (never to another profile). */
  scope: ProfileScope;
  favorites: Favorite[];
  /** Saved station records, so favourite stations work offline and without the directory. */
  stations: Record<string, RadioStation>;
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

/** Repositories of the profile this store holds — never simply the active one. */
function repos() {
  return repositoriesFor(useFavorites.getState().scope);
}

/** Favourites reference entities by id (ARCH §20); the station itself is stored once. */
export const useFavorites = create<FavoritesStore>((set, get) => ({
  scope: MY_LIQUE,
  favorites: [],
  stations: {},

  async hydrate() {
    const scope = getActiveScope();
    const [favorites, stations] = await Promise.all([repositoriesFor(scope).favorites.getAll(), repositoriesFor(scope).stations.getAll()]);
    if (!isActiveScope(scope)) return; // the profile changed meanwhile; its own hydrate wins
    set({
      scope,
      favorites: favorites.sort((a, b) => b.addedAt.localeCompare(a.addedAt)),
      stations: Object.fromEntries(stations.map((s) => [s.id, s])),
    });
  },

  isFavorite(type, refId) {
    return get().favorites.some((f) => f.id === favId(type, refId));
  },

  async toggleStation(station) {
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
    set({ favorites: get().favorites.filter((f) => f.id !== favId(type, refId)) });
    await repos().favorites.delete(favId(type, refId));
  },
}));
