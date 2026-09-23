import {
  INITIAL_PLAYBACK,
  usePlayback,
  usePlaybackClock,
  type AnalysisAvailability,
  type AudioEngineState,
  type PlaybackError,
} from '../../stores/playbackStore';
import { useQueue, toEntries } from '../../stores/queueStore';
import { useSettings } from '../../stores/settingsStore';
import type { MediaItem, PlaybackMode } from '../../types/media';
import type { AudioBackend, BackendListener, BackendMeta, BackendStatus } from './backend';
import { PlaybackFailure, playbackError, providerNotSupported } from './errors';
import { NativeAudioBackend } from './nativeAudio';
import * as Q from './queue';

/** Seconds into a track after which Previous restarts it instead of going back. */
const RESTART_THRESHOLD = 3;

export function resolvePlaybackMode(item: MediaItem): PlaybackMode {
  switch (item.playbackType) {
    case 'direct':
    case 'radio':
      return 'native-audio';
    case 'embed':
      return 'embedded';
    case 'external':
      return 'external';
  }
}

/**
 * The one central playback engine (ARCH §7, MASTER §13). It owns the session:
 * which queue entry is current, loading, transport, errors. UI components and
 * (later) Media Session and keyboard shortcuts all call into this object;
 * nothing else creates audio. It lives outside React, so navigation, theme or
 * visualizer changes never interrupt playback.
 */
export class PlaybackEngine implements BackendListener {
  private loadToken = 0;

  constructor(private readonly backend: AudioBackend) {
    backend.setListener(this);
    const applyVolume = () => {
      const s = useSettings.getState();
      backend.setVolume(s.volume, s.muted);
    };
    applyVolume();
    useSettings.subscribe((s, prev) => {
      if (s.volume !== prev.volume || s.muted !== prev.muted) applyVolume();
    });
  }

  // ---- queue-level commands ------------------------------------------------

  /** Replaces the queue with `items` and starts at `startIndex`. */
  playList(items: MediaItem[], startIndex = 0): Promise<void> {
    this.backend.prime();
    const entries = toEntries(items);
    useQueue.getState().apply({ ...Q.EMPTY_QUEUE, entries });
    const start = entries[Math.max(0, Math.min(entries.length - 1, startIndex))];
    return start ? this.playEntry(start.entryId) : Promise.resolve();
  }

  /** Inserts after the current entry and plays it immediately (DESIGN §76). */
  playNow(item: MediaItem): Promise<void> {
    this.backend.prime();
    const [entry] = useQueue.getState().addNext([item]);
    return entry ? this.playEntry(entry.entryId) : Promise.resolve();
  }

  /** Adds to the end of the queue. Never starts playback. */
  enqueue(items: MediaItem[]): void {
    useQueue.getState().add(items);
  }

  playEntry(entryId: string, recordHistory = true): Promise<void> {
    this.backend.prime();
    const q = useQueue.getState();
    const next = Q.setCurrent(q, entryId, recordHistory);
    useQueue.getState().apply(next);
    const entry = Q.currentEntry(next);
    return entry ? this.load(entry.item, true) : Promise.resolve();
  }

  // ---- transport -----------------------------------------------------------

  togglePlay(): Promise<void> {
    const { status } = usePlayback.getState();
    if (status === 'playing' || status === 'buffering' || status === 'loading') {
      this.pause();
      return Promise.resolve();
    }
    return this.play();
  }

  play(): Promise<void> {
    this.backend.prime();
    const { status, currentItem } = usePlayback.getState();
    if (currentItem && status === 'paused') return this.backend.play();
    if (currentItem && status === 'error') return this.load(currentItem, true);
    const q = useQueue.getState();
    const target = Q.currentEntry(q) ?? q.entries[0];
    return target ? this.playEntry(target.entryId, false) : Promise.resolve();
  }

  pause(): void {
    this.backend.pause();
    // Pausing during loading: the element has not fired 'pause' yet.
    if (usePlayback.getState().status === 'loading') usePlayback.setState({ status: 'paused' });
  }

  stop(): void {
    this.loadToken++;
    this.backend.stop();
    usePlayback.setState({ ...INITIAL_PLAYBACK, audioEngine: usePlayback.getState().audioEngine });
    usePlaybackClock.setState({ currentTime: 0, duration: Number.NaN, bufferedAhead: 0 });
    useQueue.getState().apply({ ...useQueue.getState(), currentId: null });
  }

