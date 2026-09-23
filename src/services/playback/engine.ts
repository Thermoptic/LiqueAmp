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
import type { MediaItem, PlaybackMode, ProviderId } from '../../types/media';
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

/** Official provider players (PROVIDERS §33 "embedded"). */
export type EmbedKind = 'youtube' | 'soundcloud' | 'spotify';

export type EmbedFactories = Partial<Record<EmbedKind, () => AudioBackend>>;

/** Errors worth retrying on another mirror from the same playlist. */
const MIRROR_RETRY: ReadonlySet<PlaybackError['code']> = new Set(['STREAM_UNAVAILABLE', 'NETWORK_ERROR', 'MEDIA_FORMAT_NOT_SUPPORTED']);

const PROVIDER_NAME: Partial<Record<ProviderId, string>> = {
  youtube: 'YouTube',
  'youtube-music': 'YouTube Music',
  spotify: 'Spotify',
  soundcloud: 'SoundCloud',
};

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

export function embedKindFor(item: MediaItem): EmbedKind | null {
  if (item.provider === 'youtube' || item.provider === 'youtube-music') return 'youtube';
  if (item.provider === 'soundcloud') return 'soundcloud';
  if (item.provider === 'spotify') return 'spotify';
  return null;
}

/**
 * The one central playback engine (ARCH §7, MASTER §13). It owns the session:
 * which queue entry is current, loading, transport, errors. It drives one
 * backend at a time — native audio, or an official provider player — so there
 * is only ever one playback session. UI components, Media Session and keyboard
 * shortcuts all call into this object. It lives outside React, so navigation,
 * theme or visualizer changes never interrupt playback.
 */
export class PlaybackEngine {
  private loadToken = 0;
  private candidates: PlaybackCandidate[] = [];
  private candidateIndex = 0;
  private autoplay = true;
  private active: AudioBackend;
  private readonly embedded = new Map<EmbedKind, AudioBackend>();

  constructor(
    private readonly native: AudioBackend,
    private readonly plan: PlaybackPlanner = (item) => planDirectPlayback(item),
    private readonly embedFactories: EmbedFactories = {},
  ) {
    this.active = native;
    native.setListener(this.listenerFor(native));
    this.applyVolume();
    useSettings.subscribe((s, prev) => {
      if (s.volume !== prev.volume || s.muted !== prev.muted) this.applyVolume();
    });
  }

  // ---- queue-level commands ------------------------------------------------

  /** Replaces the queue with `items` and starts at `startIndex`. */
  playList(items: MediaItem[], startIndex = 0): Promise<void> {
    this.native.prime();
    const entries = toEntries(items);
    useQueue.getState().apply({ ...Q.EMPTY_QUEUE, entries });
    const start = entries[Math.max(0, Math.min(entries.length - 1, startIndex))];
    return start ? this.playEntry(start.entryId) : Promise.resolve();
  }

  /** Inserts after the current entry and plays it immediately (DESIGN §76). */
  playNow(item: MediaItem): Promise<void> {
    this.native.prime();
    const [entry] = useQueue.getState().addNext([item]);
    return entry ? this.playEntry(entry.entryId) : Promise.resolve();
  }

  /** Adds to the end of the queue. Never starts playback. */
  enqueue(items: MediaItem[]): void {
    useQueue.getState().add(items);
  }

  playEntry(entryId: string, recordHistory = true): Promise<void> {
    this.native.prime();
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
    this.native.prime();
    const { status, currentItem } = usePlayback.getState();
    if (currentItem && status === 'paused') return this.active.play();
    if (currentItem && status === 'error') return this.load(currentItem, true);
    const q = useQueue.getState();
    const target = Q.currentEntry(q) ?? q.entries[0];
    return target ? this.playEntry(target.entryId, false) : Promise.resolve();
  }

  pause(): void {
    this.active.pause();
    // Pausing during loading: the player has not reported 'paused' yet.
    if (usePlayback.getState().status === 'loading') usePlayback.setState({ status: 'paused' });
  }

  stop(): void {
    this.loadToken++;
    this.active.stop();
    this.active = this.native;
    const { audioEngine, loadId } = usePlayback.getState();
    usePlayback.setState({ ...INITIAL_PLAYBACK, audioEngine, loadId: loadId + 1 });
    usePlaybackClock.setState({ currentTime: 0, duration: Number.NaN, bufferedAhead: 0 });
    useQueue.getState().apply({ ...useQueue.getState(), currentId: null });
  }

