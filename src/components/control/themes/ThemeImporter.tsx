import { useId, useMemo, useState } from 'react';
import { Upload } from 'lucide-react';
import { buildTheme, defaultMapping, parseLiqueAmpJson, parseScheme, ThemeImportError, type ParsedScheme } from '../../../services/themes/tinted';
import { useSettings } from '../../../stores/settingsStore';
import { useThemes } from '../../../stores/themeStore';
import { useUi } from '../../../stores/uiStore';
import { THEME_COLOR_KEYS, type LiqueAmpTheme, type ThemeColorKey } from '../../../types/theme';
import { Status } from '../../ui/controls';
import { ThemePreview } from './ThemePreview';
import { TOKEN_LABEL } from './ThemeEditor';

const FORMAT_LABEL = { base16: 'Base16', base24: 'Base24', tinted8: 'Tinted8' } as const;

type Parsed = { kind: 'scheme'; scheme: ParsedScheme } | { kind: 'liqueamp'; theme: LiqueAmpTheme };

/**
 * Tinted Theming import (THEMING §15–18): read → detect → validate → parse →
 * map (editable) → preview → save → optionally activate.
 */
export function ThemeImporter({ onClose }: { onClose(): void }) {
  const [text, setText] = useState('');
  const [parsed, setParsed] = useState<Parsed | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mapping, setMapping] = useState<Partial<Record<ThemeColorKey, string>>>({});
  const [name, setName] = useState('');
  const saveTheme = useThemes((s) => s.saveTheme);
  const activate = useSettings((s) => s.update);
  const toast = useUi((s) => s.toast);
  const ids = { text: useId(), file: useId(), name: useId() };

  function read(source: string) {
    setError(null);
    setParsed(null);
    const json = parseLiqueAmpJson(source);
    if (json) {
      setParsed({ kind: 'liqueamp', theme: json });
      setName(json.name);
      return;
    }
    try {
      const scheme = parseScheme(source);
      setParsed({ kind: 'scheme', scheme });
      setMapping(defaultMapping(scheme));
      setName(scheme.name);
    } catch (err) {
      setError(err instanceof ThemeImportError ? err.message : String(err));
    }
  }

  const theme = useMemo(() => {
    if (!parsed) return null;
    if (parsed.kind === 'liqueamp') return { ...parsed.theme, name: name || parsed.theme.name };
    return buildTheme(parsed.scheme, mapping, name || parsed.scheme.name);
  }, [parsed, mapping, name]);

  async function save(andActivate: boolean) {
    if (!theme) return;
    await saveTheme(theme);
    if (andActivate) activate({ activeThemeId: theme.id });
    toast(andActivate ? 'Theme imported and activated' : 'Theme imported', 'success');
    onClose();
  }

  return (
    <div className="theme-import">
      {!parsed && (
        <>
          <label className="theme-import__drop" htmlFor={ids.file}>
            <Upload size={18} aria-hidden="true" />
            <span>Choose a Base16, Base24 or Tinted8 file (YAML/JSON), or a LIQUEAMP theme export</span>
            <input
              id={ids.file}
              type="file"
              accept=".yaml,.yml,.json,application/json,text/yaml"
              className="sr-only"
              onChange={async (e) => {
                const file = e.currentTarget.files?.[0];
                if (file) read(await file.text());
              }}
            />
          </label>
          <label htmlFor={ids.text} className="field__label">
            …or paste the file contents
          </label>
          <textarea id={ids.text} className="input theme-import__text" rows={8} spellCheck={false} value={text} onChange={(e) => setText(e.currentTarget.value)} />
          <div className="test-source__row">
            <button type="button" className="btn btn--primary" disabled={!text.trim()} onClick={() => read(text)}>
              Read theme
            </button>
            <button type="button" className="btn btn--ghost" onClick={onClose}>
              Cancel
            </button>
          </div>
        </>
      )}
      {error && (
        <div className="now-playing__error" role="alert">
          <Status tone="error">INVALID THEME</Status>
          <p>{error}</p>
        </div>
      )}

      {parsed && theme && (
        <div className="theme-editor">
          <div className="theme-editor__form">
            <dl className="kv-list">
              <div className="kv-list__row">
                <dt>Detected format</dt>
                <dd>{parsed.kind === 'liqueamp' ? 'LIQUEAMP theme' : FORMAT_LABEL[parsed.scheme.format]}</dd>
              </div>
              {parsed.kind === 'scheme' && parsed.scheme.author && (
                <div className="kv-list__row">
                  <dt>Author</dt>
                  <dd>{parsed.scheme.author}</dd>
                </div>
              )}
              {parsed.kind === 'scheme' && parsed.scheme.variant && (
                <div className="kv-list__row">
                  <dt>Variant</dt>
                  <dd>{parsed.scheme.variant}</dd>
                </div>
              )}
            </dl>
            {parsed.kind === 'scheme' &&
              parsed.scheme.warnings.map((w) => (
                <p key={w} className="notice">
                  {w}
                </p>
              ))}
            <div className="import__fields">
              <label htmlFor={ids.name} className="field__label">
                Theme name
              </label>
              <input id={ids.name} className="input" value={name} maxLength={60} onChange={(e) => setName(e.currentTarget.value)} />
            </div>
            {parsed.kind === 'scheme' && (
              <>
                <div className="palette-strip" aria-label="Imported palette">
                  {Object.entries(parsed.scheme.palette).map(([k, v]) => (
                    <span key={k} className="palette-strip__chip" title={`${k} ${v}`} style={{ background: v }} />
                  ))}
                </div>
                <fieldset className="theme-editor__group">
                  <legend className="settings-group__title">Semantic mapping</legend>
                  <p className="muted control-note">Which palette color LIQUEAMP uses for each role. Change any mapping; the preview updates.</p>
                  {THEME_COLOR_KEYS.map((key) => (
                    <MappingRow
                      key={key}
                      token={key}
                      palette={parsed.scheme.palette}
                      value={mapping[key] ?? ''}
                      onChange={(v) => setMapping({ ...mapping, [key]: v })}
                    />
                  ))}
                  <button type="button" className="btn btn--ghost" onClick={() => setMapping(defaultMapping(parsed.scheme))}>
                    Reset mapping
                  </button>
                </fieldset>
              </>
            )}
          </div>
          <div className="theme-editor__side">
            <ThemePreview theme={theme} />
            <div className="test-source__row">
              <button type="button" className="btn btn--primary" disabled={!name.trim()} onClick={() => void save(true)}>
                Import &amp; activate
              </button>
              <button type="button" className="btn" disabled={!name.trim()} onClick={() => void save(false)}>
                Import
              </button>
              <button type="button" className="btn btn--ghost" onClick={onClose}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function MappingRow({ token, palette, value, onChange }: { token: ThemeColorKey; palette: Record<string, string>; value: string; onChange(v: string): void }) {
  const id = useId();
  return (
    <div className="mapping-row">
      <label htmlFor={id} className="truncate" title={token}>
        {TOKEN_LABEL[token]}
      </label>
      <span className="mapping-row__chip" style={{ background: palette[value] }} aria-hidden="true" />
      <select id={id} className="select" value={value} onChange={(e) => onChange(e.currentTarget.value)}>
        {Object.entries(palette).map(([k, v]) => (
          <option key={k} value={k}>
            {k} · {v}
          </option>
        ))}
      </select>
    </div>
  );
}
