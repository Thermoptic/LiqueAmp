// Normalized provider errors (PROVIDERS §26).

export type ProviderErrorCode =
  | 'INVALID_URL'
  | 'NOT_FOUND'
  | 'AUTH_REQUIRED'
  | 'AUTH_EXPIRED'
  | 'PLAYBACK_UNAVAILABLE'
  | 'EMBED_REQUIRED'
  | 'CORS_ERROR'
  | 'NETWORK_ERROR'
  | 'RATE_LIMITED'
  | 'UNSUPPORTED'
  | 'UNKNOWN';

export const PROVIDER_ERROR_TITLE: Record<ProviderErrorCode, string> = {
  INVALID_URL: 'INVALID URL',
  NOT_FOUND: 'NOT FOUND',
  AUTH_REQUIRED: 'AUTHENTICATION REQUIRED',
  AUTH_EXPIRED: 'AUTHENTICATION EXPIRED',
  PLAYBACK_UNAVAILABLE: 'PLAYBACK UNAVAILABLE',
  EMBED_REQUIRED: 'EMBED REQUIRED',
  CORS_ERROR: 'CORS BLOCKED',
  NETWORK_ERROR: 'NETWORK ERROR',
  RATE_LIMITED: 'RATE LIMITED',
  UNSUPPORTED: 'UNSUPPORTED SOURCE',
  UNKNOWN: 'UNKNOWN ERROR',
};

export class ProviderError extends Error {
  constructor(
    public readonly code: ProviderErrorCode,
    message: string,
  ) {
    super(message);
  }

  get title(): string {
    return PROVIDER_ERROR_TITLE[this.code];
  }
}
