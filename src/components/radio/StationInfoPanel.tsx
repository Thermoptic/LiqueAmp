import type { ReactNode } from 'react';
import { ExternalLink } from 'lucide-react';
import { isInsecureForPage } from '../../services/radio/stations';
import { usePlayback } from '../../stores/playbackStore';
import { useUi } from '../../stores/uiStore';
import { stationFor, useFavorites } from '../../stores/favoritesStore';
import type { RadioStation } from '../../types/media';
import { EmptyState, Status } from '../ui/controls';
import { StationIcon } from './StationRow';

const dateFmt = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="kv-list__row station-info__row">
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

/**
 * Details of the selected station. Directory values are labelled as declared
 * by the directory; a real listener count is never shown because the
 * directory does not provide one (SPEC §23).
 */
export function StationInfoPanel() {
  const selection = useUi((s) => s.selection);
  const current = usePlayback((s) => s.currentItem);
  const stations = useFavorites((s) => s.stations);
  const selected = selection?.kind === 'station' ? selection.station : null;
  // Nothing selected: show the station that is playing, like Quick Actions does.
  const playingStation = !selected && current ? (stationFor(current, stations) ?? null) : null;
  const station = selected ?? playingStation;

  return (
    <section className="panel area-station" aria-labelledby="station-heading">
      <header className="panel__header">
        <h2 className="panel__title panel__title--small" id="station-heading">
          Station Info
        </h2>
        {playingStation && <span className="panel__actions muted quick-actions__target">NOW PLAYING</span>}
      </header>
      <div className="panel__body">{station ? <StationDetails station={station} /> : <EmptyState title="NO STATION SELECTED">Select a station to see its details.</EmptyState>}</div>
    </section>
  );
}

function StationDetails({ station }: { station: RadioStation }) {
  const isPlaying = usePlayback((s) => s.currentItem?.id === station.id);
  const live = usePlayback((s) => (s.currentItem?.id === station.id ? s.streamInfo : null));
  const location = [station.state, station.country].filter(Boolean).join(', ');

  return (
    <div className="station-info">
      <div className="station-info__head">
        <div className="station-info__titles">
          <h3 className="station-info__name display">{station.name}</h3>
          {station.genre.length > 0 && <p className="station-info__genre">{station.genre.join(' · ')}</p>}
          {isPlaying && <Status tone="live">NOW PLAYING</Status>}
        </div>
        <StationIcon station={station} size={72} />
      </div>
      <dl className="kv-list">
        {location && <Row label="Location">{location}</Row>}
        {station.language && <Row label="Language">{station.language}</Row>}
        <Row label="Codec">
          {live?.codec ? `${live.codec} (stream)` : station.codec ? `${station.codec} (directory)` : '—'}
        </Row>
        <Row label="Bitrate">
          {live?.bitrateKbps ? `${live.bitrateKbps} kbps (stream)` : station.bitrate ? `${station.bitrate} kbps (directory)` : '—'}
        </Row>
        <Row label="Listeners">—</Row>
        {station.directory?.clicks !== undefined && <Row label="Directory clicks">{station.directory.clicks.toLocaleString()}</Row>}
        {station.directory?.votes !== undefined && <Row label="Votes">{station.directory.votes.toLocaleString()}</Row>}
        <Row label="Status">
          {station.online === undefined ? (
            '—'
          ) : (
            <Status tone={station.online ? 'ok' : 'error'}>
              {station.online ? 'ONLINE' : 'OFFLINE'}
              {station.lastChecked ? ` · checked ${dateFmt.format(new Date(station.lastChecked))}` : ''}
            </Status>
          )}
        </Row>
        {station.homepage && (
          <Row label="Website">
            <a href={station.homepage} target="_blank" rel="noreferrer noopener" className="station-info__link">
              <span className="truncate">{station.homepage.replace(/^https?:\/\//, '').replace(/\/$/, '')}</span>
              <ExternalLink size={12} aria-hidden="true" />
            </a>
          </Row>
        )}
        <Row label="Stream">
          <span className="station-info__url">{station.streamUrl}</span>
        </Row>
      </dl>
      {isInsecureForPage(station.streamUrl) && (
        <p className="notice">This station only offers an http:// stream. Browsers block it on a secure (https) page.</p>
      )}
    </div>
  );
}
