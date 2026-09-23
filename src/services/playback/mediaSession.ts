import { usePlayback, usePlaybackClock, type PlaybackStatus } from '../../stores/playbackStore';
import type { PlaybackEngine } from './engine';

/** Seconds for the lock-screen / headset skip buttons when the source can seek. */
export const MEDIA_SESSION_SEEK_OFFSET = 10;

type EngineCommands = Pick<PlaybackEngine, 'play' | 'pause' | 'next' | 'previous' | 'seek' | 'seekBy' | 'stop'>;

const SESSION_STATE: Record<PlaybackStatus, MediaSessionPlaybackState> = {
  idle: 'none',
  error: 'paused',
  paused: 'paused',
  loading: 'playing',
  buffering: 'playing',
  playing: 'playing',
};

/**
 * Connects the browser Media Session (lock screen, notification, media keys,
 * headsets) to the central playback engine (ARCH §33, MASTER §73). Every
 * action calls the same engine commands as the on-screen controls. Seeking is
 * offered only while the current source can actually seek (PROVIDERS §53).
 * Returns a cleanup function; does nothing where the API is missing.
 */
export function startMediaSession(engine: EngineCommands, session: MediaSession | undefined = navigator.mediaSession): () => void {
  if (!session) return () => undefined;

  const handle = (action: MediaSessionAction, handler: MediaSessionActionHandler | null) => {
    try {
      session.setActionHandler(action, handler);
    } catch {
      // action not supported by this browser
    }
  };

  handle('play', () => void engine.play());
  handle('pause', () => engine.pause());
  handle('stop', () => engine.stop());
  handle('previoustrack', () => void engine.previous());
  handle('nexttrack', () => void engine.next());

  let seekable: boolean | null = null;
  const setSeekable = (canSeek: boolean) => {
    if (canSeek === seekable) return;
    seekable = canSeek;
    handle('seekbackward', canSeek ? (d) => engine.seekBy(-(d.seekOffset ?? MEDIA_SESSION_SEEK_OFFSET)) : null);
    handle('seekforward', canSeek ? (d) => engine.seekBy(d.seekOffset ?? MEDIA_SESSION_SEEK_OFFSET) : null);
    handle('seekto', canSeek ? (d) => d.seekTime !== undefined && engine.seek(d.seekTime) : null);
  };

  const MetadataCtor = typeof MediaMetadata === 'undefined' ? null : MediaMetadata;

  const syncMetadata = () => {
    const { currentItem: item, streamInfo, isLive } = usePlayback.getState();
    if (!item || !MetadataCtor) {
      session.metadata = null;
      return;
    }
    session.metadata = new MetadataCtor({
      title: item.title,
      // Only real values: the item's artist, or for radio the station name the stream declared.
      artist: item.artist ?? (isLive && streamInfo?.stationName && streamInfo.stationName !== item.title ? streamInfo.stationName : ''),
      album: item.album ?? '',
      artwork: item.artwork ? [{ src: item.artwork }] : [],
    });
  };

  let lastPosition = { duration: Number.NaN, position: -1, at: 0 };
  const syncPosition = (force = false) => {
    if (!session.setPositionState) return;
    const { canSeek, isLive, status } = usePlayback.getState();
    const { currentTime, duration } = usePlaybackClock.getState();
    try {
      if (!canSeek || isLive || !Number.isFinite(duration) || duration <= 0) {
        if (lastPosition.position !== -1) session.setPositionState();
        lastPosition = { duration: Number.NaN, position: -1, at: 0 };
        return;
      }
      const position = Math.min(Math.max(0, currentTime), duration);
      // The browser extrapolates while playing; only correct it on jumps.
      const now = performance.now();
      const expected = lastPosition.position + (status === 'playing' ? (now - lastPosition.at) / 1000 : 0);
      if (!force && duration === lastPosition.duration && Math.abs(position - expected) < 1.5) return;
      session.setPositionState({ duration, position, playbackRate: 1 });
      lastPosition = { duration, position, at: now };
    } catch {
      // invalid state (e.g. position briefly beyond duration) — try again next tick
    }
  };

  const syncAll = () => {
    const s = usePlayback.getState();
    session.playbackState = SESSION_STATE[s.status];
    setSeekable(s.canSeek && !s.isLive);
    syncMetadata();
    syncPosition(true);
  };
  syncAll();

  const unsubPlayback = usePlayback.subscribe((s, prev) => {
    if (s.status !== prev.status) session.playbackState = SESSION_STATE[s.status];
    if (s.canSeek !== prev.canSeek || s.isLive !== prev.isLive) setSeekable(s.canSeek && !s.isLive);
    if (s.currentItem !== prev.currentItem || s.streamInfo !== prev.streamInfo || s.isLive !== prev.isLive) syncMetadata();
    if (s.status !== prev.status || s.canSeek !== prev.canSeek || s.currentItem !== prev.currentItem) syncPosition(true);
  });
  const unsubClock = usePlaybackClock.subscribe(() => syncPosition());

  return () => {
    unsubPlayback();
    unsubClock();
    for (const action of ['play', 'pause', 'stop', 'previoustrack', 'nexttrack', 'seekbackward', 'seekforward', 'seekto'] as const) handle(action, null);
    session.metadata = null;
    session.playbackState = 'none';
  };
}
