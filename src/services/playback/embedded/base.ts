import type { AudioBackend, BackendListener } from '../backend';
import { getEmbedContainer, setEmbedActive } from '../embedHost';

/**
 * Common parts of backends that drive an official provider player in an
 * iframe. The provider's player plays the audio; LIQUEAMP only sends
 * commands and receives state, so there is never raw audio to analyse.
 */
export abstract class EmbeddedBackend implements AudioBackend {
  protected listener: BackendListener | null = null;
  protected readonly root: HTMLDivElement;
  private clockTimer = 0;
  /** Provider players that do not expose volume set this to false. */
  readonly volumeControl: boolean = true;

  constructor(provider: string) {
    this.root = document.createElement('div');
    this.root.className = `embed-host__player embed-host__player--${provider}`;
    this.root.hidden = true;
    getEmbedContainer().appendChild(this.root);
  }

  setListener(listener: BackendListener): void {
    this.listener = listener;
  }

  /** Embedded players need no Web Audio priming. */
  prime(): void {}

  abstract load(url: string): Promise<void>;
  abstract play(): Promise<void>;
  abstract pause(): void;
  abstract seek(seconds: number): void;
  abstract setVolume(volume: number, muted: boolean): void;
  abstract get currentTime(): number;
  protected abstract halt(): void;

  stop(): void {
    this.stopClock();
    try {
      this.halt();
    } catch {
      // the provider player may already be gone
    }
    this.root.hidden = true;
    setEmbedActive(false);
  }

  protected show(): void {
    for (const sibling of Array.from(getEmbedContainer().children)) (sibling as HTMLElement).hidden = sibling !== this.root;
    setEmbedActive(true);
  }

  /** Providers without time events are polled while playing. */
  protected startClock(read: () => { currentTime: number; duration: number }): void {
    this.stopClock();
    this.clockTimer = window.setInterval(() => {
      const { currentTime, duration } = read();
      this.listener?.onClock(currentTime, duration, 0);
    }, 500);
  }

  protected stopClock(): void {
    window.clearInterval(this.clockTimer);
    this.clockTimer = 0;
  }

  /** Runs `fn`, rejecting if the provider never answers. */
  protected withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const t = window.setTimeout(() => reject(new Error(message)), ms);
      promise.then(
        (v) => {
          window.clearTimeout(t);
          resolve(v);
        },
        (e) => {
          window.clearTimeout(t);
          reject(e);
        },
      );
    });
  }
}

/** Creates a provider iframe that sends a referrer (providers require one; the page itself sends none). */
export function providerIframe(src: string, title: string): HTMLIFrameElement {
  const iframe = document.createElement('iframe');
  iframe.src = src;
  iframe.title = title;
  iframe.allow = 'autoplay; encrypted-media; picture-in-picture; clipboard-write';
  iframe.referrerPolicy = 'strict-origin-when-cross-origin';
  iframe.setAttribute('frameborder', '0');
  return iframe;
}
