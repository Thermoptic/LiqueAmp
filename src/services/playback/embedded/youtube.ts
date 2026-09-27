import { loadScript } from '../../../lib/loadScript';
import type { PlaybackError } from '../../../stores/playbackStore';
import { detectSource } from '../../providers/detect';
import { playbackError, PlaybackFailure } from '../errors';
import { EmbeddedBackend, providerIframe } from './base';

// Minimal typing of the official IFrame Player API that we use.
interface YTPlayer {
  playVideo(): void;
  pauseVideo(): void;
  stopVideo(): void;
  seekTo(seconds: number, allowSeekAhead: boolean): void;
  setVolume(volume: number): void;
  mute(): void;
  unMute(): void;
  getCurrentTime(): number;
  getDuration(): number;
  cueVideoById(id: string): void;
  getVideoData?(): { title?: string; author?: string; isLive?: boolean };
  getPlaylist?(): string[] | null;
  destroy?(): void;
}

interface YTNamespace {
  Player: new (
    el: HTMLElement,
    opts: {
      width?: number;
      height?: number;
      playerVars?: Record<string, string | number>;
      events: { onReady?(): void; onStateChange?(e: { data: number }): void; onError?(e: { data: number }): void };
    },
  ) => YTPlayer;
}

declare global {
  interface Window {
    YT?: YTNamespace;
    onYouTubeIframeAPIReady?: () => void;
  }
}

async function loadYouTubeApi(): Promise<YTNamespace> {
  if (window.YT?.Player) return window.YT;
  const ready = new Promise<void>((resolve) => {
    const previous = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      previous?.();
      resolve();
    };
  });
  await loadScript('https://www.youtube.com/iframe_api');
  await ready;
  return window.YT!;
}

/**
 * The video ids of a YouTube playlist, in YouTube's order, read through the
 * official IFrame Player API (`listType: 'playlist'` + `getPlaylist()`): no
 * API key, no scraping. The player is cued, never played, shown in `container`
 * (visible, 200×200 as YouTube requires) and removed again. YouTube leaves
 * out videos it cannot list and caps a player's playlist (about 200 videos).
 */
export async function readYouTubePlaylist(listId: string, container: HTMLElement, timeoutMs = 20000): Promise<string[]> {
  const YT = await loadYouTubeApi();
  const mount = document.createElement('div');
  container.appendChild(mount);
  let player: YTPlayer | null = null;
  try {
    return await new Promise<string[]>((resolve, reject) => {
      // An error from the player is about its current video (e.g. one whose
      // owner does not allow embedding), not about the list: the list is still
      // read, and the error only explains a list that never arrives.
      let playerError: string | null = null;
      const timer = window.setTimeout(() => reject(new Error(playerError ?? 'YouTube did not return the playlist in time')), timeoutMs);
      const done = (fn: () => void) => {
        window.clearTimeout(timer);
        fn();
      };
      const valid = (ids: readonly unknown[]) => ids.filter((id): id is string => typeof id === 'string' && /^[\w-]{6,}$/.test(id));
      player = new YT.Player(mount, {
        width: 200,
        height: 200,
        playerVars: { listType: 'playlist', list: listId, origin: location.origin, playsinline: 1, rel: 0 },
        events: {
          onReady: () => {
            // the list arrives with the player, sometimes a moment after onReady
            let tries = 0;
            const poll = () => {
              const ids = player?.getPlaylist?.();
              if (ids?.length) done(() => resolve(valid(ids)));
              else if (tries++ >= 20) done(() => (playerError ? reject(new Error(playerError)) : resolve([])));
              else window.setTimeout(poll, 250);
            };
            poll();
          },
          onError: (e) => {
            playerError = youtubeError(e.data).message;
          },
        },
      });
    });
  } finally {
    (player as YTPlayer | null)?.destroy?.();
    container.replaceChildren();
  }
}

