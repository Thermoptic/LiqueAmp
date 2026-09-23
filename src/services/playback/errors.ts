import type { PlaybackError, PlaybackErrorCode } from '../../stores/playbackStore';
import type { MediaItem } from '../../types/media';

const TITLES: Record<PlaybackErrorCode, string> = {
  STREAM_UNAVAILABLE: 'STREAM UNAVAILABLE',
  NETWORK_ERROR: 'NETWORK ERROR',
  MEDIA_FORMAT_NOT_SUPPORTED: 'MEDIA FORMAT NOT SUPPORTED',
  PLAYBACK_BLOCKED: 'PLAYBACK BLOCKED',
  MIXED_CONTENT: 'INSECURE STREAM BLOCKED',
  PROVIDER_NOT_SUPPORTED: 'PROVIDER NOT SUPPORTED',
  INVALID_SOURCE: 'INVALID SOURCE',
  PLAYLIST_UNREADABLE: 'PLAYLIST UNREADABLE',
  EMBED_BLOCKED: 'EMBEDDING NOT ALLOWED',
};

export function playbackError(code: PlaybackErrorCode, message: string, recoverable = true): PlaybackError {
  return { code, title: TITLES[code], message, recoverable };
}

/** Thrown by backends so the engine can report a specific reason. */
export class PlaybackFailure extends Error {
  constructor(public readonly error: PlaybackError) {
    super(error.message);
  }
}

/** Maps HTMLMediaElement.error codes to user-facing errors (SPEC §45). */
export function fromMediaError(code: number | undefined, online: boolean): PlaybackError | null {
  if (!online) return playbackError('NETWORK_ERROR', 'You are offline. External streams need a network connection.');
  switch (code) {
    case 1: // MEDIA_ERR_ABORTED — a new load replaced this one
      return null;
    case 2:
      return playbackError('NETWORK_ERROR', 'The connection to the source was lost while loading.');
    case 3:
      return playbackError('MEDIA_FORMAT_NOT_SUPPORTED', 'The browser could not decode this audio.', false);
    case 4:
    default:
      return playbackError(
        'STREAM_UNAVAILABLE',
        'The browser could not load this source. It may be offline, in a format this browser cannot play, or not allow browser access.',
      );
  }
}

/** Maps a rejected HTMLMediaElement.play() promise. null = ignore. */
export function fromPlayRejection(err: unknown): PlaybackError | null {
  const name = err instanceof DOMException || err instanceof Error ? err.name : '';
  if (name === 'AbortError') return null;
  if (name === 'NotAllowedError') {
    return playbackError('PLAYBACK_BLOCKED', 'The browser blocked playback until you interact with the page. Press play to start.');
  }
  // NotSupportedError and others are reported through the element's error event.
  return null;
}

export function providerNotSupported(item: MediaItem): PlaybackError {
  return {
    ...playbackError(
      'PROVIDER_NOT_SUPPORTED',
      `Playback for ${item.provider} sources is not available in this build. Use Open Source to play it on the provider's site.`,
      false,
    ),
    provider: item.provider,
  };
}
