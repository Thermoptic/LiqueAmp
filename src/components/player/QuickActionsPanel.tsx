import { Ellipsis, Heart, Play, Plus, Share2 } from 'lucide-react';

const ACTIONS = [
  { id: 'play', label: 'Play Now', icon: Play, primary: true },
  { id: 'queue', label: 'Add to Queue', icon: Plus },
  { id: 'favourite', label: 'Add to Favourites', icon: Heart },
  { id: 'share', label: 'Share', icon: Share2 },
  { id: 'more', label: 'More Actions', icon: Ellipsis },
] as const;

/** Actions apply to the selected item; with no selection they are disabled. */
export function QuickActionsPanel() {
  const hasSelection = false;
  return (
    <section className="panel area-actions" aria-labelledby="qa-heading">
      <header className="panel__header">
        <h2 className="panel__title panel__title--small" id="qa-heading">
          Quick Actions
        </h2>
      </header>
      <div className="panel__body quick-actions">
        {ACTIONS.map(({ id, label, icon: Icon, ...rest }) => (
          <button
            key={id}
            type="button"
            className={`btn btn--block ${'primary' in rest ? 'btn--primary' : ''}`}
            disabled={!hasSelection}
          >
            <Icon size={15} aria-hidden="true" />
            {label}
          </button>
        ))}
        {!hasSelection && <p className="quick-actions__hint muted">Select a station or track first.</p>}
      </div>
    </section>
  );
}
