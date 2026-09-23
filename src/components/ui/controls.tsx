import { useId, type KeyboardEvent, type ReactNode } from 'react';

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="empty" role="status">
      <span className="empty__title">{title}</span>
      {children && <span>{children}</span>}
    </div>
  );
}

export type StatusTone = 'ok' | 'warn' | 'error' | 'live' | 'idle';

/** A status dot is always paired with text so state never relies on color alone. */
export function Status({ tone, children }: { tone: StatusTone; children: ReactNode }) {
  return (
    <span className={`status status--${tone}`}>
      <span className="status__dot" aria-hidden="true" />
      <span>{children}</span>
    </span>
  );
}

export function PendingTag({ children = 'Not yet implemented' }: { children?: ReactNode }) {
  return <span className="pending-tag">{children}</span>;
}

interface ToggleProps {
  checked: boolean;
  onChange(next: boolean): void;
  label: string;
  showState?: boolean;
  disabled?: boolean;
}

export function Toggle({ checked, onChange, label, showState = true, disabled }: ToggleProps) {
  return (
    <button
      type="button"
      role="switch"
      className="toggle"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
    >
      <span className="toggle__track" aria-hidden="true" />
      {showState && <span>{checked ? 'On' : 'Off'}</span>}
    </button>
  );
}

interface SegmentedProps<T extends string> {
  value: T;
  options: ReadonlyArray<{ value: T; label: string }>;
  onChange(value: T): void;
  label: string;
}

export function Segmented<T extends string>({ value, options, onChange, label }: SegmentedProps<T>) {
  function onKeyDown(e: KeyboardEvent) {
    const index = options.findIndex((o) => o.value === value);
    const delta = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
    if (!delta) return;
    e.preventDefault();
    const next = options[(index + delta + options.length) % options.length];
    if (next) onChange(next.value);
  }
  return (
    <div className="segmented" role="radiogroup" aria-label={label} onKeyDown={onKeyDown}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          tabIndex={o.value === value ? 0 : -1}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

interface SliderProps {
  value: number;
  min?: number;
  max?: number;
  step?: number;
  onChange(value: number): void;
  label: string;
  valueText?: string;
  disabled?: boolean;
}

export function Slider({ value, min = 0, max = 1, step = 0.01, onChange, label, valueText, disabled }: SliderProps) {
  const fill = max > min ? ((value - min) / (max - min)) * 100 : 0;
  return (
    <input
      type="range"
      className="slider"
      min={min}
      max={max}
      step={step}
      value={value}
      disabled={disabled}
      aria-label={label}
      aria-valuetext={valueText}
      style={{ ['--fill' as string]: `${fill}%` }}
      onChange={(e) => onChange(Number(e.currentTarget.value))}
    />
  );
}

interface FieldProps {
  label: string;
  children: (id: string) => ReactNode;
}

/** Label/control row used in the control modules. */
export function Field({ label, children }: FieldProps) {
  const id = useId();
  return (
    <div className="field">
      <label className="field__label" htmlFor={id}>
        {label}
      </label>
      <div>{children(id)}</div>
    </div>
  );
}

/**
 * WAI-ARIA tabs keyboard pattern for a role="tablist": ←/→ (wrapping),
 * Home and End move to a tab and activate it. The tabs themselves use a
 * roving tabIndex so the whole tab bar is one Tab stop.
 */
export function onTablistKeyDown(e: KeyboardEvent<HTMLElement>) {
  const keys = ['ArrowLeft', 'ArrowRight', 'Home', 'End'];
  if (!keys.includes(e.key) || e.altKey || e.ctrlKey || e.metaKey) return;
  const tabs = Array.from(e.currentTarget.querySelectorAll<HTMLElement>('[role="tab"]:not(:disabled)'));
  const from = tabs.indexOf(e.target as HTMLElement);
  if (from < 0) return;
  e.preventDefault();
  const n = tabs.length;
  const to = e.key === 'Home' ? 0 : e.key === 'End' ? n - 1 : (from + (e.key === 'ArrowRight' ? 1 : -1) + n) % n;
  tabs[to]!.focus();
  tabs[to]!.click();
}
