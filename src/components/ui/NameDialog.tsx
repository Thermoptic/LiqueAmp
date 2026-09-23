import { useEffect, useId, useState } from 'react';
import { Dialog } from './Dialog';

interface NameDialogProps {
  open: boolean;
  title: string;
  submitLabel: string;
  initial?: string;
  onClose(): void;
  /** Throw to show an error message in the dialog. */
  onSubmit(name: string): Promise<void>;
}

export function NameDialog({ open, title, submitLabel, initial = '', onClose, onSubmit }: NameDialogProps) {
  const [name, setName] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const id = useId();

  useEffect(() => {
    if (open) {
      setName(initial);
      setError(null);
    }
  }, [open, initial]);

  return (
    <Dialog
      open={open}
      title={title}
      submitLabel={submitLabel}
      submitDisabled={!name.trim()}
      onClose={onClose}
      onSubmit={() =>
        void onSubmit(name)
          .then(onClose)
          .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)))
      }
    >
      <label htmlFor={id} className="field__label">
        Name
      </label>
      <input id={id} className="input" value={name} maxLength={80} data-autofocus onChange={(e) => setName(e.currentTarget.value)} />
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
    </Dialog>
  );
}
