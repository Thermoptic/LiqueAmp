import { useEffect, useRef, useState } from 'react';
import { attachEmbedSlot } from '../../services/playback/embedHost';
import { ExternalLink, Heart, Pause, Play, Repeat, Repeat1, RotateCcw, Shuffle, SkipBack, SkipForward } from 'lucide-react';
import { isItemFavorite, useFavorites } from '../../stores/favoritesStore';
import { useUi } from '../../stores/uiStore';
import { getEngine } from '../../services/playback/engine';
import { formatTime } from '../../lib/format';
import { usePlayback, usePlaybackClock, type PlaybackStatus } from '../../stores/playbackStore';
import { useQueue } from '../../stores/queueStore';
import { useSettings } from '../../stores/settingsStore';
import type { RepeatMode } from '../../types/settings';
import { Artwork } from '../ui/Artwork';
import { Status, type StatusTone } from '../ui/controls';
import { VolumeControl } from './VolumeControl';
import { EqSummary } from '../audio/EqControls';
import { VisualizerView } from '../visualizer/VisualizerView';

export const PROVIDER_LABEL: Record<string, string> = {
  direct: 'Direct',
  radio: 'Radio',
  youtube: 'YouTube',
  'youtube-music': 'YTM',
  spotify: 'Spotify',
  soundcloud: 'SoundCloud',
};

const NEXT_REPEAT: Record<RepeatMode, RepeatMode> = { off: 'all', all: 'one', one: 'off' };

export function statusTone(status: PlaybackStatus): StatusTone {
  if (status === 'error') return 'error';
  if (status === 'playing') return 'ok';
  if (status === 'idle' || status === 'paused') return 'idle';
  return 'warn';
}

export function NowPlayingPanel() {
  const item = usePlayback((s) => s.currentItem);
  const status = usePlayback((s) => s.status);
  const isLive = usePlayback((s) => s.isLive);
  const mode = usePlayback((s) => s.mode);
  const debugViz = useSettings((s) => s.render.debug);
  const showArtwork = useSettings((s) => s.artwork);

  return (
    <section className="panel panel--strong now-playing area-main" aria-labelledby="np-heading">
      <header className="panel__header">
        <h2 className="panel__title panel__title--accent" id="np-heading">
          Now Playing
        </h2>
        {item && <NowPlayingBadges />}
      </header>

      <div className="now-playing__body">
        {/* Artwork off (Settings): always the default image; a provider player
            then docks in the corner, as it must stay visible to play. */}
        {mode === 'embedded' && showArtwork ? (
          <EmbedSlot />
        ) : showArtwork ? (
          <Artwork className="now-playing__art" src={item?.artwork} alt={item ? `Artwork for ${item.title}` : 'No artwork'} />
        ) : (
          <Artwork className="now-playing__art" src={null} alt="" />
        )}

        <div className="now-playing__info">
          <div className="now-playing__title-row">
            {status === 'playing' && <Play size={18} className="now-playing__state-icon" aria-hidden="true" />}
            <h3 className="now-playing__title display" title={item?.title}>
              {item ? item.title : 'Nothing playing'}
            </h3>
            {isLive && (
              <Status tone="live">
                <span className="display">LIVE</span>
              </Status>
            )}
          </div>
          {item ? (
            <>
              <p className="now-playing__artist truncate">{item.artist ?? (isLive ? 'Live stream' : 'Unknown artist')}</p>
              <StationNameLine />
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

        <VisualizerView className="now-playing__viz" allowFullscreen diagnostics={debugViz ? 'overlay' : false} />
      </div>

      <ProgressRow />
      <TransportRow />
    </section>
  );
}

/**
 * Where the official provider player appears. The player itself lives in a
 * fixed host outside React (moving an iframe would reload it); this element
 * only tells the host where to sit.
 */
function EmbedSlot() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => (ref.current ? attachEmbedSlot(ref.current) : undefined), []);
  return <div ref={ref} className="now-playing__art now-playing__embed-slot" aria-hidden="true" />;
}

/** Provider, type and — only when the source declared them — codec and bitrate. */
function NowPlayingBadges() {
  const item = usePlayback((s) => s.currentItem);
  const isLive = usePlayback((s) => s.isLive);
  const info = usePlayback((s) => s.streamInfo);
  if (!item) return null;
  const title = info ? `Declared by the source (${info.source === 'hls-manifest' ? 'HLS manifest' : 'HTTP headers'})` : undefined;
  return (
    <div className="panel__actions now-playing__badges">
      <span className="badge">{PROVIDER_LABEL[item.provider] ?? item.provider}</span>
      <span className="badge">{isLive ? 'Live' : item.playbackType === 'radio' ? 'Radio' : item.playbackType === 'embed' ? 'Embed' : 'Stream'}</span>
      {item.metadata?.format === 'hls' && <span className="badge">HLS</span>}
      {info?.codec && (
        <span className="badge" title={title}>
          {info.codec}
        </span>
      )}
      {info?.bitrateKbps && (
        <span className="badge" title={title}>
          {info.bitrateKbps} kbps
        </span>
      )}
    </div>
  );
}

