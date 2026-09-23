import { useSyncExternalStore } from 'react';
import { useSettings } from '../../stores/settingsStore';

const REDUCED_QUERY = '(prefers-reduced-motion: reduce)';
function subscribeReduced(cb: () => void) {
  const mq = window.matchMedia?.(REDUCED_QUERY);
  mq?.addEventListener('change', cb);
  return () => mq?.removeEventListener('change', cb);
}

/** Reduced motion from the app setting, falling back to the OS preference (VIS §53). */
export function useReducedMotion(): boolean {
  const motion = useSettings((s) => s.motion);
  const system = useSyncExternalStore(subscribeReduced, () => window.matchMedia?.(REDUCED_QUERY).matches ?? false);
  return motion === 'reduced' || (motion === 'system' && system);
}
