import { useState } from 'react';
import { Check, Copy, Download, Pencil, Plus, RotateCcw, Trash2, Type, Upload } from 'lucide-react';
import { LIQUEAMP_DEFAULT } from '../../services/themes/builtin';
import { exportBase16Yaml, exportLiqueAmpJson } from '../../services/themes/tinted';
import { validateTheme } from '../../services/themes/theme';
import { useSettings } from '../../stores/settingsStore';
import { useThemes } from '../../stores/themeStore';
import { useUi } from '../../stores/uiStore';
import { THEME_COLOR_KEYS, type LiqueAmpTheme } from '../../types/theme';
import { Dialog } from '../ui/Dialog';
import { NameDialog } from '../ui/NameDialog';
import { Status } from '../ui/controls';
import { ThemeEditor } from './themes/ThemeEditor';
import { ThemeImporter } from './themes/ThemeImporter';

type Mode = { kind: 'list' } | { kind: 'edit'; theme: LiqueAmpTheme } | { kind: 'import' };

const SOURCE_LABEL = { builtin: 'BUILT-IN', imported: 'IMPORTED', user: 'CUSTOM' } as const;

function download(filename: string, text: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function fileSlug(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'theme';
}

/** Theme library (THEMING §44–50): activate, edit, duplicate, rename, delete, import, export. */
export function ThemesSection() {
  const themes = useThemes((s) => s.themes);
  const duplicateTheme = useThemes((s) => s.duplicateTheme);
  const renameTheme = useThemes((s) => s.renameTheme);
  const deleteTheme = useThemes((s) => s.deleteTheme);
  const activeThemeId = useSettings((s) => s.activeThemeId);
  const update = useSettings((s) => s.update);
  const toast = useUi((s) => s.toast);
  const [mode, setMode] = useState<Mode>({ kind: 'list' });
  const [renaming, setRenaming] = useState<LiqueAmpTheme | null>(null);
  const [deleting, setDeleting] = useState<LiqueAmpTheme | null>(null);
  const [exporting, setExporting] = useState<LiqueAmpTheme | null>(null);

  async function edit(theme: LiqueAmpTheme) {
    // Built-ins are read-only; editing works on a copy (THEMING §49).
    const target = theme.source === 'builtin' ? await duplicateTheme(theme.id) : theme;
    setMode({ kind: 'edit', theme: target });
  }

  const title = mode.kind === 'edit' ? `Edit theme · ${mode.theme.name}` : mode.kind === 'import' ? 'Import theme' : 'Themes';

  return (
    <section className="panel">
      <header className="panel__header">
        <h2 className="panel__title">{title}</h2>
        {mode.kind === 'list' && (
          <div className="panel__actions">
            <button type="button" className="btn" onClick={() => setMode({ kind: 'import' })}>
              <Upload size={14} aria-hidden="true" /> Import
            </button>
            <button
              type="button"
              className="btn"
              onClick={() => void duplicateTheme(activeThemeId).then((t) => setMode({ kind: 'edit', theme: t }))}
            >
              <Plus size={14} aria-hidden="true" /> New from active
            </button>
            <button
              type="button"
              className="btn btn--ghost"
              disabled={activeThemeId === LIQUEAMP_DEFAULT.id}
              onClick={() => {
                update({ activeThemeId: LIQUEAMP_DEFAULT.id });
                toast('Default theme restored', 'success');
              }}
            >
              <RotateCcw size={14} aria-hidden="true" /> Reset to default
            </button>
          </div>
        )}
      </header>
      <div className="panel__body">
        {mode.kind === 'edit' && <ThemeEditor initial={mode.theme} onClose={() => setMode({ kind: 'list' })} />}
        {mode.kind === 'import' && <ThemeImporter onClose={() => setMode({ kind: 'list' })} />}
        {mode.kind === 'list' && (
          <div className="theme-grid">
            {themes.map((theme) => {
              const warnings = validateTheme(theme).filter((i) => i.level === 'warning');
              const active = theme.id === activeThemeId;
              return (
                <article key={theme.id} className={`theme-card ${active ? 'theme-card--active' : ''}`} aria-label={theme.name}>
                  <div className="theme-card__swatches" aria-hidden="true">
                    {THEME_COLOR_KEYS.slice(0, 16).map((k) => (
                      <span key={k} style={{ background: theme.colors[k] }} title={k} />
                    ))}
                  </div>
                  <div className="theme-card__meta">
                    <strong className="truncate">{theme.name}</strong>
                    <span className="muted">
                      {SOURCE_LABEL[theme.source]}
                      {theme.format && theme.format !== 'liqueamp' ? ` · ${theme.format.toUpperCase()}` : ''}
                    </span>
                  </div>
                  {warnings.length > 0 ? (
                    <ul className="theme-card__warnings">
                      {warnings.map((w) => (
                        <li key={w.message}>
                          <Status tone="warn">{w.message}</Status>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <Status tone="ok">Contrast OK</Status>
                  )}
                  <div className="theme-card__actions">
                    <button
                      type="button"
                      className={`btn ${active ? '' : 'btn--accent-outline'}`}
                      disabled={active}
                      onClick={() => update({ activeThemeId: theme.id })}
                    >
                      {active ? (
                        <>
                          <Check size={14} aria-hidden="true" /> Active
                        </>
                      ) : (
                        'Activate'
                      )}
                    </button>
                    <button
                      type="button"
                      className="btn btn--icon"
                      aria-label={theme.source === 'builtin' ? `Edit a copy of ${theme.name}` : `Edit ${theme.name}`}
                      title={theme.source === 'builtin' ? 'Edit a copy' : 'Edit'}
                      onClick={() => void edit(theme)}
                    >
                      <Pencil size={14} />
                    </button>
                    <button
                      type="button"
                      className="btn btn--icon"
                      aria-label={`Duplicate ${theme.name}`}
                      title="Duplicate"
                      onClick={() => void duplicateTheme(theme.id).then(() => toast('Theme duplicated', 'success'))}
                    >
                      <Copy size={14} />
                    </button>
                    {theme.source !== 'builtin' && (
                      <button type="button" className="btn btn--icon" aria-label={`Rename ${theme.name}`} title="Rename" onClick={() => setRenaming(theme)}>
                        <Type size={14} />
                      </button>
                    )}
                    <button type="button" className="btn btn--icon" aria-label={`Export ${theme.name}`} title="Export" onClick={() => setExporting(theme)}>
                      <Download size={14} />
                    </button>
                    {theme.source !== 'builtin' && (
                      <button
                        type="button"
                        className="btn btn--icon btn--danger"
                        aria-label={`Delete ${theme.name}`}
                        title={active ? 'Activate another theme first' : 'Delete'}
                        disabled={active}
                        onClick={() => setDeleting(theme)}
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>

      <NameDialog
        open={renaming !== null}
        title="Rename theme"
        submitLabel="Rename"
        initial={renaming?.name ?? ''}
        onClose={() => setRenaming(null)}
        onSubmit={(name) => (renaming ? renameTheme(renaming.id, name) : Promise.resolve())}
      />
      <Dialog
        open={deleting !== null}
        title="Delete theme"
        submitLabel="Delete"
        danger
        onClose={() => setDeleting(null)}
        onSubmit={() => {
          const t = deleting;
          setDeleting(null);
          if (t) void deleteTheme(t.id).then(() => toast('Theme deleted', 'success'), (e: Error) => toast(e.message, 'error'));
        }}
      >
        <p>
          Delete <strong>{deleting?.name}</strong>? This cannot be undone. Built-in themes are not affected.
        </p>
      </Dialog>
      <Dialog open={exporting !== null} title="Export theme" closeLabel="Close" onClose={() => setExporting(null)}>
        {exporting && (
          <div className="theme-export">
            <button type="button" className="btn btn--block" onClick={() => download(`${fileSlug(exporting.name)}.liqueamp.json`, exportLiqueAmpJson(exporting), 'application/json')}>
              <Download size={14} aria-hidden="true" /> LIQUEAMP JSON — every color and effect
            </button>
            <button type="button" className="btn btn--block" onClick={() => download(`${fileSlug(exporting.name)}.yaml`, exportBase16Yaml(exporting), 'text/yaml')}>
              <Download size={14} aria-hidden="true" /> Base16 YAML — closest 16-color version
            </button>
            <p className="muted control-note">Base16 has 16 colors and LIQUEAMP uses 25, so the Base16 file is an approximation.</p>
          </div>
        )}
      </Dialog>
    </section>
  );
}
