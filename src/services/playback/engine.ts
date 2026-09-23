import {
  INITIAL_PLAYBACK,
  usePlayback,
  usePlaybackClock,
  type AnalysisAvailability,
  type AudioEngineState,
  type PlaybackError,
  type StreamInfo,
} from '../../stores/playbackStore';
import { useQueue, toEntries } from '../../stores/queueStore';
import { useSettings } from '../../stores/settingsStore';
import type { MediaItem, PlaybackMode } from '../../types/media';
import type { AudioBackend, BackendListener, BackendMeta, BackendStatus } from './backend';
import { planDirectPlayback, type PlaybackCandidate } from '../providers/direct';
import { ProviderError } from '../providers/errors';
import { PlaybackFailure, playbackError, providerNotSupported } from './errors';
import { NativeAudioBackend } from './nativeAudio';
import * as Q from './queue';

/** Seconds into a track after which Previous restarts it instead of going back. */
const RESTART_THRESHOLD = 3;

/** Turns an item into the URLs to try, in order. */
export type PlaybackPlanner = (item: MediaItem) => Promise<PlaybackCandidate[]>;

/** Errors worth retrying on another mirror from the same playlist. */
const MIRROR_RETRY: ReadonlySet<PlaybackError['code']> = new Set(['STREAM_UNAVAILABLE', 'NETWORK_ERROR', 'MEDIA_FORMAT_NOT_SUPPORTED']);

function fromProviderError(err: ProviderError): PlaybackError {
  switch (err.code) {
    case 'CORS_ERROR':
      return playbackError('PLAYLIST_UNREADABLE', err.message, false);
    case 'NETWORK_ERROR':
      return playbackError('NETWORK_ERROR', err.message);
    case 'NOT_FOUND':
      return playbackError('STREAM_UNAVAILABLE', err.message);
    default:
      return playbackError('INVALID_SOURCE', err.message, false);
  }
}

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
  private candidates: PlaybackCandidate[] = [];
  private candidateIndex = 0;
  private autoplay = true;

  constructor(
    private readonly backend: AudioBackend,
    private readonly plan: PlaybackPlanner = (item) => planDirectPlayback(item),
  ) {
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
    usePlayback.setState({
      currentItem: item,
      mode,
      status: 'loading',
      error: null,
      isLive: false,
      canSeek: false,
      streamInfo: null,
      activeUrl: null,
    });
    usePlaybackClock.setState({ currentTime: 0, duration: item.duration ?? Number.NaN, bufferedAhead: 0 });

    if (mode !== 'native-audio') {
      this.backend.stop();
      usePlayback.setState({ status: 'error', error: providerNotSupported(item) });
      return;
    }

    let candidates: PlaybackCandidate[];
    try {
      candidates = await this.plan(item);
    } catch (err) {
      if (token !== this.loadToken) return;
      this.backend.stop();
      const error = err instanceof ProviderError ? fromProviderError(err) : playbackError('STREAM_UNAVAILABLE', String(err));
      usePlayback.setState({ status: 'error', error });
      return;
    }
    if (token !== this.loadToken) return;
    if (candidates.length === 0) {
      usePlayback.setState({ status: 'error', error: playbackError('INVALID_SOURCE', 'This source contains nothing playable.', false) });
      return;
    }
    this.candidates = candidates;
    this.candidateIndex = 0;
    this.autoplay = autoplay;
    await this.tryCandidate(token);
  }

  private async tryCandidate(token: number): Promise<void> {
    const candidate = this.candidates[this.candidateIndex]!;
    usePlayback.setState({ activeUrl: candidate.url, status: 'loading', error: null });
    try {
      await this.backend.load(candidate.url, candidate.format);
      if (token !== this.loadToken) return;
      if (this.autoplay) await this.backend.play();
      else usePlayback.setState({ status: 'paused' });
    } catch (err) {
      if (token !== this.loadToken) return;
      const error = err instanceof PlaybackFailure ? err.error : playbackError('STREAM_UNAVAILABLE', String(err));
      if (!this.tryNextCandidate(error)) usePlayback.setState({ status: 'error', error });
    }
  }

  /** Moves to the next mirror if this error is worth retrying. */
  private tryNextCandidate(error: PlaybackError): boolean {
    if (!MIRROR_RETRY.has(error.code) || this.candidateIndex + 1 >= this.candidates.length) return false;
    this.candidateIndex++;
    void this.tryCandidate(this.loadToken);
    return true;
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
    if (this.tryNextCandidate(error)) return;
    usePlayback.setState({ status: 'error', error });
  }

  onStreamInfo(streamInfo: StreamInfo | null): void {
    usePlayback.setState({ streamInfo });
  }

  onMeta(meta: BackendMeta): void {
    // A source declared live (radio directory, PLS `Length=-1`) stays live even
    // if the browser derives a finite duration from stream headers.
    const declaredLive = usePlayback.getState().currentItem?.playbackType === 'radio';
    usePlayback.setState({ isLive: meta.isLive || declaredLive, canSeek: meta.canSeek && !declaredLive });
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
