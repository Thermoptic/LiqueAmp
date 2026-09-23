import type { AnalysisAvailability } from '../../stores/playbackStore';
import type { AudioBackend, BackendListener } from './backend';
import { fromMediaError, fromPlayRejection, playbackError, PlaybackFailure } from './errors';

const PROBE_TIMEOUT_MS = 5000;

export interface CorsProbe {
  /** The browser may read the audio samples. */
  readable: boolean;
  /** HTTP status, only known when the response was readable. */
  status?: number;
}

/**
 * Checks whether the browser may read the source's audio samples (CORS).
 * Resolves as soon as response headers arrive; the body is abandoned, so an
 * infinite radio stream is not downloaded. `readable: false` means "no CORS
 * or unreachable" — the plain element then decides which.
 */
export async function probeCors(url: string, fetchImpl: typeof fetch = fetch): Promise<CorsProbe> {
  let target: URL;
  try {
    target = new URL(url, location.href);
  } catch {
    return { readable: false };
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
  try {
    const res = await fetchImpl(target.href, { mode: 'cors', cache: 'no-store', credentials: 'omit', signal: controller.signal });
    return { readable: true, status: res.status };
  } catch {
    // Same-origin requests never fail CORS; an error there means unreachable.
    return { readable: target.origin === location.origin };
  } finally {
    clearTimeout(timer);
    controller.abort();
  }
}

function bufferedAhead(el: HTMLMediaElement): number {
  const t = el.currentTime;
  for (let i = 0; i < el.buffered.length; i++) {
    if (el.buffered.start(i) <= t + 0.1 && el.buffered.end(i) >= t) return Math.max(0, el.buffered.end(i) - t);
  }
  return 0;
}

/**
 * Native <audio> playback with two elements (see LIQUEAMP_IMPLEMENTATION_PLAN §4):
 *
 * - `analysed` has crossOrigin=anonymous and is routed through a Web Audio
 *   graph, so analysers/EQ can read real samples. It can only play sources
 *   that send CORS headers.
 * - `plain` is never routed through Web Audio, so it can play any source the
 *   browser can reach. Analysis is then honestly reported as unavailable.
 *
 * Only one element is active at a time; this is still one playback session.
 */
export class NativeAudioBackend implements AudioBackend {
  private readonly analysed: HTMLAudioElement;
  private readonly plain: HTMLAudioElement;
  private active: HTMLAudioElement | null = null;
  private listener: BackendListener | null = null;
  private ctx: AudioContext | null = null;
  private source: MediaElementAudioSourceNode | null = null;
  private url = '';
  private analysis: AnalysisAvailability = 'inactive';
  private fellBack = false;
  private wantsPlay = false;
  private loadToken = 0;

  constructor() {
    this.analysed = this.createElement(true);
    this.plain = this.createElement(false);
  }

  setListener(listener: BackendListener): void {
    this.listener = listener;
  }

  get currentTime(): number {
    return this.active?.currentTime ?? 0;
  }

  /** The Web Audio graph input for the current source, when analysis is possible. */
  getAnalysisSource(): { context: AudioContext; node: AudioNode } | null {
    return this.active === this.analysed && this.ctx && this.source ? { context: this.ctx, node: this.source } : null;
  }

  /**
   * Must be called synchronously inside a user gesture (click/keypress).
   * Creates/resumes the AudioContext while the gesture is still valid —
   * Safari refuses to start audio after an intervening await.
   */
  prime(): void {
    if (!this.webAudioAvailable()) return;
    try {
      if (!this.ctx) {
        this.ctx = new AudioContext();
        this.ctx.addEventListener('statechange', () => this.emitAnalysis());
      }
      if (this.ctx.state !== 'running') void this.ctx.resume().catch(() => undefined);
    } catch {
      this.ctx = null;
    }
  }

  async load(url: string): Promise<void> {
    const token = ++this.loadToken;
    this.release();
    let target: URL;
    try {
      target = new URL(url, location.href);
    } catch {
      throw new PlaybackFailure(playbackError('INVALID_SOURCE', 'This is not a valid URL.', false));
    }
    if (target.protocol !== 'http:' && target.protocol !== 'https:' && target.protocol !== 'blob:') {
      throw new PlaybackFailure(playbackError('INVALID_SOURCE', `Unsupported address type "${target.protocol}".`, false));
    }
    if (target.protocol === 'http:' && location.protocol === 'https:') {
      throw new PlaybackFailure(
        playbackError('MIXED_CONTENT', 'This stream uses insecure http://. Browsers block it on a secure (https) page. Use an https:// stream URL.', false),
      );
    }
    this.url = target.href;
    this.fellBack = false;
    this.listener?.onStatus('loading');

    const probe = await probeCors(this.url);
    if (token !== this.loadToken) return; // superseded by a newer load
    if (probe.status !== undefined && probe.status >= 400) {
      throw new PlaybackFailure(
        playbackError(
          'STREAM_UNAVAILABLE',
          probe.status === 404 ? 'The server answered 404: nothing exists at this address.' : `The server refused the request (HTTP ${probe.status}).`,
        ),
      );
    }
    this.activate(probe.readable && this.webAudioAvailable() ? this.analysed : this.plain);
  }

  async play(): Promise<void> {
    const el = this.active;
    if (!el) return;
    this.wantsPlay = true;
    if (el === this.analysed && !(await this.ensureGraphRunning())) {
      // A suspended AudioContext would play silence; use the plain element.
      this.fallBackToPlain('unsupported');
      return;
    }
    await this.playElement(el);
  }

  pause(): void {
    this.wantsPlay = false;
    this.active?.pause();
  }

  stop(): void {
    this.loadToken++;
    this.release();
    this.setAnalysis('inactive');
  }

  seek(seconds: number): void {
    const el = this.active;
    if (!el || !Number.isFinite(el.duration)) return;
    el.currentTime = Math.max(0, Math.min(el.duration, seconds));
  }

  setVolume(volume: number, muted: boolean): void {
    for (const el of [this.analysed, this.plain]) {
      el.volume = Math.max(0, Math.min(1, volume));
      el.muted = muted;
    }
  }

  // ---------------------------------------------------------------------------

  private createElement(analysed: boolean): HTMLAudioElement {
    const el = new Audio();
    el.preload = 'auto';
    if (analysed) el.crossOrigin = 'anonymous';
    const on = (type: string, fn: () => void) => el.addEventListener(type, () => el === this.active && fn());
    on('playing', () => this.listener?.onStatus('playing'));
    on('pause', () => !el.ended && this.listener?.onStatus('paused'));
    on('waiting', () => this.listener?.onStatus('buffering'));
    on('ended', () => this.listener?.onEnded());
    on('loadedmetadata', () => this.emitMeta(el));
    on('durationchange', () => this.emitMeta(el));
    on('timeupdate', () => this.emitClock(el));
    on('progress', () => this.emitClock(el));
    on('error', () => this.handleElementError(el));
    return el;
  }

  private activate(el: HTMLAudioElement): void {
    this.active = el;
    el.src = this.url;
    el.load();
    this.setAnalysis(el === this.analysed ? 'available' : this.webAudioAvailable() ? 'cors-blocked' : 'unsupported');
  }

  private setAnalysis(analysis: AnalysisAvailability): void {
    this.analysis = analysis;
    this.emitAnalysis();
  }

  private emitAnalysis(): void {
    this.listener?.onAnalysis(this.analysis, this.engineState());
  }

  /** Detaches the source from both elements without firing UI events. */
  private release(): void {
    this.wantsPlay = false;
    this.active = null;
    for (const el of [this.analysed, this.plain]) {
      el.pause();
      if (el.hasAttribute('src')) {
        el.removeAttribute('src');
        el.load();
      }
    }
  }

  private fallBackToPlain(reason: 'cors-blocked' | 'unsupported'): void {
    const resume = this.wantsPlay;
    this.fellBack = true;
    this.analysed.pause();
    this.analysed.removeAttribute('src');
    this.analysed.load();
    this.active = this.plain;
    this.plain.src = this.url;
    this.plain.load();
    this.setAnalysis(reason);
    if (resume) {
      this.wantsPlay = true;
      void this.playElement(this.plain);
    }
  }

  private handleElementError(el: HTMLAudioElement): void {
    // The CORS probe can pass while the media request still fails CORS (or the
    // server only allows some requests); retry once without Web Audio.
    if (el === this.analysed && !this.fellBack) {
      this.fallBackToPlain('cors-blocked');
      return;
    }
    const error = fromMediaError(el.error?.code, navigator.onLine);
    if (error) this.listener?.onError(error);
  }

  private async playElement(el: HTMLAudioElement): Promise<void> {
    try {
      await el.play();
    } catch (err) {
      if (el !== this.active) return;
      const error = fromPlayRejection(err);
      if (error) {
        this.wantsPlay = false;
        this.listener?.onError(error);
      }
    }
  }

  private emitMeta(el: HTMLAudioElement): void {
    const duration = el.duration;
    const isLive = duration === Infinity;
    const canSeek = Number.isFinite(duration) && duration > 0 && el.seekable.length > 0;
    this.listener?.onMeta({ duration, isLive, canSeek });
  }

  private emitClock(el: HTMLAudioElement): void {
    this.listener?.onClock(el.currentTime, el.duration, bufferedAhead(el));
  }

  private webAudioAvailable(): boolean {
    return typeof window !== 'undefined' && typeof window.AudioContext === 'function';
  }

  private engineState() {
    if (!this.webAudioAvailable()) return 'unavailable' as const;
    if (!this.ctx) return 'not-started' as const;
    return this.ctx.state === 'running' ? ('running' as const) : ('suspended' as const);
  }

  /**
   * Creates the AudioContext lazily (browsers require a user gesture) and
   * routes the analysed element through it. Returns false if it cannot run.
   */
  private async ensureGraphRunning(): Promise<boolean> {
    try {
      this.prime();
      if (!this.ctx) return false;
      if (!this.source) {
        this.source = this.ctx.createMediaElementSource(this.analysed);
        this.source.connect(this.ctx.destination);
      }
      if (this.ctx.state !== 'running') await this.ctx.resume();
      return this.ctx.state === 'running';
    } catch {
      return false;
    }
  }
}
