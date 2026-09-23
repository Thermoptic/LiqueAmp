import { useEffect, useRef, type FormEvent, type ReactNode } from 'react';

interface DialogProps {
  open: boolean;
  title: string;
  onClose(): void;
  /** When set, the dialog is a form with a submit button. */
  onSubmit?(e: FormEvent<HTMLFormElement>): void;
  submitLabel?: string;
  submitDisabled?: boolean;
  /** Destructive confirmation: red instead of the primary accent. */
  danger?: boolean;
  /** Wider dialog for richer content (e.g. import preview). */
  wide?: boolean;
  /** Label of the dismiss button; "Cancel" by default. */
  closeLabel?: string;
  children: ReactNode;
}

/** Native <dialog>: focus trapping, Esc and backdrop come from the browser. */
export function Dialog({
  open,
  title,
  onClose,
  onSubmit,
  submitLabel = 'Save',
  submitDisabled,
  danger,
  wide,
  closeLabel = 'Cancel',
  children,
}: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) {
      el.showModal();
      // showModal() focuses the first focusable element, which overrides
      // React's autoFocus; focus the intended field explicitly.
      el.querySelector<HTMLElement>('[data-autofocus]')?.focus();
    }
    if (!open && el.open) el.close();
  }, [open]);

  const layout = (submit?: ReactNode) => (
    <>
      <header className="panel__header">
        <h2 className="panel__title panel__title--small">{title}</h2>
      </header>
      <div className="dialog__body">{children}</div>
      <footer className="dialog__footer">
        <button type="button" className="btn" onClick={onClose}>
          {closeLabel}
        </button>
        {submit}
      </footer>
    </>
  );

  return (
    <dialog ref={ref} className={`dialog ${wide ? 'dialog--wide' : ''}`} aria-label={title} onClose={onClose} onCancel={onClose}>
      {onSubmit ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            onSubmit(e);
          }}
        >
          {layout(
            <button type="submit" className={`btn ${danger ? 'btn--danger' : 'btn--primary'}`} disabled={submitDisabled}>
              {submitLabel}
            </button>,
          )}
        </form>
      ) : (
        // No form wrapper, so the content may contain its own forms.
        layout()
      )}
    </dialog>
  );
}
