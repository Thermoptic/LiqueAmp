import { EmptyState } from '../ui/controls';

export function QueuePanel() {
  const count = 0;
  return (
    <section className="panel area-queue" aria-labelledby="queue-heading">
      <header className="panel__header">
        <h2 className="panel__title panel__title--small" id="queue-heading">
          Queue ({count})
        </h2>
        <div className="panel__actions">
          <button type="button" className="btn btn--ghost" disabled={count === 0}>
            Clear
          </button>
        </div>
      </header>
      <div className="panel__body panel__body--flush">
        <EmptyState title="QUEUE EMPTY">Add something to start building the queue.</EmptyState>
      </div>
    </section>
  );
}
