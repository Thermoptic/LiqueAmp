import { EmptyState } from '../ui/controls';

export function StationInfoPanel() {
  return (
    <section className="panel area-station" aria-labelledby="station-heading">
      <header className="panel__header">
        <h2 className="panel__title panel__title--small" id="station-heading">
          Station Info
        </h2>
      </header>
      <div className="panel__body panel__body--flush">
        <EmptyState title="NO STATION SELECTED">Select a station or track to see its details.</EmptyState>
      </div>
    </section>
  );
}
