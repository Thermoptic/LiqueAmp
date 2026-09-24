import { useEffect, useId, useState } from 'react';
import { useLibrary, type MediaPatch } from '../../../stores/libraryStore';
import { useUi } from '../../../stores/uiStore';
import type { MediaItem } from '../../../types/media';
import { Artwork } from '../../ui/Artwork';
import { Dialog } from '../../ui/Dialog';
import { parseTags, validArtwork } from '../../../lib/mediaFields';

interface Draft {
  title: string;
  artist: string;
  album: string;
  artwork: string;
  description: string;
  tags: string;
  categoryId: string;
}

const toDraft = (m: MediaItem): Draft => ({
  title: m.title,
  artist: m.artist ?? '',
  album: m.album ?? '',
  artwork: m.artwork ?? '',
  description: m.description ?? '',
  tags: (m.tags ?? []).join(', '),
  categoryId: m.categoryId ?? '',
});

/** Metadata editor for one library item (SPEC §35). The source itself never changes here. */
export function MediaEditDialog({ item, onClose }: { item: MediaItem | null; onClose(): void }) {
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const updateMedia = useLibrary((s) => s.updateMedia);
  const categories = useLibrary((s) => s.categories);
  const toast = useUi((s) => s.toast);
  const id = useId();

  useEffect(() => {
    setDraft(item ? toDraft(item) : null);
    setError(null);
  }, [item]);

  if (!item || !draft) return <Dialog open={false} title="Edit" onClose={onClose}>{null}</Dialog>;

  const set = (patch: Partial<Draft>) => {
    setDraft({ ...draft, ...patch });
    setError(null);
  };

  async function submit() {
    if (!item || !draft) return;
    if (!draft.title.trim()) return setError('Title is required.');
    if (!validArtwork(draft.artwork)) return setError('Artwork must be an http(s) address, or empty.');
    const opt = (v: string) => v.trim() || undefined;
    const patch: MediaPatch = {
      title: draft.title.trim(),
      artist: opt(draft.artist),
      album: opt(draft.album),
      artwork: draft.artwork.trim() || null,
      description: opt(draft.description),
      tags: parseTags(draft.tags),
      categoryId: draft.categoryId || null,
    };
    await updateMedia(item.id, patch);
    toast('Saved', 'success');
    onClose();
  }

  const field = (key: keyof Draft, label: string, props: { optional?: boolean; max?: number; autofocus?: boolean } = {}) => (
    <>
      <label htmlFor={`${id}-${key}`} className="field__label">
        {label} {props.optional && <span className="muted">(optional)</span>}
      </label>
      <input
        id={`${id}-${key}`}
        className="input"
        value={draft[key]}
        maxLength={props.max ?? 200}
        data-autofocus={props.autofocus || undefined}
        onChange={(e) => set({ [key]: e.currentTarget.value })}
      />
    </>
  );

  return (
    <Dialog open title="Edit media" onClose={onClose} onSubmit={() => void submit()} submitLabel="Save" submitDisabled={!draft.title.trim()} wide>
      <div className="media-edit">
        <div className="media-edit__art">
          <Artwork src={validArtwork(draft.artwork) ? draft.artwork.trim() || null : null} alt="Artwork preview" />
        </div>
        <div className="media-edit__fields">
          {field('title', 'Title', { autofocus: true })}
          {field('artist', 'Artist', { optional: true })}
          {field('album', 'Album', { optional: true })}
          {field('artwork', 'Artwork URL', { optional: true, max: 2000 })}
          {field('tags', 'Tags, comma-separated', { optional: true, max: 500 })}
          <label htmlFor={`${id}-category`} className="field__label">
            Category
          </label>
          <select id={`${id}-category`} className="select" value={draft.categoryId} onChange={(e) => set({ categoryId: e.currentTarget.value })}>
            <option value="">No category</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <label htmlFor={`${id}-description`} className="field__label">
            Description <span className="muted">(optional)</span>
          </label>
          <textarea
            id={`${id}-description`}
            className="input media-edit__description"
            rows={3}
            maxLength={2000}
            value={draft.description}
            onChange={(e) => set({ description: e.currentTarget.value })}
          />
          <p className="control-note muted media-edit__source">
            Source: <span className="truncate">{item.sourceUrl}</span>
          </p>
        </div>
      </div>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
    </Dialog>
  );
}
