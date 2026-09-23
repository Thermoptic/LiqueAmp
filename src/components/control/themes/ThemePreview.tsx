import type { CSSProperties } from 'react';
import { cssVarName } from '../../../services/themes/theme';
import { THEME_COLOR_KEYS, type LiqueAmpTheme } from '../../../types/theme';

/** CSS variables for a theme, scoped to one element (the rest of the app is untouched). */
export function themeVars(theme: LiqueAmpTheme): CSSProperties {
  const vars: Record<string, string> = {};
  for (const key of THEME_COLOR_KEYS) vars[cssVarName(key)] = theme.colors[key];
  vars['--la-glow-amount'] = String(theme.effects.glowEnabled ? theme.effects.glowIntensity : 0);
  vars['--la-radius-sm'] = `${theme.effects.borderRadius}px`;
  return vars as CSSProperties;
}

/**
 * Miniature LIQUEAMP built from the real UI classes, so the preview shows
 * what the theme will actually look like (THEMING §17, §66).
 */
export function ThemePreview({ theme }: { theme: LiqueAmpTheme }) {
  const bars = [0.35, 0.6, 0.85, 1, 0.8, 0.55, 0.7, 0.45, 0.3, 0.5, 0.65, 0.4];
  return (
    <div className="theme-preview" style={themeVars(theme)} aria-label={`Preview of ${theme.name}`} role="img">
      <div className="theme-preview__header">
        <span className="theme-preview__brand display">LIQUEAMP</span>
        <span className="theme-preview__ticker">&gt; NOW PLAYING</span>
      </div>
      <div className="theme-preview__body">
        <div className="theme-preview__nav">
          <span className="nav-item active">Now Playing</span>
          <span className="nav-item">Browse</span>
          <span className="nav-item">Playlists</span>
        </div>
        <div className="panel theme-preview__panel">
          <div className="panel__header">
            <span className="panel__title panel__title--accent">Now Playing</span>
            <span className="panel__actions">
              <span className="badge">Radio</span>
              <span className="badge">Live</span>
            </span>
          </div>
          <div className="panel__body theme-preview__content">
            <strong className="display theme-preview__title">Track Title</strong>
            <span>Artist</span>
            <span className="muted">Album · 2010</span>
            <span className="theme-preview__statuses">
              <span className="status status--ok">
                <span className="status__dot" />
                ONLINE
              </span>
              <span className="status status--live">
                <span className="status__dot" />
                LIVE
              </span>
              <span className="status status--warn">
                <span className="status__dot" />
                BUFFERING
              </span>
              <span className="status status--error">
                <span className="status__dot" />
                ERROR
              </span>
            </span>
            <div className="theme-preview__bars" aria-hidden="true">
              {bars.map((h, i) => (
                <span key={i} style={{ height: `${h * 100}%`, background: i % 3 === 2 ? 'var(--la-visualizer-secondary)' : 'var(--la-visualizer)' }} />
              ))}
            </div>
            <span className="theme-preview__progress" aria-hidden="true">
              <span />
            </span>
            <span className="theme-preview__buttons">
              <span className="btn btn--primary">Play</span>
              <span className="btn">Queue</span>
              <span className="btn" aria-disabled="true" style={{ color: 'var(--la-text-disabled)' }}>
                Disabled
              </span>
            </span>
          </div>
        </div>
      </div>
      <div className="theme-preview__row">
        <span className="row__index">01</span> Station name <span className="muted">· genre</span>
      </div>
      <div className="theme-preview__row theme-preview__row--current">
        <span className="row__index">02</span> Playing station
      </div>
    </div>
  );
}
