import { loadScript } from '../../../lib/loadScript';
import { playbackError, PlaybackFailure } from '../errors';
import { EmbeddedBackend, providerIframe } from './base';

// Minimal typing of the official Widget API that we use.
interface SCWidget {
  bind(event: string, cb: (e?: { currentPosition?: number }) => void): void;
  play(): void;
  pause(): void;
  seekTo(ms: number): void;
  setVolume(volume: number): void;
  load(url: string, options: Record<string, unknown> & { callback?(): void }): void;
  getDuration(cb: (ms: number) => void): void;
}

interface SCNamespace {
  Widget: ((iframe: HTMLIFrameElement) => SCWidget) & { Events: Record<string, string> };
}

declare global {
  interface Window {
    SC?: SCNamespace;
  }
}

const WIDGET_OPTIONS = { auto_play: false, visual: true, show_comments: false, hide_related: true, show_teaser: false };

/** SoundCloud through the official Widget API (PROVIDERS §24). */
export class SoundCloudBackend extends EmbeddedBackend {
  private widget: SCWidget | null = null;
  private position = 0;
  private duration = Number.NaN;

  constructor() {
    super('soundcloud');
  }

  get currentTime(): number {
    return this.position;
  }

  async load(url: string): Promise<void> {
    this.listener?.onStatus('loading');
    this.show();
    this.position = 0;
    try {
      if (!this.widget) {
        await this.withTimeout(loadScript('https://w.soundcloud.com/player/api.js'), 15000, 'SoundCloud widget did not load');
        const params = new URLSearchParams({ url, ...Object.fromEntries(Object.entries(WIDGET_OPTIONS).map(([k, v]) => [k, String(v)])) });
        const iframe = providerIframe(`https://w.soundcloud.com/player/?${params}`, 'SoundCloud player');
        this.root.appendChild(iframe);
        const SC = window.SC!;
        const widget = SC.Widget(iframe);
        const E = SC.Widget.Events;
        const ready = new Promise<void>((resolve) => widget.bind(E.READY!, () => resolve()));
        widget.bind(E.PLAY!, () => this.onPlay());
        widget.bind(E.PAUSE!, () => this.listener?.onStatus('paused'));
        widget.bind(E.FINISH!, () => this.listener?.onEnded());
        widget.bind(E.PLAY_PROGRESS!, (e) => {
          this.position = (e?.currentPosition ?? 0) / 1000;
          this.listener?.onClock(this.position, this.duration, 0);
        });
        widget.bind(E.ERROR!, () =>
          this.listener?.onError(playbackError('STREAM_UNAVAILABLE', 'SoundCloud could not play this track. It may be private, removed or not embeddable.')),
        );
        this.widget = widget;
        await this.withTimeout(ready, 15000, 'SoundCloud widget did not become ready');
      } else {
        const widget = this.widget;
        await this.withTimeout(
          new Promise<void>((resolve) => widget.load(url, { ...WIDGET_OPTIONS, callback: resolve })),
          15000,
          'SoundCloud did not load the track',
        );
      }
      this.readDuration();
    } catch (err) {
      throw new PlaybackFailure(
        playbackError('STREAM_UNAVAILABLE', navigator.onLine ? `The SoundCloud player could not start (${(err as Error).message}).` : 'You are offline.'),
      );
    }
  }

  async play(): Promise<void> {
    this.widget?.play();
  }

  pause(): void {
    this.widget?.pause();
  }

  seek(seconds: number): void {
    this.widget?.seekTo(seconds * 1000);
  }

  setVolume(volume: number, muted: boolean): void {
    this.widget?.setVolume(muted ? 0 : Math.round(volume * 100));
  }

  protected halt(): void {
    this.widget?.pause();
  }

  private readDuration() {
    this.widget?.getDuration((ms) => {
      this.duration = ms > 0 ? ms / 1000 : Number.NaN;
      this.listener?.onMeta({ duration: this.duration, isLive: false, canSeek: ms > 0 });
    });
  }

  private onPlay() {
    this.readDuration();
    this.listener?.onStatus('playing');
  }
}
