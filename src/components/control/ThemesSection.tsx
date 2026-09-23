import { Check } from 'lucide-react';
import { useSettings } from '../../stores/settingsStore';
import { useThemes } from '../../stores/themeStore';
import { validateTheme } from '../../services/themes/theme';
import { THEME_COLOR_KEYS } from '../../types/theme';
import { PendingTag, Status } from '../ui/controls';

export function ThemesSection() {
  const themes = useThemes((s) => s.themes);
  const activeThemeId = useSettings((s) => s.activeThemeId);
  const update = useSettings((s) => s.update);

  return (
    <section className="panel">
      <header className="panel__header">
        <h2 className="panel__title">Themes</h2>
        <div className="panel__actions">
          <PendingTag>Editor &amp; Tinted import not yet implemented</PendingTag>
        </div>
      </header>
      <div className="panel__body theme-grid">
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
                <span className="muted">{theme.source.toUpperCase()}</span>
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
            </article>
          );
        })}
      </div>
    </section>
  );
}
