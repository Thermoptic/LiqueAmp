import { useEffect, useId, useState } from 'react';
import { usePlaylists } from '../../stores/playlistStore';
import { useUi } from '../../stores/uiStore';
import type { MediaItem } from '../../types/media';
import { Dialog } from '../ui/Dialog';

const NEW = '__new__';

interface Props {
  open: boolean;
  items: MediaItem[];
  onClose(): void;
}

/** Adds items to an existing playlist or a new one. */
export function AddToPlaylistDialog({ open, items, onClose }: Props) {
  const playlists = usePlaylists((s) => s.playlists);
  const addItems = usePlaylists((s) => s.addItems);
  const create = usePlaylists((s) => s.create);
  const toast = useUi((s) => s.toast);
  const [target, setTarget] = useState<string>(NEW);
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const nameId = useId();

  useEffect(() => {
    if (open) {
      setTarget(playlists[0]?.id ?? NEW);
      setName('');
      setError(null);
    }
  }, [open, playlists]);

  async function submit() {
    try {
      if (target === NEW) {
        const p = await create(name, items);
        toast(`Added to ${p.name}`, 'success');
      } else {
        await addItems(target, items);
        toast(`Added to ${playlists.find((p) => p.id === target)?.name ?? 'playlist'}`, 'success');
      }
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  const label = items.length === 1 ? `“${items[0]!.title}”` : `${items.length} items`;
  return (
    <Dialog
      open={open}
      title="Add to playlist"
      submitLabel="Add"
      submitDisabled={target === NEW && !name.trim()}
      onClose={onClose}
      onSubmit={() => void submit()}
    >
      <p className="muted">Add {label} to:</p>
      <div className="choice-list" role="radiogroup" aria-label="Playlist">
        {playlists.map((p) => (
          <label key={p.id} className="choice">
            <input type="radio" name="playlist-target" checked={target === p.id} onChange={() => setTarget(p.id)} />
            <span className="truncate">{p.name}</span>
            <span className="muted">{p.items.length}</span>
          </label>
        ))}
        <label className="choice">
          <input type="radio" name="playlist-target" checked={target === NEW} onChange={() => setTarget(NEW)} />
          <span>New playlist</span>
        </label>
      </div>
      {target === NEW && (
        <>
          <label className="field__label" htmlFor={nameId}>
            Name
          </label>
          <input id={nameId} className="input" value={name} maxLength={80} data-autofocus onChange={(e) => setName(e.currentTarget.value)} />
        </>
      )}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
    </Dialog>
  );
}
