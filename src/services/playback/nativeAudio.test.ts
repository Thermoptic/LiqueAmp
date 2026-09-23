import { describe, expect, it } from 'vitest';
import { probeCors } from './nativeAudio';

describe('probeCors', () => {
  const failing = (async () => {
    throw new TypeError('Failed to fetch');
  }) as typeof fetch;

  it('reports CORS-readable sources with their HTTP status', async () => {
    const ok = (async () => new Response(null, { status: 200 })) as typeof fetch;
    const missing = (async () => new Response(null, { status: 404 })) as typeof fetch;
    expect(await probeCors('https://stream.example.com/live', ok)).toEqual({ readable: true, status: 200 });
    expect(await probeCors('https://stream.example.com/live', missing)).toEqual({ readable: true, status: 404 });
  });

  it('reports blocked/unreachable cross-origin sources as not readable', async () => {
    expect(await probeCors('https://stream.example.com/live', failing)).toEqual({ readable: false });
  });

  it('same-origin sources stay readable even if the probe fails', async () => {
    expect(await probeCors(`${location.origin}/a.mp3`, failing)).toEqual({ readable: true });
  });

  it('rejects malformed URLs', async () => {
    expect(await probeCors('http://[bad', fetch)).toEqual({ readable: false });
  });
});