function PlayerStateLine() {
  const status = usePlayback((s) => s.status);
  const error = usePlayback((s) => s.error);
  const item = usePlayback((s) => s.currentItem);

  if (error) {
    return (
      <div className="now-playing__error" role="alert">
        <Status tone="error">[ERROR] {error.title}</Status>
        <p>{error.message}</p>
        <div className="now-playing__error-actions">
          {error.recoverable && (
            <button type="button" className="btn" onClick={() => void getEngine().play()}>
              <RotateCcw size={14} aria-hidden="true" /> Retry
            </button>
          )}
          {item && (
            <a className="btn" href={item.sourceUrl} target="_blank" rel="noreferrer noopener">
              <ExternalLink size={14} aria-hidden="true" /> Open source
            </a>
          )}
        </div>
      </div>
    );
  }
  const label = status === 'loading' ? 'CONNECTING…' : status === 'buffering' ? 'BUFFERING…' : status.toUpperCase();
  return (
    <p className="now-playing__state" aria-live="polite">
      <Status tone={statusTone(status)}>[{label}]</Status>
    </p>
  );
}

/** Icecast `icy-name`, only when the server exposed it and it adds information. */
function StationNameLine() {
  const name = usePlayback((s) => s.streamInfo?.stationName);
  const title = usePlayback((s) => s.currentItem?.title);
  if (!name || name === title) return null;
  return <p className="now-playing__album truncate">{name}</p>;
}

function ProgressRow() {
  const hasItem = usePlayback((s) => Boolean(s.currentItem));
  const isLive = usePlayback((s) => s.isLive);
  const canSeek = usePlayback((s) => s.canSeek);
  const currentTime = usePlaybackClock((s) => s.currentTime);
  const duration = usePlaybackClock((s) => s.duration);
  const [drag, setDrag] = useState<number | null>(null);

  if (isLive) {
    return (
      <div className="progress-row progress-row--live">
        <Status tone="live">LIVE</Status>
        <span className="progress-row__time">{formatTime(currentTime)}</span>
        <span className="muted">listened · no fixed duration, seeking not available</span>
      </div>
    );
  }

  const max = Number.isFinite(duration) && duration > 0 ? duration : 1;
  const value = drag ?? (hasItem ? Math.min(currentTime, max) : 0);
  const commit = () => {
    if (drag !== null) getEngine().seek(drag);
    setDrag(null);
  };

  return (
    <div className="progress-row">
      <span className="progress-row__time">{hasItem ? formatTime(value) : '--:--'}</span>
      <input
        type="range"
        className="slider"
        min={0}
        max={max}
        step={0.1}
        value={value}
        disabled={!hasItem || !canSeek}
        aria-label="Seek"
        aria-valuetext={`${formatTime(value)} of ${formatTime(duration)}`}
        style={{ ['--fill' as string]: `${(value / max) * 100}%` }}
        onChange={(e) => setDrag(Number(e.currentTarget.value))}
        onPointerUp={commit}
        onKeyUp={commit}
        onBlur={commit}
      />
      <span className="progress-row__time">{hasItem ? formatTime(duration) : '--:--'}</span>
    </div>
  );
}

function FavouriteButton() {
  const item = usePlayback((s) => s.currentItem);
  const isFav = useFavorites((s) => (item ? isItemFavorite(item, s.favorites, s.stations) : false));
  const toggleItem = useFavorites((s) => s.toggleItem);
  const toast = useUi((s) => s.toast);
  return (
    <button
      type="button"
      className="btn btn--accent-outline transport__fav"
      disabled={!item}
      aria-pressed={isFav}
      onClick={() => item && void toggleItem(item).then((added) => toast(added ? 'Added to favourites' : 'Removed from favourites', 'success'))}
    >
      <Heart size={14} aria-hidden="true" /> {isFav ? 'Favourite' : 'Add favourite'}
    </button>
  );
}

function TransportRow() {
  const hasItem = usePlayback((s) => Boolean(s.currentItem));
  const status = usePlayback((s) => s.status);
  const queueLength = useQueue((s) => s.entries.length);
  const shuffle = useSettings((s) => s.shuffle);
  const repeat = useSettings((s) => s.repeat);
  const update = useSettings((s) => s.update);
  const active = status === 'playing' || status === 'buffering' || status === 'loading';
  const canPlay = hasItem || queueLength > 0;
  const engine = getEngine();

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
        <button type="button" className="transport__btn" aria-label="Previous" disabled={!canPlay} onClick={() => void engine.previous()}>
          <SkipBack size={20} />
        </button>
        <button
          type="button"
          className="transport__btn transport__btn--play"
          aria-label={active ? 'Pause' : 'Play'}
          disabled={!canPlay}
          onClick={() => void engine.togglePlay()}
        >
          {active ? <Pause size={26} /> : <Play size={26} />}
        </button>
        <button type="button" className="transport__btn" aria-label="Next" disabled={queueLength === 0} onClick={() => void engine.next()}>
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
        <EqSummary />
        <FavouriteButton />
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
