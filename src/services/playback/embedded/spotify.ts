import { loadScript } from '../../../lib/loadScript';
import { detectSource } from '../../providers/detect';
import { playbackError, PlaybackFailure } from '../errors';
import { EmbeddedBackend } from './base';

// Minimal typing of the official Spotify iFrame API that we use.
interface SpotifyPlaybackUpdate {
  data: { isPaused: boolean; isBuffering: boolean; duration: number; position: number };
}

interface SpotifyController {
  loadUri(uri: string): void;
  play(): void;
  pause(): void;
  resume(): void;
  seek(seconds: number): void;
  addListener(event: 'ready', cb: () => void): void;
  addListener(event: 'playback_update', cb: (e: SpotifyPlaybackUpdate) => void): void;
}

interface SpotifyIFrameAPI {
  createController(el: HTMLElement, options: { uri: string; width?: string | number; height?: string | number }, cb: (c: SpotifyController) => void): void;
}

declare global {
  interface Window {
    onSpotifyIframeApiReady?: (api: SpotifyIFrameAPI) => void;
  }
}

let apiPromise: Promise<SpotifyIFrameAPI> | null = null;

function loadSpotifyApi(): Promise<SpotifyIFrameAPI> {
  apiPromise ??= new Promise<SpotifyIFrameAPI>((resolve, reject) => {
    window.onSpotifyIframeApiReady = (api) => resolve(api);
    loadScript('https://open.spotify.com/embed/iframe-api/v1').catch((err) => {
      apiPromise = null;
      reject(err);
    });
  });
  return apiPromise;
}

export function spotifyUri(url: string): string | null {
  return detectSource(url).providerItemId ?? null;
}

/**
 * Spotify through its official embed / iFrame API (PROVIDERS §22). Spotify
 * decides what the embed plays: full tracks for listeners logged in to
 * Spotify in this browser, otherwise previews. The embed exposes no volume
 * control, so LIQUEAMP's volume does not apply (PROVIDERS §50).
 */
export class SpotifyBackend extends EmbeddedBackend {
  override readonly volumeControl = false;
  private controller: SpotifyController | null = null;
  private position = 0;
  private duration = Number.NaN;
  private started = false;

  constructor() {
    super('spotify');
  }

  get currentTime(): number {
    return this.position;
  }

  async load(url: string): Promise<void> {
    const uri = spotifyUri(url);
    if (!uri) throw new PlaybackFailure(playbackError('INVALID_SOURCE', 'This is not a recognised Spotify link.', false));
    this.listener?.onStatus('loading');
    this.show();
    this.position = 0;
    this.started = false;
    try {
      if (!this.controller) {
        const api = await this.withTimeout(loadSpotifyApi(), 15000, 'Spotify embed did not load');
        const mount = document.createElement('div');
        this.root.appendChild(mount);
        const controller = await this.withTimeout(
          new Promise<SpotifyController>((resolve) => api.createController(mount, { uri, width: '100%', height: '100%' }, resolve)),
          15000,
          'Spotify embed did not start',
        );
        controller.addListener('playback_update', (e) => this.onUpdate(e));
        this.controller = controller;
      } else {
        this.controller.loadUri(uri);
      }
    } catch (err) {
      throw new PlaybackFailure(
        playbackError('STREAM_UNAVAILABLE', navigator.onLine ? `The Spotify player could not start (${(err as Error).message}).` : 'You are offline.'),
      );
    }
  }

  async play(): Promise<void> {
    this.controller?.play();
  }

  pause(): void {
    this.controller?.pause();
  }

  seek(seconds: number): void {
    this.controller?.seek(seconds);
  }

  /** The Spotify embed does not expose volume. */
  setVolume(): void {}

  protected halt(): void {
    this.controller?.pause();
  }

  private onUpdate({ data }: SpotifyPlaybackUpdate) {
    this.position = data.position / 1000;
    const duration = data.duration > 0 ? data.duration / 1000 : Number.NaN;
    if (duration !== this.duration) {
      this.duration = duration;
      this.listener?.onMeta({ duration, isLive: false, canSeek: data.duration > 0 });
    }
    this.listener?.onClock(this.position, this.duration, 0);
    if (data.isBuffering) return this.listener?.onStatus('buffering');
    if (!data.isPaused) {
      this.started = true;
      return this.listener?.onStatus('playing');
    }
    // The iFrame API has no "ended" event: a stop at the very end after playing counts as ended.
    if (this.started && data.duration > 0 && data.position >= data.duration - 1000) {
      this.started = false;
      this.listener?.onEnded();
    } else {
      this.listener?.onStatus('paused');
    }
  }
}
