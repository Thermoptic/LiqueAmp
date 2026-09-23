import { Pause, Play, Repeat, Repeat1, Shuffle, SkipBack, SkipForward } from 'lucide-react';
import { usePlayback } from '../../stores/playbackStore';
import { useSettings } from '../../stores/settingsStore';
import type { RepeatMode } from '../../types/settings';
import { Artwork } from '../ui/Artwork';
import { Status } from '../ui/controls';
import { VolumeControl } from './VolumeControl';

const PROVIDER_LABEL: Record<string, string> = {
  direct: 'Direct',
  radio: 'Radio',
  youtube: 'YouTube',
  'youtube-music': 'YTM',
  spotify: 'Spotify',
  soundcloud: 'SoundCloud',
};

const NEXT_REPEAT: Record<RepeatMode, RepeatMode> = { off: 'all', all: 'one', one: 'off' };

export function NowPlayingPanel() {
  const item = usePlayback((s) => s.currentItem);
  const status = usePlayback((s) => s.status);
  const isLive = usePlayback((s) => s.isLive);

  return (
    <section className="panel panel--strong now-playing area-main" aria-labelledby="np-heading">
      <header className="panel__header">
        <h2 className="panel__title panel__title--accent" id="np-heading">
          Now Playing
        </h2>
        {item && (
          <div className="panel__actions">
            <span className="badge">{PROVIDER_LABEL[item.provider] ?? item.provider}</span>
            <span className="badge">{item.playbackType}</span>
          </div>
        )}
      </header>

      <div className="now-playing__body">
        <Artwork className="now-playing__art" src={item?.artwork} alt={item ? `Artwork for ${item.title}` : 'No artwork'} />

        <div className="now-playing__info">
          <div className="now-playing__title-row">
            {status === 'playing' && <Play size={18} className="now-playing__state-icon" aria-hidden="true" />}
            <h3 className="now-playing__title display truncate">{item ? item.title : 'Nothing playing'}</h3>
            {isLive && (
              <Status tone="live">
                <span className="display">LIVE</span>
              </Status>
            )}
          </div>
          {item ? (
            <>
              {item.artist && <p className="now-playing__artist truncate">{item.artist}</p>}
              {item.album && <p className="now-playing__album truncate">{item.album}</p>}
              {item.tags && item.tags.length > 0 && (
                <ul className="tag-list" aria-label="Tags">
                  {item.tags.map((t) => (
                    <li key={t} className="tag">
                      #{t}
                    </li>
                  ))}
                </ul>
              )}
            </>
          ) : (
            <p className="now-playing__artist muted">Pick a station in Browse or import a stream to start.</p>
          )}
          <PlayerStateLine />
        </div>

        <div className="now-playing__viz" role="img" aria-label="Visualizer: no audio signal">
          <span className="now-playing__viz-label">VISUALIZER · NO AUDIO SIGNAL</span>
        </div>
      </div>

      <ProgressRow />
      <TransportRow />
    </section>
  );
}

function PlayerStateLine() {
  const status = usePlayback((s) => s.status);
  const error = usePlayback((s) => s.error);
  const tone = status === 'error' ? 'error' : status === 'playing' ? 'ok' : status === 'idle' ? 'idle' : 'warn';
  return (
    <p className="now-playing__state" aria-live="polite">
      <Status tone={tone}>[{status.toUpperCase()}]</Status>
      {error && <span className="now-playing__error">{error.message}</span>}
    </p>
  );
}

function ProgressRow() {
  const item = usePlayback((s) => s.currentItem);
  const isLive = usePlayback((s) => s.isLive);
  const canSeek = usePlayback((s) => s.canSeek);
  if (isLive) {
    return (
      <div className="progress-row progress-row--live">
        <Status tone="live">LIVE STREAM</Status>
        <span className="muted">No fixed duration — seeking is not available.</span>
      </div>
    );
  }
  return (
    <div className="progress-row">
      <span className="progress-row__time">--:--</span>
      <input
        type="range"
        className="slider"
        min={0}
        max={1}
        step={0.001}
        value={0}
        disabled={!item || !canSeek}
        aria-label="Seek"
        readOnly
      />
      <span className="progress-row__time">--:--</span>
    </div>
  );
}

function TransportRow() {
  const item = usePlayback((s) => s.currentItem);
  const status = usePlayback((s) => s.status);
  const shuffle = useSettings((s) => s.shuffle);
  const repeat = useSettings((s) => s.repeat);
  const update = useSettings((s) => s.update);
  const playing = status === 'playing';

  return (
    <div className="transport">
      <div className="transport__buttons">
        <button
          type="button"
          className="transport__btn"
          aria-label="Shuffle"
          aria-pressed={shuffle}
          onClick={() => update({ shuffle: !shuffle })}
        >
          <Shuffle size={20} />
        </button>
        <button type="button" className="transport__btn" aria-label="Previous" disabled={!item}>
          <SkipBack size={20} />
        </button>
        <button type="button" className="transport__btn transport__btn--play" aria-label={playing ? 'Pause' : 'Play'} disabled={!item}>
          {playing ? <Pause size={26} /> : <Play size={26} />}
        </button>
        <button type="button" className="transport__btn" aria-label="Next" disabled={!item}>
          <SkipForward size={20} />
        </button>
        <button
          type="button"
          className="transport__btn"
          aria-label={`Repeat: ${repeat}`}
          aria-pressed={repeat !== 'off'}
          onClick={() => update({ repeat: NEXT_REPEAT[repeat] })}
        >
          {repeat === 'one' ? <Repeat1 size={20} /> : <Repeat size={20} />}
        </button>
      </div>
      <VolumeControl />
      <div className="transport__modes">
        <button type="button" className="btn btn--accent-outline" onClick={() => update({ repeat: NEXT_REPEAT[repeat] })}>
          [R] Repeat: {repeat}
        </button>
        <button type="button" className="btn btn--accent-outline" onClick={() => update({ shuffle: !shuffle })}>
          [S] Shuffle: {shuffle ? 'on' : 'off'}
        </button>
      </div>
    </div>
  );
}