  next(auto = false): Promise<void> {
    if (!auto) this.backend.prime();
    const { shuffle, repeat } = useSettings.getState();
    const q = useQueue.getState();
    const result = Q.computeNext(q, { shuffle, repeat, auto });
    if (!result.entryId) {
      if (auto) usePlayback.setState({ status: 'paused' }); // end of queue: stay on the last item
      return Promise.resolve();
    }
    useQueue.getState().apply({ ...q, played: result.played });
    if (result.entryId === q.currentId) {
      this.backend.seek(0);
      return this.backend.play();
    }
    return this.playEntry(result.entryId);
  }

  previous(): Promise<void> {
    this.backend.prime();
    const { canSeek } = usePlayback.getState();
    if (canSeek && this.backend.currentTime > RESTART_THRESHOLD) {
      this.backend.seek(0);
      return Promise.resolve();
    }
    const { shuffle, repeat } = useSettings.getState();
    const q = useQueue.getState();
    const id = Q.computePrevious(q, { shuffle, repeat });
    if (!id) {
      if (canSeek) this.backend.seek(0);
      return Promise.resolve();
    }
    // Walking back consumes history instead of adding to it.
    const lastIndex = q.history.lastIndexOf(id);
    const history = lastIndex >= 0 ? q.history.slice(0, lastIndex) : q.history;
    useQueue.getState().apply({ ...q, history });
    return this.playEntry(id, false);
  }

  seek(seconds: number): void {
    if (usePlayback.getState().canSeek) this.backend.seek(seconds);
  }

  seekBy(delta: number): void {
    this.seek(this.backend.currentTime + delta);
  }

  // ---- loading -------------------------------------------------------------

  private async load(item: MediaItem, autoplay: boolean): Promise<void> {
    const token = ++this.loadToken;
    const mode = resolvePlaybackMode(item);
    usePlayback.setState({ currentItem: item, mode, status: 'loading', error: null, isLive: false, canSeek: false });
    usePlaybackClock.setState({ currentTime: 0, duration: item.duration ?? Number.NaN, bufferedAhead: 0 });

    if (mode !== 'native-audio') {
      this.backend.stop();
      usePlayback.setState({ status: 'error', error: providerNotSupported(item) });
      return;
    }
    const url = item.streamUrl || item.sourceUrl;
    try {
      await this.backend.load(url);
      if (token !== this.loadToken) return;
      if (autoplay) await this.backend.play();
      else usePlayback.setState({ status: 'paused' });
    } catch (err) {
      if (token !== this.loadToken) return;
      const error = err instanceof PlaybackFailure ? err.error : playbackError('STREAM_UNAVAILABLE', String(err));
      usePlayback.setState({ status: 'error', error });
    }
  }

  // ---- backend events ------------------------------------------------------

  onStatus(status: BackendStatus): void {
    const current = usePlayback.getState();
    if (current.status === 'error' && status !== 'playing') return;
    usePlayback.setState({ status, error: status === 'playing' ? null : current.error });
  }

  onEnded(): void {
    void this.next(true);
  }

  onError(error: PlaybackError): void {
    usePlayback.setState({ status: 'error', error });
  }

  onMeta(meta: BackendMeta): void {
    usePlayback.setState({ isLive: meta.isLive, canSeek: meta.canSeek });
    usePlaybackClock.setState({ duration: meta.duration });
  }

  onClock(currentTime: number, duration: number, bufferedAhead: number): void {
    usePlaybackClock.setState({ currentTime, duration, bufferedAhead });
  }

  onAnalysis(analysis: AnalysisAvailability, audioEngine: AudioEngineState): void {
    usePlayback.setState({ analysis, audioEngine });
  }
}

let instance: PlaybackEngine | null = null;

/** The app-wide engine. Created on first use because it needs a DOM. */
export function getEngine(): PlaybackEngine {
  instance ??= new PlaybackEngine(new NativeAudioBackend());
  return instance;
}

// Dev only: hot-swapping this module would create a second engine with its own
// audio elements while the first keeps playing. Reload the page instead.
if (import.meta.hot) {
  import.meta.hot.accept(() => location.reload());
}
