// The retro sources LIQUEAMP ships with. Registering one connects its system
// tab in the Retro panel; systems without a source say so.

import { createNesSource } from './nesSource';
import { registerRetroSource } from './sources';

let registered = false;

export function registerDefaultRetroSources(): void {
  if (registered) return;
  registered = true;
  registerRetroSource('nes', createNesSource());
}