  next(auto = false): Promise<void> {
    if (!auto) this.native.prime();
    const { shuffle, repeat } = useSettings.getState();
    const q = useQueue.getState();
    const result = Q.computeNext(q, { shuffle, repeat, auto });
    if (!result.entryId) {
      if (auto) usePlayback.setState({ status: 'paused' }); // end of queue: stay on the last item
      return Promise.resolve();
    }
    useQueue.getState().apply({ ...q, played: result.played });
    if (result.entryId === q.currentId) {
      this.active.seek(0);
      return this.active.play();
    }
    return this.playEntry(result.entryId);
  }

  previous(): Promise<void> {
    this.native.prime();
    const { canSeek } = usePlayback.getState();
    if (canSeek && this.active.currentTime > RESTART_THRESHOLD) {
      this.active.seek(0);
      return Promise.resolve();
    }
    const { shuffle, repeat } = useSettings.getState();
    const q = useQueue.getState();
    const id = Q.computePrevious(q, { shuffle, repeat });
    if (!id) {
      if (canSeek) this.active.seek(0);
      return Promise.resolve();
    }
    // Walking back consumes history instead of adding to it.
    const lastIndex = q.history.lastIndexOf(id);
    const history = lastIndex >= 0 ? q.history.slice(0, lastIndex) : q.history;
    useQueue.getState().apply({ ...q, history });
    return this.playEntry(id, false);
  }

  seek(seconds: number): void {
    if (usePlayback.getState().canSeek) this.active.seek(seconds);
  }

  seekBy(delta: number): void {
    this.seek(this.active.currentTime + delta);
  }

  // ---- backends --------------------------------------------------------------

  /** Events count only while their backend is the active one. */
  private listenerFor(backend: AudioBackend): BackendListener {
    const live = () => this.active === backend;
    return {
      onStatus: (s) => live() && this.onStatus(s),
      onEnded: () => live() && this.onEnded(),
      onError: (e) => live() && this.onError(e),
      onMeta: (m) => live() && this.onMeta(m),
      onClock: (t, d, b) => live() && this.onClock(t, d, b),
      onAnalysis: (a, e) => live() && this.onAnalysis(a, e),
      onStreamInfo: (i) => live() && this.onStreamInfo(i),
    };
  }

  private embedBackend(kind: EmbedKind): AudioBackend | null {
    let backend = this.embedded.get(kind);
    if (!backend) {
      const create = this.embedFactories[kind];
      if (!create) return null;
      backend = create();
      backend.setListener(this.listenerFor(backend));
      this.embedded.set(kind, backend);
    }
    return backend;
  }

  private switchTo(backend: AudioBackend) {
    if (backend !== this.active) {
      this.active.stop();
      this.active = backend;
    }
    this.applyVolume();
    usePlayback.setState({ canSetVolume: backend.volumeControl !== false });
  }

  private applyVolume() {
    const s = useSettings.getState();
    this.active.setVolume(s.volume, s.muted);
  }

  // ---- loading -------------------------------------------------------------

