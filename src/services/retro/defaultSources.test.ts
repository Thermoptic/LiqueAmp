import { describe, expect, it } from 'vitest';
import { registerDefaultRetroSources } from './defaultSources';
import { retroSourceFor } from './sources';

describe('default retro sources', () => {
  it('connect NES (Modland NSF); C64 and Mega Drive follow later', () => {
    registerDefaultRetroSources();
    registerDefaultRetroSources(); // idempotent
    expect(retroSourceFor('nes')?.id).toBe('modland-nsf');
    expect(retroSourceFor('c64')).toBeUndefined();
    expect(retroSourceFor('megadrive')).toBeUndefined();
  });
});
