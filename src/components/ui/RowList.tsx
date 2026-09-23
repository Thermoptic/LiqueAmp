import { useEffect, useRef, type ComponentProps, type KeyboardEvent } from 'react';

const FOCUSABLE = 'button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled)';

function rowsOf(list: HTMLElement): HTMLElement[] {
  return Array.from(list.children).filter((el): el is HTMLElement => el instanceof HTMLElement && el.tagName === 'LI');
}

function controlsOf(row: HTMLElement): HTMLElement[] {
  return Array.from(row.querySelectorAll<HTMLElement>(FOCUSABLE));
}

/**
 * An ordered row list that is a single Tab stop (roving focus): only the
 * active row's controls are in the Tab order, ↑/↓ move to the same control
 * in the neighbouring row, Home/End jump to the first/last row. Long lists
 * (stations, queue, history) no longer cost dozens of Tab presses to pass.
 */
export function RowList({ className = '', onKeyDown, children, ...rest }: ComponentProps<'ol'>) {
  const ref = useRef<HTMLOListElement>(null);
  const active = useRef(0);

  useEffect(() => {
    const list = ref.current;
    if (!list) return;
    const apply = () => {
      const rows = rowsOf(list);
      if (active.current >= rows.length) active.current = Math.max(0, rows.length - 1);
      rows.forEach((row, i) => {
        for (const c of controlsOf(row)) c.tabIndex = i === active.current ? 0 : -1;
      });
    };
    const onFocusIn = (e: FocusEvent) => {
      const row = rowsOf(list).findIndex((r) => r.contains(e.target as Node));
      if (row >= 0 && row !== active.current) {
        active.current = row;
        apply();
      }
    };
    apply();
    // rows are added/removed/replaced as results change
    const observer = new MutationObserver(apply);
    observer.observe(list, { childList: true, subtree: true });
    list.addEventListener('focusin', onFocusIn);
    return () => {
      observer.disconnect();
      list.removeEventListener('focusin', onFocusIn);
    };
  }, []);

  const handleKeyDown = (e: KeyboardEvent<HTMLOListElement>) => {
    onKeyDown?.(e);
    const list = ref.current;
    if (e.defaultPrevented || !list || e.altKey || e.ctrlKey || e.metaKey) return;
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) return;
    const target = e.target as HTMLElement;
    if (target.matches('input, select, textarea')) return;
    const rows = rowsOf(list);
    const from = rows.findIndex((r) => r.contains(target));
    if (from < 0) return;
    // the list owns these keys, even at the ends (no volume change by accident)
    e.preventDefault();
    const to = e.key === 'Home' ? 0 : e.key === 'End' ? rows.length - 1 : Math.min(rows.length - 1, Math.max(0, from + (e.key === 'ArrowDown' ? 1 : -1)));
    if (to === from) return;
    const column = Math.max(0, controlsOf(rows[from]!).indexOf(target));
    const next = controlsOf(rows[to]!);
    const focusTarget = next[Math.min(column, next.length - 1)];
    // focusin makes this the active row and moves the Tab order with it
    focusTarget?.focus();
  };

  return (
    <ol ref={ref} className={`row-list ${className}`.trim()} onKeyDown={handleKeyDown} {...rest}>
      {children}
    </ol>
  );
}