  private async load(item: MediaItem, autoplay: boolean): Promise<void> {
    const token = ++this.loadToken;
    const mode = resolvePlaybackMode(item);
    usePlayback.setState({
      loadId: usePlayback.getState().loadId + 1,
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
    this.autoplay = autoplay;

    if (mode === 'external') {
      this.switchTo(this.native);
      this.native.stop();
      const name = PROVIDER_NAME[item.provider] ?? item.provider;
      usePlayback.setState({
        status: 'error',
        error: {
          ...playbackError('PROVIDER_NOT_SUPPORTED', `This ${name} item plays on ${name} itself, not inside LIQUEAMP. Use Open source.`, false),
          title: 'OPENS EXTERNALLY',
          provider: item.provider,
        },
      });
      return;
    }

    if (mode === 'embedded') {
      const kind = embedKindFor(item);
      const backend = kind ? this.embedBackend(kind) : null;
      if (!backend) {
        this.switchTo(this.native);
        this.native.stop();
        usePlayback.setState({ status: 'error', error: providerNotSupported(item) });
        return;
      }
      this.switchTo(backend);
      usePlayback.setState({ analysis: 'provider-restricted' });
      this.candidates = [{ url: item.sourceUrl, format: 'audio' }];
      this.candidateIndex = 0;
      await this.tryCandidate(token);
      return;
    }

    this.switchTo(this.native);
    let candidates: PlaybackCandidate[];
    try {
      candidates = await this.plan(item);
    } catch (err) {
      if (token !== this.loadToken) return;
      this.native.stop();
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
    await this.tryCandidate(token);
  }

  private async tryCandidate(token: number): Promise<void> {
    const candidate = this.candidates[this.candidateIndex]!;
    const backend = this.active;
    usePlayback.setState({ activeUrl: candidate.url, status: 'loading', error: null });
    try {
      await backend.load(candidate.url, candidate.format);
      if (token !== this.loadToken) return;
      this.applyVolume();
      if (this.autoplay) await backend.play();
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

  private onStatus(status: BackendStatus): void {
    const current = usePlayback.getState();
    if (current.status === 'error' && status !== 'playing') return;
    usePlayback.setState({ status, error: status === 'playing' ? null : current.error });
  }

  private onEnded(): void {
    void this.next(true);
  }

  private onError(error: PlaybackError): void {
    if (this.tryNextCandidate(error)) return;
    usePlayback.setState({ status: 'error', error });
  }

  private onStreamInfo(streamInfo: StreamInfo | null): void {
    usePlayback.setState({ streamInfo });
  }

  private onMeta(meta: BackendMeta): void {
    // A source declared live (radio directory, PLS `Length=-1`) stays live even
    // if the browser derives a finite duration from stream headers.
    const declaredLive = usePlayback.getState().currentItem?.playbackType === 'radio';
    usePlayback.setState({ isLive: meta.isLive || declaredLive, canSeek: meta.canSeek && !declaredLive });
    usePlaybackClock.setState({ duration: meta.duration });
  }

  private onClock(currentTime: number, duration: number, bufferedAhead: number): void {
    usePlaybackClock.setState({ currentTime, duration, bufferedAhead });
  }

  private onAnalysis(analysis: AnalysisAvailability, audioEngine: AudioEngineState): void {
    usePlayback.setState({ analysis, audioEngine });
  }
}

let instance: PlaybackEngine | null = null;

/**
 * The app-wide engine. Created on first use because it needs a DOM. Provider
 * backends are loaded lazily, so their code and scripts are only fetched when
 * such an item is actually played.
 */
export function getEngine(): PlaybackEngine {
  instance ??= new PlaybackEngine(new NativeAudioBackend(), undefined, {
    youtube: () => lazyBackend(() => import('./embedded/youtube').then((m) => new m.YouTubeBackend())),
    soundcloud: () => lazyBackend(() => import('./embedded/soundcloud').then((m) => new m.SoundCloudBackend())),
    spotify: () => lazyBackend(() => import('./embedded/spotify').then((m) => new m.SpotifyBackend()), false),
  });
  return instance;
}

/**
 * Wraps a backend whose module is loaded on first use. Commands before the
 * module has loaded are applied once it is ready.
 */
function lazyBackend(loadModule: () => Promise<AudioBackend>, volumeControl = true): AudioBackend {
  let real: AudioBackend | null = null;
  let listener: BackendListener | null = null;
  let loading: Promise<AudioBackend> | null = null;
  const get = () =>
    (loading ??= loadModule().then((b) => {
      real = b;
      if (listener) b.setListener(listener);
      return b;
    }));
  return {
    volumeControl,
    setListener(l) {
      listener = l;
      real?.setListener(l);
    },
    prime() {},
    async load(url, format) {
      const b = await get();
      return b.load(url, format);
    },
    async play() {
      return (await get()).play();
    },
    pause() {
      real?.pause();
    },
    stop() {
      real?.stop();
    },
    seek(s) {
      real?.seek(s);
    },
    setVolume(v, m) {
      real?.setVolume(v, m);
    },
    get currentTime() {
      return real?.currentTime ?? 0;
    },
  };
}

// Dev only: hot-swapping this module would create a second engine with its own
// audio elements while the first keeps playing. Reload the page instead.
if (import.meta.hot) {
  import.meta.hot.accept(() => location.reload());
}