/** Maps IFrame API error codes to explanations (documented codes). */
export function youtubeError(code: number): PlaybackError {
  switch (code) {
    case 2:
      return playbackError('INVALID_SOURCE', 'YouTube rejected the video id.', false);
    case 5:
      return playbackError('MEDIA_FORMAT_NOT_SUPPORTED', 'The YouTube player could not play this video in this browser.');
    case 100:
      return playbackError('STREAM_UNAVAILABLE', 'This YouTube video was removed or is private.', false);
    case 101:
    case 150:
      return playbackError('EMBED_BLOCKED', 'The owner of this video does not allow playback outside YouTube. Open it on YouTube instead.', false);
    case 153:
      return playbackError('EMBED_BLOCKED', 'YouTube refused the player because no referrer was sent.', false);
    default:
      return playbackError('STREAM_UNAVAILABLE', `The YouTube player reported error ${code}.`);
  }
}

export function youtubeVideoId(url: string): string | null {
  const id = detectSource(url).providerItemId;
  return id?.includes(':video:') ? id.split(':video:')[1]! : null;
}

/**
 * YouTube and YouTube Music through the official IFrame Player API
 * (PROVIDERS §19–21). YouTube Music items are YouTube video ids.
 */
export class YouTubeBackend extends EmbeddedBackend {
  private player: YTPlayer | null = null;
  private ready: Promise<void> | null = null;

  constructor() {
    super('youtube');
  }

  get currentTime(): number {
    return this.player?.getCurrentTime() ?? 0;
  }

  async load(url: string): Promise<void> {
    const id = youtubeVideoId(url);
    if (!id) throw new PlaybackFailure(playbackError('INVALID_SOURCE', 'No YouTube video id was found in this link.', false));
    this.listener?.onStatus('loading');
    this.show();
    try {
      if (!this.player) {
        const YT = await this.withTimeout(loadYouTubeApi(), 15000, 'YouTube player did not load');
        const params = new URLSearchParams({ enablejsapi: '1', playsinline: '1', rel: '0', origin: location.origin });
        const iframe = providerIframe(`https://www.youtube.com/embed/${encodeURIComponent(id)}?${params}`, 'YouTube player');
        this.root.appendChild(iframe);
        this.ready = new Promise<void>((resolve) => {
          this.player = new YT.Player(iframe, {
            events: {
              onReady: () => resolve(),
              onStateChange: (e) => this.onState(e.data),
              onError: (e) => {
                this.stopClock();
                this.listener?.onError(youtubeError(e.data));
              },
            },
          });
        });
        await this.withTimeout(this.ready, 15000, 'YouTube player did not become ready');
      } else {
        await this.ready;
        this.player.cueVideoById(id);
      }
    } catch (err) {
      throw new PlaybackFailure(
        playbackError('STREAM_UNAVAILABLE', navigator.onLine ? `The YouTube player could not start (${(err as Error).message}).` : 'You are offline.'),
      );
    }
  }

  async play(): Promise<void> {
    this.player?.playVideo();
  }

  pause(): void {
    this.player?.pauseVideo();
  }

  seek(seconds: number): void {
    this.player?.seekTo(seconds, true);
  }

  setVolume(volume: number, muted: boolean): void {
    if (!this.player) return;
    this.player.setVolume(Math.round(volume * 100));
    if (muted) this.player.mute();
    else this.player.unMute();
  }

  protected halt(): void {
    this.player?.stopVideo();
  }

  private onState(state: number) {
    const p = this.player;
    if (!p) return;
    if (state === 1) {
      const duration = p.getDuration();
      const isLive = p.getVideoData?.().isLive === true;
      this.listener?.onMeta({ duration: isLive ? Infinity : duration, isLive, canSeek: !isLive && duration > 0 });
      this.listener?.onStatus('playing');
      this.startClock(() => ({ currentTime: p.getCurrentTime(), duration: isLive ? Infinity : p.getDuration() }));
    } else if (state === 2) {
      this.stopClock();
      this.listener?.onStatus('paused');
    } else if (state === 3) {
      this.listener?.onStatus('buffering');
    } else if (state === 0) {
      this.stopClock();
      this.listener?.onEnded();
    }
  }
}
