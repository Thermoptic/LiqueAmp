import { create } from 'zustand';
import { usePlayback } from '../../stores/playbackStore';
import type { ProviderId } from '../../types/media';

/** What happened with a provider in this session — measured, never assumed (PROVIDERS §27). */
export interface ProviderRuntime {
  /** Last time an item from this provider actually started playing. */
  lastPlayingAt?: string;
  lastError?: { title: string; message: string; at: string };
}

export const useProviderStatus = create<Partial<Record<ProviderId, ProviderRuntime>>>(() => ({}));

let started = false;

/** Records per-provider playback outcomes from the central engine's state. */
export function startProviderStatusTracking(): () => void {
  if (started) return () => undefined;
  started = true;
  const unsubscribe = usePlayback.subscribe((s, prev) => {
    const provider = s.currentItem?.provider;
    if (!provider) return;
    const at = new Date().toISOString();
    if (s.status === 'playing' && prev.status !== 'playing') {
      useProviderStatus.setState((st) => ({ [provider]: { ...st[provider], lastPlayingAt: at } }));
    }
    if (s.error && s.error !== prev.error) {
      const { title, message } = s.error;
      useProviderStatus.setState((st) => ({ [provider]: { ...st[provider], lastError: { title, message, at } } }));
    }
  });
  return () => {
    unsubscribe();
    started = false;
  };
}
