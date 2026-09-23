import type Hls from 'hls.js';
import { codecFromContentType, codecFromHls, parseBitrate } from '../../lib/codec';
import type { AnalysisAvailability, StreamInfo } from '../../stores/playbackStore';
import { DEFAULT_FFT_SIZE, DEFAULT_SMOOTHING } from '../analysis/analysis';
import type { StreamFormat } from '../providers/direct';
import type { AudioBackend, BackendListener } from './backend';
import { fromMediaError, fromPlayRejection, playbackError, PlaybackFailure } from './errors';

const PROBE_TIMEOUT_MS = 5000;

export interface CorsProbe {
  /** The browser may read the audio samples. */
  readable: boolean;
  /** HTTP status, only known when the response was readable. */
  status?: number;
  /** Metadata from response headers; icy-* only if the server exposes them. */
  info?: StreamInfo;
}

export function streamInfoFromHeaders(headers: Headers): StreamInfo | undefined {
  const contentType = headers.get('content-type') ?? undefined;
  const info: StreamInfo = {
    source: 'http-headers',
    contentType,
    codec: codecFromContentType(contentType),
    bitrateKbps: parseBitrate(headers.get('icy-br')),
    stationName: headers.get('icy-name')?.trim() || undefined,
    genre: headers.get('icy-genre')?.trim() || undefined,
  };
  return info.codec || info.bitrateKbps || info.stationName ? info : undefined;
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
    const res = await fetchImpl(target.href, { mode: 'cors', cache: 'no-store', credentials: 'omit', referrerPolicy: 'no-referrer', signal: controller.signal });
    return { readable: true, status: res.status, info: res.ok ? streamInfoFromHeaders(res.headers) : undefined };
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
  // Graph: source → bass → mid → treble → destination, with an analyser tap
  // after the EQ so visualizers see what is actually heard.
  private eqNodes: { bass: BiquadFilterNode; mid: BiquadFilterNode; treble: BiquadFilterNode } | null = null;
  private analyser: AnalyserNode | null = null;
  private eqGains = { bass: 0, mid: 0, treble: 0 };
  private url = '';
  private analysis: AnalysisAvailability = 'inactive';
  private fellBack = false;
  private wantsPlay = false;
  private loadToken = 0;
  private hls: Hls | null = null;
  /** hls.js reports liveness per playlist; the element's duration may be finite for live HLS. */
  private hlsLive = false;

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

  /** The analyser for the current source, only while real samples flow through Web Audio. */
  getAnalyser(): AnalyserNode | null {
    return this.active === this.analysed && this.analyser && this.ctx?.state === 'running' ? this.analyser : null;
  }

  /** Sets EQ gains in dB. They only affect sources routed through Web Audio. */
  setEq(gains: { bass: number; mid: number; treble: number }): void {
    this.eqGains = gains;
    if (!this.eqNodes || !this.ctx) return;
    const t = this.ctx.currentTime;
    // Short ramps avoid clicks when a slider moves.
    this.eqNodes.bass.gain.setTargetAtTime(gains.bass, t, 0.03);
    this.eqNodes.mid.gain.setTargetAtTime(gains.mid, t, 0.03);
    this.eqNodes.treble.gain.setTargetAtTime(gains.treble, t, 0.03);
  }

  /** Advanced analyser configuration (VIS §9–11); applied immediately if the graph exists. */
  configureAnalyser(fftSize: number, smoothing: number): void {
    this.analyserConfig = { fftSize, smoothing };
    if (this.analyser) {
      this.analyser.fftSize = fftSize;
      this.analyser.smoothingTimeConstant = smoothing;
    }
  }

  private analyserConfig = { fftSize: DEFAULT_FFT_SIZE, smoothing: DEFAULT_SMOOTHING };

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

  async load(url: string, format: StreamFormat = 'audio'): Promise<void> {
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
    this.listener?.onStreamInfo(null);

    if (format === 'hls' && !this.plain.canPlayType('application/vnd.apple.mpegurl')) {
      await this.loadWithHlsJs(token);
      return;
    }

    const probe = await probeCors(this.url);
    if (token !== this.loadToken) return; // superseded by a newer load
    // Only "not found" is conclusive. Other refusals (401/403/5xx) may apply to
    // the CORS probe alone — some servers reject cross-origin fetches but
    // still serve the same stream to a plain <audio> element.
    if (probe.status === 404 || probe.status === 410) {
      throw new PlaybackFailure(playbackError('STREAM_UNAVAILABLE', `The server answered ${probe.status}: nothing exists at this address.`));
    }
    const readable = probe.readable && (probe.status === undefined || probe.status < 400);
    if (readable && probe.info) this.listener?.onStreamInfo(probe.info);
    this.activate(readable && this.webAudioAvailable() ? this.analysed : this.plain);
  }

  async play(): Promise<void> {
    const el = this.active;
    if (!el) return;
    this.wantsPlay = true;
    if (el === this.analysed && !(await this.ensureGraphRunning())) {
      if (!this.hls) {
        // A suspended AudioContext would play silence; use the plain element.
        this.fallBackToPlain('unsupported');
        return;
      }
      // hls.js can only feed the analysed element; the plain one cannot play HLS.
      if (this.source) {
        this.wantsPlay = false;
        this.listener?.onError(playbackError('PLAYBACK_BLOCKED', 'The browser has not allowed audio to start yet. Press play again.'));
        return;
      }
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
    this.hls?.destroy();
    this.hls = null;
    this.hlsLive = false;
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

  /**
   * HLS without native support: hls.js feeds the analysed element through
   * Media Source Extensions. The media URL is then a same-origin blob, so real
   * analysis works — but hls.js fetches the manifest and segments itself,
   * which requires CORS. Without it, playback is not possible in this browser.
   */
  private async loadWithHlsJs(token: number): Promise<void> {
    const { default: HlsCtor } = await import('hls.js');
    if (token !== this.loadToken) return;
    if (!HlsCtor.isSupported()) {
      throw new PlaybackFailure(
        playbackError('MEDIA_FORMAT_NOT_SUPPORTED', 'This browser cannot play HLS streams (no native HLS and no Media Source Extensions).', false),
      );
    }
    const hls = new HlsCtor({ enableWorker: true, lowLatencyMode: false });
    this.hls = hls;
    this.active = this.analysed;
    let mediaRecoveries = 0;

    hls.on(HlsCtor.Events.MANIFEST_PARSED, (_e, data) => {
      if (this.hls !== hls) return;
      const level = data.levels[0];
      const codec = codecFromHls(level?.audioCodec ?? level?.codecSet);
      const bitrateKbps = level?.bitrate ? Math.round(level.bitrate / 1000) : undefined;
      // Media playlists often declare neither; then there is nothing to show.
      if (codec || bitrateKbps) this.listener?.onStreamInfo({ source: 'hls-manifest', codec, bitrateKbps });
    });
    hls.on(HlsCtor.Events.LEVEL_LOADED, (_e, data) => {
      if (this.hls !== hls) return;
      this.hlsLive = data.details.live;
      this.emitMeta(this.analysed);
    });
    hls.on(HlsCtor.Events.ERROR, (_e, data) => {
      if (this.hls !== hls || !data.fatal) return;
      if (data.type === HlsCtor.ErrorTypes.MEDIA_ERROR && mediaRecoveries++ < 1) {
        hls.recoverMediaError();
        return;
      }
      const status = data.response?.code;
      const error =
        data.type !== HlsCtor.ErrorTypes.NETWORK_ERROR
          ? playbackError('MEDIA_FORMAT_NOT_SUPPORTED', 'The browser could not decode this HLS stream.', false)
          : status === 404
            ? playbackError('STREAM_UNAVAILABLE', 'The server answered 404: the HLS stream does not exist.')
            : status && status >= 400
              ? playbackError('STREAM_UNAVAILABLE', `The HLS server refused the request (HTTP ${status}).`)
              : !navigator.onLine
                ? playbackError('NETWORK_ERROR', 'You are offline. External streams need a network connection.')
                : playbackError(
                    'STREAM_UNAVAILABLE',
                    'The HLS stream could not be loaded. In this browser HLS needs the server to allow browser access (CORS), or the server is unreachable.',
                  );
      // Tear down so the element does not sit in a pending play() forever;
      // Retry reloads from scratch.
      this.release();
      this.setAnalysis('inactive');
      this.listener?.onError(error);
    });

    hls.attachMedia(this.analysed);
    hls.loadSource(this.url);
    this.setAnalysis(this.webAudioAvailable() ? 'available' : 'unsupported');
  }

  private handleElementError(el: HTMLAudioElement): void {
    // hls.js reports its own, more specific errors.
    if (this.hls && el === this.analysed) return;
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
    const isLive = duration === Infinity || this.hlsLive;
    const canSeek = !isLive && Number.isFinite(duration) && duration > 0 && el.seekable.length > 0;
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
        const ctx = this.ctx;
        this.source = ctx.createMediaElementSource(this.analysed);
        const bass = new BiquadFilterNode(ctx, { type: 'lowshelf', frequency: 200 });
        const mid = new BiquadFilterNode(ctx, { type: 'peaking', frequency: 1000, Q: 0.8 });
        const treble = new BiquadFilterNode(ctx, { type: 'highshelf', frequency: 4000 });
        const analyser = new AnalyserNode(ctx, {
          fftSize: this.analyserConfig.fftSize,
          smoothingTimeConstant: this.analyserConfig.smoothing,
        });
        this.source.connect(bass).connect(mid).connect(treble).connect(ctx.destination);
        treble.connect(analyser);
        this.eqNodes = { bass, mid, treble };
        this.analyser = analyser;
        this.setEq(this.eqGains);
      }
      if (this.ctx.state !== 'running') await this.ctx.resume();
      return this.ctx.state === 'running';
    } catch {
      return false;
    }
  }
}
