import { useState } from 'react';
import { ListPlus, Trash2, X } from 'lucide-react';
import { getEngine } from '../../services/playback/engine';
import { useLibrary } from '../../stores/libraryStore';
import { useUi } from '../../stores/uiStore';
import type { MediaItem } from '../../types/media';
import { Dialog } from '../ui/Dialog';
import { EmptyState } from '../ui/controls';
import { MediaRow } from './MediaRow';

/** Saved library media, all or one category (SPEC §16 library categories). */
export function MediaLibraryView({ view }: { view: string }) {
  const media = useLibrary((s) => s.media);
  const categories = useLibrary((s) => s.categories);
  const removeMedia = useLibrary((s) => s.removeMedia);
  const updateMedia = useLibrary((s) => s.updateMedia);
  const showLibrary = useUi((s) => s.showLibrary);
  const toast = useUi((s) => s.toast);
  const [removing, setRemoving] = useState<MediaItem | null>(null);

  const category = view === 'all' ? null : categories.find((c) => c.id === view);
  const items = view === 'all' ? media : media.filter((m) => m.categoryId === view);
  const title = view === 'all' ? 'All media' : (category?.name ?? 'Category');

  return (
    <>
      <div className="library-toolbar">
        <h3 className="library-toolbar__title truncate">{title}</h3>
        <span className="muted">{items.length === 1 ? '1 item' : `${items.length} items`}</span>
        <button type="button" className="btn btn--ghost btn--icon" aria-label="Close library view" onClick={() => showLibrary(null)}>
          <X size={14} />
        </button>
      </div>
      {items.length > 0 && (
        <div className="library-toolbar">
          <button type="button" className="btn btn--primary" onClick={() => void getEngine().playList(items)}>
            Play all
          </button>
        </div>
      )}
      {items.length === 0 ? (
        <EmptyState title={view === 'all' ? 'LIBRARY EMPTY' : 'NO MEDIA IN THIS CATEGORY'}>
          Use Import in the Library header to add streams and files.
        </EmptyState>
      ) : (
        <ol className="row-list" aria-label={title}>
          {items.map((item, i) => (
            <MediaRow
              key={item.id}
              item={item}
              index={i}
              onActivate={() => void getEngine().playList(items, i)}
              actions={
                <>
                  <label className="sr-only" htmlFor={`cat-${item.id}`}>
                    Category for {item.title}
                  </label>
                  <select
                    id={`cat-${item.id}`}
                    className="select media-row__category"
                    value={item.categoryId ?? ''}
                    onChange={(e) => void updateMedia(item.id, { categoryId: e.currentTarget.value || null })}
                  >
                    <option value="">—</option>
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    className="btn btn--ghost btn--icon"
                    aria-label={`Add ${item.title} to queue`}
                    onClick={() => {
                      getEngine().enqueue([item]);
                      toast('Added to queue', 'success');
                    }}
                  >
                    <ListPlus size={14} />
                  </button>
                  <button type="button" className="btn btn--ghost btn--icon" aria-label={`Remove ${item.title} from library`} onClick={() => setRemoving(item)}>
                    <Trash2 size={14} />
                  </button>
                </>
              }
            />
          ))}
        </ol>
      )}
      <Dialog
        open={removing !== null}
        title="Remove from library"
        submitLabel="Remove"
        danger
        onClose={() => setRemoving(null)}
        onSubmit={() => {
          const item = removing;
          setRemoving(null);
          if (item) void removeMedia(item.id).then(() => toast('Removed from library', 'success'));
        }}
      >
        <p>
          Remove <strong>{removing?.title}</strong> from the library? Playlists that contain it will skip it. History is kept.
        </p>
      </Dialog>
    </>
  );
}
