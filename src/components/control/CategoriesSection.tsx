import { useMemo, useState } from 'react';
import { ChevronDown, ChevronUp, Pencil, Plus, Trash2 } from 'lucide-react';
import { countByCategory, useLibrary } from '../../stores/libraryStore';
import { useUi } from '../../stores/uiStore';
import type { Category } from '../../types/media';
import { CategoryDialog } from '../library/CategoryDialog';
import { Dialog } from '../ui/Dialog';
import { EmptyState, Toggle } from '../ui/controls';

export function CategoriesSection() {
  const categories = useLibrary((s) => s.categories);
  const media = useLibrary((s) => s.media);
  const move = useLibrary((s) => s.moveCategory);
  const setEnabled = useLibrary((s) => s.setCategoryEnabled);
  const remove = useLibrary((s) => s.deleteCategory);
  const toast = useUi((s) => s.toast);
  const counts = useMemo(() => countByCategory(media), [media]);

  const [adding, setAdding] = useState(false);
  const [renaming, setRenaming] = useState<Category | undefined>();
  const [deleting, setDeleting] = useState<Category | undefined>();

  return (
    <section className="panel">
      <header className="panel__header">
        <h2 className="panel__title">Categories</h2>
        <div className="panel__actions">
          <button type="button" className="btn btn--primary" onClick={() => setAdding(true)}>
            <Plus size={14} aria-hidden="true" /> Add category
          </button>
        </div>
      </header>
      <div className="panel__body panel__body--flush">
        {categories.length === 0 ? (
          <EmptyState title="NO CATEGORIES">Categories group your library in the sidebar.</EmptyState>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th scope="col">#</th>
                <th scope="col">Name</th>
                <th scope="col">Items</th>
                <th scope="col">Visible</th>
                <th scope="col">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {categories.map((c, i) => (
                <tr key={c.id}>
                  <td className="data-table__num">{String(i + 1).padStart(2, '0')}</td>
                  <td className="truncate">{c.name}</td>
                  <td className="data-table__num">{counts.get(c.id) ?? 0}</td>
                  <td>
                    <Toggle checked={c.enabled} onChange={(v) => void setEnabled(c.id, v)} label={`Show ${c.name} in sidebar`} />
                  </td>
                  <td className="data-table__actions">
                    <button type="button" className="btn btn--icon" aria-label={`Move ${c.name} up`} disabled={i === 0} onClick={() => void move(c.id, -1)}>
                      <ChevronUp size={14} />
                    </button>
                    <button
                      type="button"
                      className="btn btn--icon"
                      aria-label={`Move ${c.name} down`}
                      disabled={i === categories.length - 1}
                      onClick={() => void move(c.id, 1)}
                    >
                      <ChevronDown size={14} />
                    </button>
                    <button type="button" className="btn btn--icon" aria-label={`Rename ${c.name}`} onClick={() => setRenaming(c)}>
                      <Pencil size={14} />
                    </button>
                    <button type="button" className="btn btn--icon btn--danger" aria-label={`Delete ${c.name}`} onClick={() => setDeleting(c)}>
                      <Trash2 size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <CategoryDialog open={adding} onClose={() => setAdding(false)} />
      <CategoryDialog open={Boolean(renaming)} category={renaming} onClose={() => setRenaming(undefined)} />
      <Dialog
        open={Boolean(deleting)}
        title="Delete category"
        submitLabel="Delete"
        danger
        onClose={() => setDeleting(undefined)}
        onSubmit={() => {
          if (!deleting) return;
          void remove(deleting.id).then(() => toast('Category deleted', 'success'));
          setDeleting(undefined);
        }}
      >
        <p>
          Delete <strong>{deleting?.name}</strong>? Media in this category stays in your library; it just loses the category.
        </p>
      </Dialog>
    </section>
  );
}
