import { useState } from 'react';
import { Trash2, X } from 'lucide-react';
import { getEngine } from '../../services/playback/engine';
import { useHistory } from '../../stores/historyStore';
import { useUi } from '../../stores/uiStore';
import { Dialog } from '../ui/Dialog';
import { EmptyState } from '../ui/controls';
import { PROVIDER_LABEL } from '../player/NowPlayingPanel';
import { MediaRow } from './MediaRow';
import { RowList } from '../ui/RowList';

const timeFmt = new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' });
const dayFmt = new Intl.DateTimeFormat(undefined, { weekday: 'short', day: 'numeric', month: 'short' });

export function formatListened(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  if (m < 60) return `${m}m ${String(seconds % 60).padStart(2, '0')}s`;
  return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m`;
}

function when(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  return d.toDateString() === today.toDateString() ? timeFmt.format(d) : `${dayFmt.format(d)} ${timeFmt.format(d)}`;
}

/** Recorded playback, newest first (SPEC §22). Replay uses the stored snapshot. */
export function HistoryView() {
  const entries = useHistory((s) => s.entries);
  const clear = useHistory((s) => s.clear);
  const remove = useHistory((s) => s.remove);
  const toast = useUi((s) => s.toast);
  const [confirming, setConfirming] = useState(false);

  if (entries.length === 0) {
    return <EmptyState title="NO HISTORY">Items you listen to for at least 5 seconds are recorded here.</EmptyState>;
  }

  return (
    <>
      <div className="library-toolbar">
        <span className="muted">{entries.length === 1 ? '1 play' : `${entries.length} plays`}</span>
        <button type="button" className="btn btn--danger" onClick={() => setConfirming(true)}>
          <Trash2 size={14} aria-hidden="true" /> Clear
        </button>
      </div>
      <RowList aria-label="Playback history">
        {entries.map((e, i) => (
          <MediaRow
            key={e.id}
            item={e.item}
            index={i}
            onActivate={() => void getEngine().playNow(e.item)}
            meta={[
              when(e.startedAt),
              PROVIDER_LABEL[e.item.provider] ?? e.item.provider,
              `${formatListened(e.durationPlayed)} listened`,
              e.completionPercentage !== undefined ? `${e.completionPercentage}%` : null,
            ]
              .filter(Boolean)
              .join(' · ')}
            actions={
              <button type="button" className="btn btn--ghost btn--icon" aria-label={`Remove ${e.item.title} from history`} onClick={() => void remove(e.id)}>
                <X size={14} />
              </button>
            }
          />
        ))}
      </RowList>
      <Dialog
        open={confirming}
        title="Clear history"
        submitLabel="Clear history"
        danger
        onClose={() => setConfirming(false)}
        onSubmit={() => {
          setConfirming(false);
          void clear().then(() => toast('History cleared', 'success'));
        }}
      >
        <p>Remove all {entries.length} history entries? Your library, playlists and favourites are not affected.</p>
      </Dialog>
    </>
  );
}
