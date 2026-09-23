import { useId, useMemo, useState } from 'react';
import { normalizeHex } from '../../../services/themes/color';
import { validateTheme } from '../../../services/themes/theme';
import { useSettings } from '../../../stores/settingsStore';
import { useThemes } from '../../../stores/themeStore';
import { useUi } from '../../../stores/uiStore';
import type { LiqueAmpTheme, ThemeColorKey } from '../../../types/theme';
import { Slider, Status, Toggle } from '../../ui/controls';
import { ThemePreview } from './ThemePreview';

export const THEME_GROUPS: ReadonlyArray<{ title: string; keys: ReadonlyArray<[ThemeColorKey, string]> }> = [
  {
    title: 'Background & surfaces',
    keys: [
      ['bg', 'Background'],
      ['surface', 'Surface'],
      ['surface2', 'Surface 2'],
      ['surface3', 'Surface 3'],
    ],
  },
  {
    title: 'Borders',
    keys: [
      ['borderSubtle', 'Subtle'],
      ['border', 'Normal'],
      ['borderStrong', 'Strong'],
    ],
  },
  {
    title: 'Text',
    keys: [
      ['text', 'Primary'],
      ['textSecondary', 'Secondary'],
      ['textMuted', 'Muted'],
      ['textDisabled', 'Disabled'],
    ],
  },
  {
    title: 'Accents',
    keys: [
      ['primary', 'Primary'],
      ['accent', 'Accent'],
      ['accentBright', 'Accent bright'],
      ['secondary', 'Secondary'],
      ['focus', 'Focus outline'],
    ],
  },
  {
    title: 'Status',
    keys: [
      ['success', 'Success'],
      ['warning', 'Warning'],
      ['danger', 'Danger'],
      ['info', 'Info'],
      ['live', 'Live'],
    ],
  },
  {
    title: 'Visualizer & glow',
    keys: [
      ['visualizer', 'Visualizer'],
      ['visualizerSecondary', 'Visualizer 2'],
      ['glow', 'Glow'],
      ['glowStrong', 'Glow strong'],
    ],
  },
];

/** "Text · Muted" style labels for semantic tokens. */
export const TOKEN_LABEL: Record<ThemeColorKey, string> = Object.fromEntries(
  THEME_GROUPS.flatMap((g) => g.keys.map(([key, label]) => [key, `${g.title.split(' ')[0]} · ${label}`])),
) as Record<ThemeColorKey, string>;

function ColorField({ label, value, onChange }: { label: string; value: string; onChange(v: string): void }) {
  const id = useId();
  const [text, setText] = useState(value);
  const [lastValue, setLastValue] = useState(value);
  if (value !== lastValue) {
    setLastValue(value);
    setText(value);
  }
  const valid = normalizeHex(text) !== null;
  return (
    <div className="color-field">
      <label htmlFor={id}>{label}</label>
      <input type="color" value={value} aria-label={`${label} color picker`} onChange={(e) => onChange(e.currentTarget.value)} />
      <input
        id={id}
        className="input color-field__hex"
        value={text}
        spellCheck={false}
        maxLength={7}
        aria-invalid={!valid}
        onChange={(e) => {
          const v = e.currentTarget.value;
          setText(v);
          const hex = normalizeHex(v);
          if (hex) onChange(hex);
        }}
      />
    </div>
  );
}

/**
 * Edits a theme with a live preview (THEMING §19). Built-in themes are
 * edited as a copy; the app's own colors change only when saved + activated.
 */
export function ThemeEditor({ initial, onClose }: { initial: LiqueAmpTheme; onClose(): void }) {
  const saveTheme = useThemes((s) => s.saveTheme);
  const activate = useSettings((s) => s.update);
  const toast = useUi((s) => s.toast);
  const [draft, setDraft] = useState<LiqueAmpTheme>(() => structuredClone(initial));
  const nameId = useId();
  const issues = useMemo(() => validateTheme(draft), [draft]);
  const errors = issues.filter((i) => i.level === 'error');

  const setColor = (key: ThemeColorKey, v: string) => setDraft((d) => ({ ...d, colors: { ...d.colors, [key]: v } }));
  const setEffects = (patch: Partial<LiqueAmpTheme['effects']>) => setDraft((d) => ({ ...d, effects: { ...d.effects, ...patch } }));

  async function save(andActivate: boolean) {
    await saveTheme({ ...draft, source: draft.source === 'builtin' ? 'user' : draft.source, updatedAt: new Date().toISOString() });
    if (andActivate) activate({ activeThemeId: draft.id });
    toast(andActivate ? 'Theme saved and activated' : 'Theme saved', 'success');
    onClose();
  }

  return (
    <div className="theme-editor">
      <div className="theme-editor__form">
        <div className="import__fields">
          <label htmlFor={nameId} className="field__label">
            Theme name
          </label>
          <input id={nameId} className="input" value={draft.name} maxLength={60} onChange={(e) => setDraft({ ...draft, name: e.currentTarget.value })} />
        </div>
        {THEME_GROUPS.map((g) => (
          <fieldset key={g.title} className="theme-editor__group">
            <legend className="settings-group__title">{g.title}</legend>
            {g.keys.map(([key, label]) => (
              <ColorField key={key} label={label} value={draft.colors[key]} onChange={(v) => setColor(key, v)} />
            ))}
          </fieldset>
        ))}
        <fieldset className="theme-editor__group">
          <legend className="settings-group__title">Effects</legend>
          <div className="field">
            <span className="field__label">Glow</span>
            <Toggle checked={draft.effects.glowEnabled} onChange={(v) => setEffects({ glowEnabled: v })} label="Glow enabled" />
          </div>
          <div className="field">
            <span className="field__label">Glow intensity</span>
            <Slider
              value={draft.effects.glowIntensity}
              onChange={(v) => setEffects({ glowIntensity: v })}
              label="Glow intensity"
              valueText={`${Math.round(draft.effects.glowIntensity * 100)}%`}
              disabled={!draft.effects.glowEnabled}
            />
          </div>
          <div className="field">
            <span className="field__label">Corner radius</span>
            <Slider
              value={draft.effects.borderRadius}
              min={0}
              max={8}
              step={1}
              onChange={(v) => setEffects({ borderRadius: v })}
              label="Corner radius"
              valueText={`${draft.effects.borderRadius}px`}
            />
          </div>
        </fieldset>
      </div>
      <div className="theme-editor__side">
        <ThemePreview theme={draft} />
        <ul className="theme-card__warnings" aria-live="polite">
          {issues.length === 0 && (
            <li>
              <Status tone="ok">Contrast OK</Status>
            </li>
          )}
          {issues.map((i) => (
            <li key={i.message}>
              <Status tone={i.level === 'error' ? 'error' : 'warn'}>{i.message}</Status>
            </li>
          ))}
        </ul>
        {issues.some((i) => i.level === 'warning') && (
          <p className="muted control-note">Low contrast is allowed, but text may be hard to read.</p>
        )}
        <div className="test-source__row">
          <button type="button" className="btn btn--primary" disabled={errors.length > 0 || !draft.name.trim()} onClick={() => void save(true)}>
            Save &amp; activate
          </button>
          <button type="button" className="btn" disabled={errors.length > 0 || !draft.name.trim()} onClick={() => void save(false)}>
            Save
          </button>
          <button type="button" className="btn btn--ghost" onClick={onClose}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
