import { create } from 'zustand';
import { nowIso } from '../lib/id';
import { repositories } from '../services/storage/repository';
import type { Favorite, FavoriteType, RadioStation } from '../types/media';

interface FavoritesStore {
  favorites: Favorite[];
  /** Saved station records, so favourite stations work offline and without the directory. */
  stations: Record<string, RadioStation>;
  hydrate(): Promise<void>;
  isFavorite(type: FavoriteType, refId: string): boolean;
  toggleStation(station: RadioStation): Promise<boolean>;
  remove(type: FavoriteType, refId: string): Promise<void>;
}

const favId = (type: FavoriteType, refId: string) => `${type}:${refId}`;

/** Favourites reference entities by id (ARCH §20); the station itself is stored once. */
export const useFavorites = create<FavoritesStore>((set, get) => ({
  favorites: [],
  stations: {},

  async hydrate() {
    const [favorites, stations] = await Promise.all([repositories.favorites.getAll(), repositories.stations.getAll()]);
    set({
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
    await Promise.all([repositories.favorites.put(fav), repositories.stations.put(station)]);
    return true;
  },

  async remove(type, refId) {
    set({ favorites: get().favorites.filter((f) => f.id !== favId(type, refId)) });
    await repositories.favorites.delete(favId(type, refId));
  },
}));
