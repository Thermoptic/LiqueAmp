import { NavLink, Link, useParams } from 'react-router';
import { ArrowLeft } from 'lucide-react';
import { Header } from '../layout/Header';
import { PendingTag } from '../ui/controls';
import { SystemSection } from './SystemSection';
import { CategoriesSection } from './CategoriesSection';
import { ThemesSection } from './ThemesSection';
import { MediaSection } from './MediaSection';
import { VisualizersSection } from './VisualizersSection';

const SECTIONS = [
  { id: 'system', label: 'System' },
  { id: 'categories', label: 'Categories' },
  { id: 'themes', label: 'Themes' },
  { id: 'media', label: 'Media' },
  { id: 'providers', label: 'Providers' },
  { id: 'visualizers', label: 'Visualizers' },
  { id: 'import-export', label: 'Import / Export' },
  { id: 'pwa', label: 'PWA' },
] as const;

const PENDING_TEXT: Record<string, string> = {
  providers: 'Provider status and configuration arrive with the provider adapters.',
  'import-export': 'Data export and validated import are not implemented yet.',
  pwa: 'Installability and offline configuration are not implemented yet.',
};

/** Private configuration area (SPEC §34). Separate from user Settings. */
export function ControlPage() {
  const { section = 'system' } = useParams();
  const current = SECTIONS.find((s) => s.id === section) ?? SECTIONS[0];

  return (
    <div className="control-page">
      <Header />
      <div className="control-page__body">
        <nav className="panel control-page__nav" aria-label="Control sections">
          <header className="panel__header">
            <h1 className="panel__title panel__title--accent">Control</h1>
          </header>
          <ul className="nav-list">
            {SECTIONS.map((s) => (
              <li key={s.id}>
                <NavLink to={`/control/${s.id}`} className={() => `nav-item ${s.id === current.id ? 'active' : ''}`}>
                  <span>{s.label}</span>
                </NavLink>
              </li>
            ))}
          </ul>
          <Link to="/" className="btn btn--block control-page__back">
            <ArrowLeft size={14} aria-hidden="true" /> Back to player
          </Link>
        </nav>
        <main className="control-page__main">
          {current.id === 'system' && <SystemSection />}
          {current.id === 'categories' && <CategoriesSection />}
          {current.id === 'themes' && <ThemesSection />}
          {current.id === 'media' && <MediaSection />}
          {current.id === 'visualizers' && <VisualizersSection />}
          {current.id in PENDING_TEXT && (
            <section className="panel">
              <header className="panel__header">
                <h2 className="panel__title">{current.label}</h2>
                <div className="panel__actions">
                  <PendingTag />
                </div>
              </header>
              <div className="panel__body">
                <p className="muted">{PENDING_TEXT[current.id]}</p>
              </div>
            </section>
          )}
        </main>
      </div>
    </div>
  );
}
