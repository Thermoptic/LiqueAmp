import { Play, Shuffle, X } from 'lucide-react';
import { getEngine } from '../../services/playback/engine';
import { formatTime } from '../../lib/format';
import { usePlayback } from '../../stores/playbackStore';
import { useQueue } from '../../stores/queueStore';
import { EmptyState } from '../ui/controls';
import { DragHandle, ReorderButtons, useDragReorder } from '../ui/reorder';

export function QueuePanel() {
  const entries = useQueue((s) => s.entries);
  const currentId = useQueue((s) => s.currentId);
  const remove = useQueue((s) => s.remove);
  const clearUpcoming = useQueue((s) => s.clearUpcoming);
  const shuffleUpcoming = useQueue((s) => s.shuffleUpcoming);
  const status = usePlayback((s) => s.status);
  const moveEntry = useQueue((s) => s.move);
  const move = (from: number, to: number) => {
    const entry = entries[from];
    if (entry) moveEntry(entry.entryId, to);
  };
  const { rowProps } = useDragReorder(move);
  const currentIndex = entries.findIndex((e) => e.entryId === currentId);
  const upcoming = currentIndex >= 0 ? entries.length - currentIndex - 1 : entries.length;

  return (
    <section className="panel area-queue" aria-labelledby="queue-heading">
      <header className="panel__header">
        <h2 className="panel__title panel__title--small" id="queue-heading">
          Queue ({entries.length})
        </h2>
        <div className="panel__actions">
          <button type="button" className="btn btn--ghost btn--icon" aria-label="Shuffle upcoming" disabled={upcoming < 2} onClick={shuffleUpcoming}>
            <Shuffle size={14} />
          </button>
          <button type="button" className="btn btn--ghost" disabled={upcoming === 0} onClick={clearUpcoming}>
            Clear
          </button>
        </div>
      </header>
      <div className="panel__body panel__body--flush">
        {entries.length === 0 ? (
          <EmptyState title="QUEUE EMPTY">Add something to start building the queue.</EmptyState>
        ) : (
          <ol className="row-list" aria-label="Queue">
            {entries.map((entry, i) => {
              const isCurrent = entry.entryId === currentId;
              const { item } = entry;
              return (
                <li key={entry.entryId} className="row queue-row" aria-current={isCurrent ? 'true' : undefined} {...rowProps(i)}>
                  <DragHandle />
                  <span className="row__index">{String(i + 1).padStart(2, '0')}</span>
                  <button
                    type="button"
                    className="queue-row__main"
                    onClick={() => void getEngine().playEntry(entry.entryId)}
                    aria-label={`Play ${item.title}${isCurrent ? ' (current)' : ''}`}
                  >
                    {isCurrent && status === 'playing' ? <Play size={12} aria-hidden="true" className="queue-row__playing" /> : null}
                    <span className="truncate">{item.artist ? `${item.artist} — ${item.title}` : item.title}</span>
                  </button>
                  <span className="queue-row__meta">
                    <span className="row__index">{item.duration ? formatTime(item.duration) : item.playbackType === 'radio' ? 'LIVE' : ''}</span>
                    <ReorderButtons index={i} count={entries.length} label={item.title} onMove={move} />
                    <button
                      type="button"
                      className="btn btn--ghost btn--icon queue-row__remove"
                      aria-label={`Remove ${item.title} from queue`}
                      onClick={() => remove(entry.entryId)}
                    >
                      <X size={14} />
                    </button>
                  </span>
                </li>
              );
            })}
          </ol>
        )}
      </div>
    </section>
  );
}
