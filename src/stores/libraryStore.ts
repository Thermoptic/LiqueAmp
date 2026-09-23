import { create } from 'zustand';
import { createId } from '../lib/id';
import { repositories } from '../services/storage/repository';
import type { Category, MediaItem } from '../types/media';

interface LibraryStore {
  categories: Category[];
  media: MediaItem[];
  hydrate(): Promise<void>;
  addCategory(name: string): Promise<Category>;
  renameCategory(id: string, name: string): Promise<void>;
  setCategoryEnabled(id: string, enabled: boolean): Promise<void>;
  moveCategory(id: string, direction: -1 | 1): Promise<void>;
  deleteCategory(id: string): Promise<void>;
}

const byOrder = (a: Category, b: Category) => a.sortOrder - b.sortOrder;

export const useLibrary = create<LibraryStore>((set, get) => ({
  categories: [],
  media: [],

  async hydrate() {
    const [categories, media] = await Promise.all([
      repositories.categories.getAll(),
      repositories.media.getAll(),
    ]);
    set({ categories: categories.sort(byOrder), media });
  },

  async addCategory(name) {
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
    await repositories.categories.put(category);
    return category;
  },

  async renameCategory(id, name) {
    const trimmed = name.trim();
    if (!trimmed) throw new Error('Category name is required.');
    await updateCategory(id, { name: trimmed });
  },

  async setCategoryEnabled(id, enabled) {
    await updateCategory(id, { enabled });
  },

  async moveCategory(id, direction) {
    const list = [...get().categories];
    const index = list.findIndex((c) => c.id === id);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= list.length) return;
    const [item] = list.splice(index, 1);
    list.splice(target, 0, item!);
    const reordered = list.map((c, i) => ({ ...c, sortOrder: i }));
    set({ categories: reordered });
    await repositories.categories.putMany(reordered);
  },

  async deleteCategory(id) {
    // Media items keep existing; they just lose the category reference.
    const affected = get()
      .media.filter((m) => m.categoryId === id)
      .map((m) => ({ ...m, categoryId: null }));
    set({
      categories: get().categories.filter((c) => c.id !== id),
      media: get().media.map((m) => (m.categoryId === id ? { ...m, categoryId: null } : m)),
    });
    await repositories.categories.delete(id);
    if (affected.length) await repositories.media.putMany(affected);
  },
}));

async function updateCategory(id: string, patch: Partial<Category>) {
  const { categories } = useLibrary.getState();
  const current = categories.find((c) => c.id === id);
  if (!current) return;
  const next = { ...current, ...patch };
  useLibrary.setState({ categories: categories.map((c) => (c.id === id ? next : c)) });
  await repositories.categories.put(next);
}

/** Real item counts per category, derived from library data (DESIGN §21). */
export function countByCategory(media: MediaItem[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const m of media) {
    if (m.categoryId) counts.set(m.categoryId, (counts.get(m.categoryId) ?? 0) + 1);
  }
  return counts;
}
