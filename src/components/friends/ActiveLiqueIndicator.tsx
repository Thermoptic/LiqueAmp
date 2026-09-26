import { Undo2 } from 'lucide-react';
import { useFriends } from '../../stores/friendsStore';

/**
 * In the header, on every screen (Home, every mobile section, /control)
 * while a Friend Lique is shown instead of mine (spec §20): whose Lique it
 * is, that it is read-only, and the way back. Nothing is rendered otherwise.
 */
export function ActiveLiqueIndicator() {
  const active = useFriends((s) => s.active);
  const returning = useFriends((s) => s.activation.status === 'working' && s.activation.action === 'return');
  const returnToMyLique = useFriends((s) => s.returnToMyLique);
  if (!active) return null;
  return (
    <div className="app-header__block app-header__lique" role="status" aria-label={`Friend Lique active: @${active.username}, read only`}>
      <span className="app-header__lique-label">FRIEND LIQUE ACTIVE</span>
      <span className="app-header__lique-name">
        @{active.username} <span className="app-header__lique-ro">· READ ONLY</span>
      </span>
      <button
        type="button"
        className="btn btn--ghost app-header__lique-return"
        aria-label="Return to My Lique"
        title="Return to My Lique"
        disabled={returning}
        onClick={() => void returnToMyLique()}
      >
        <Undo2 size={14} aria-hidden="true" /> {returning ? 'Returning…' : 'My Lique'}
      </button>
    </div>
  );
}
