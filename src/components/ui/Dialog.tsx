import { useEffect, useRef, type FormEvent, type ReactNode } from 'react';

interface DialogProps {
  open: boolean;
  title: string;
  onClose(): void;
  onSubmit?(e: FormEvent<HTMLFormElement>): void;
  submitLabel?: string;
  submitDisabled?: boolean;
  /** Destructive confirmation: red instead of the primary accent. */
  danger?: boolean;
  children: ReactNode;
}

/** Native <dialog>: focus trapping, Esc and backdrop come from the browser. */
export function Dialog({ open, title, onClose, onSubmit, submitLabel = 'Save', submitDisabled, danger, children }: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);

  return (
    <dialog ref={ref} className="dialog" aria-label={title} onClose={onClose} onCancel={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit?.(e);
        }}
      >
        <header className="panel__header">
          <h2 className="panel__title panel__title--small">{title}</h2>
        </header>
        <div className="dialog__body">{children}</div>
        <footer className="dialog__footer">
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          {onSubmit && (
            <button type="submit" className={`btn ${danger ? 'btn--danger' : 'btn--primary'}`} disabled={submitDisabled}>
              {submitLabel}
            </button>
          )}
        </footer>
      </form>
    </dialog>
  );
}
