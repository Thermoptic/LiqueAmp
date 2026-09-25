import { create } from 'zustand';
import { createId } from '../lib/id';
import { repositoriesFor } from '../services/storage/repository';
import { assertWritableScope, getActiveScope, isActiveScope, MY_LIQUE, type ProfileScope } from '../services/storage/scope';
import type { Category, MediaItem } from '../types/media';

interface LibraryStore {
  /** The profile scope this store was hydrated from; all its writes go there (never to another profile). */
  scope: ProfileScope;
  categories: Category[];
  media: MediaItem[];
  hydrate(): Promise<void>;
  addCategory(name: string): Promise<Category>;
  renameCategory(id: string, name: string): Promise<void>;
  setCategoryEnabled(id: string, enabled: boolean): Promise<void>;
  moveCategory(id: string, direction: -1 | 1): Promise<void>;
  deleteCategory(id: string): Promise<void>;
  /**
   * Saves items to the library and returns the stored versions. An item whose
   * id or source already exists is not duplicated; the existing one is returned.
   */
  addMedia(items: MediaItem[]): Promise<MediaItem[]>;
  removeMedia(id: string): Promise<void>;
  updateMedia(id: string, patch: MediaPatch): Promise<void>;
  getMedia(id: string): MediaItem | undefined;
}

/** Fields editable in the library and /control › Media (SPEC §35). Sources and ids never change. */
export type MediaPatch = Partial<Pick<MediaItem, 'title' | 'artist' | 'album' | 'artwork' | 'description' | 'categoryId' | 'tags' | 'enabled'>>;

/** Identity used to detect the same source imported twice (PROVIDERS §61). */
export function mediaIdentity(item: MediaItem): string {
  const providerItemId = item.metadata?.providerItemId;
  if (typeof providerItemId === 'string') return providerItemId;
  return `${item.provider}:${item.streamUrl || item.sourceUrl}`;
}

const byOrder = (a: Category, b: Category) => a.sortOrder - b.sortOrder;

/** Repositories of the profile this store holds — never simply the active one. */
function repos() {
  return repositoriesFor(useLibrary.getState().scope);
}

export const useLibrary = create<LibraryStore>((set, get) => ({
  scope: MY_LIQUE,
  categories: [],
  media: [],

  async hydrate() {
    const scope = getActiveScope();
    const [categories, media] = await Promise.all([repositoriesFor(scope).categories.getAll(), repositoriesFor(scope).media.getAll()]);
    if (!isActiveScope(scope)) return; // the profile changed meanwhile; its own hydrate wins
    set({ scope, categories: categories.sort(byOrder), media });
  },

  async addCategory(name) {
    assertWritableScope(get().scope); // a Friend Lique is read-only: refused before anything changes
    const trimmed = name.trim();
    if (!trimmed) throw new Error('Category name is required.');
    const existing = get().categories;
    const category: Category = {
      id: createId('cat'),
      name: trimmed,
      sortOrder: existing.length ? Math.max(...existing.map((c) => c.sortOrder)) + 1 : 0,
      enabled: true,
    };
    set({ categories: [...existing, category] });
    await repos().categories.put(category);
    return category;
  },

  async renameCategory(id, name) {
    assertWritableScope(get().scope); // a Friend Lique is read-only: refused before anything changes
    const trimmed = name.trim();
    if (!trimmed) throw new Error('Category name is required.');
    await updateCategory(id, { name: trimmed });
  },

  async setCategoryEnabled(id, enabled) {
    assertWritableScope(get().scope); // a Friend Lique is read-only: refused before anything changes
    await updateCategory(id, { enabled });
  },

  async moveCategory(id, direction) {
    assertWritableScope(get().scope); // a Friend Lique is read-only: refused before anything changes
    const list = [...get().categories];
    const index = list.findIndex((c) => c.id === id);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= list.length) return;
    const [item] = list.splice(index, 1);
    list.splice(target, 0, item!);
    const reordered = list.map((c, i) => ({ ...c, sortOrder: i }));
    set({ categories: reordered });
    await repos().categories.putMany(reordered);
  },

  async addMedia(items) {
    assertWritableScope(get().scope); // a Friend Lique is read-only: refused before anything changes
    const existing = get().media;
    const byId = new Map(existing.map((m) => [m.id, m]));
    const byIdentity = new Map(existing.map((m) => [mediaIdentity(m), m]));
    const added: MediaItem[] = [];
    const result = items.map((item) => {
      const found = byId.get(item.id) ?? byIdentity.get(mediaIdentity(item));
      if (found) return found;
      const saved = { ...item };
      byId.set(saved.id, saved);
      byIdentity.set(mediaIdentity(saved), saved);
      added.push(saved);
      return saved;
    });
    if (added.length) {
      set({ media: [...existing, ...added] });
      await repos().media.putMany(added);
    }
    return result;
  },

  async removeMedia(id) {
    assertWritableScope(get().scope); // a Friend Lique is read-only: refused before anything changes
    set({ media: get().media.filter((m) => m.id !== id) });
    await repos().media.delete(id);
  },

  async updateMedia(id, patch) {
    assertWritableScope(get().scope); // a Friend Lique is read-only: refused before anything changes
    const current = get().media.find((m) => m.id === id);
    if (!current) return;
    const next = { ...current, ...patch, updatedAt: new Date().toISOString() };
    set({ media: get().media.map((m) => (m.id === id ? next : m)) });
    await repos().media.put(next);
  },

  getMedia(id) {
    return get().media.find((m) => m.id === id);
  },

  async deleteCategory(id) {
    assertWritableScope(get().scope); // a Friend Lique is read-only: refused before anything changes
    // Media items keep existing; they just lose the category reference.
    const affected = get()
      .media.filter((m) => m.categoryId === id)
      .map((m) => ({ ...m, categoryId: null }));
    set({
      categories: get().categories.filter((c) => c.id !== id),
      media: get().media.map((m) => (m.categoryId === id ? { ...m, categoryId: null } : m)),
    });
    await repos().categories.delete(id);
    if (affected.length) await repos().media.putMany(affected);
  },
}));

async function updateCategory(id: string, patch: Partial<Category>) {
  assertWritableScope(useLibrary.getState().scope);
  const { categories } = useLibrary.getState();
  const current = categories.find((c) => c.id === id);
  if (!current) return;
  const next = { ...current, ...patch };
  useLibrary.setState({ categories: categories.map((c) => (c.id === id ? next : c)) });
  await repos().categories.put(next);
}

/** Real item counts per category, derived from library data (DESIGN §21). */
export function countByCategory(media: MediaItem[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const m of media) {
    if (m.categoryId) counts.set(m.categoryId, (counts.get(m.categoryId) ?? 0) + 1);
  }
  return counts;
}
