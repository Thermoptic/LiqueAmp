import { useEffect, useId, useState } from 'react';
import { useLibrary } from '../../stores/libraryStore';
import { useUi } from '../../stores/uiStore';
import type { Category } from '../../types/media';
import { Dialog } from '../ui/Dialog';

interface CategoryDialogProps {
  open: boolean;
  onClose(): void;
  /** When set, the dialog renames this category instead of creating one. */
  category?: Category;
}

export function CategoryDialog({ open, onClose, category }: CategoryDialogProps) {
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const inputId = useId();
  const addCategory = useLibrary((s) => s.addCategory);
  const renameCategory = useLibrary((s) => s.renameCategory);
  const categories = useLibrary((s) => s.categories);
  const toast = useUi((s) => s.toast);

  useEffect(() => {
    if (open) {
      setName(category?.name ?? '');
      setError(null);
    }
  }, [open, category]);

  async function submit() {
    const trimmed = name.trim();
    if (!trimmed) return setError('Enter a name.');
    const duplicate = categories.some((c) => c.id !== category?.id && c.name.toLowerCase() === trimmed.toLowerCase());
    if (duplicate) return setError('A category with this name already exists.');
    try {
      if (category) {
        await renameCategory(category.id, trimmed);
        toast('Category renamed', 'success');
      } else {
        await addCategory(trimmed);
        toast('Category added', 'success');
      }
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <Dialog
      open={open}
      title={category ? 'Rename category' : 'Add category'}
      onClose={onClose}
      onSubmit={() => void submit()}
      submitLabel={category ? 'Rename' : 'Add'}
      submitDisabled={!name.trim()}
    >
      <label htmlFor={inputId} className="field__label">
        Name
      </label>
      <input
        id={inputId}
        className="input"
        value={name}
        maxLength={60}
        autoFocus
        onChange={(e) => {
          setName(e.currentTarget.value);
          setError(null);
        }}
      />
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
    </Dialog>
  );
}
