import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { INITIAL_PLAYBACK, usePlayback, usePlaybackClock } from '../../stores/playbackStore';
import type { MediaItem } from '../../types/media';
import { MEDIA_SESSION_SEEK_OFFSET, startMediaSession } from './mediaSession';

class FakeMetadata {
  title: string;
  artist: string;
  album: string;
  artwork: MediaImage[];
  constructor(init: MediaMetadataInit) {
    this.title = init.title ?? '';
    this.artist = init.artist ?? '';
    this.album = init.album ?? '';
    this.artwork = [...(init.artwork ?? [])];
  }
}

function fakeSession() {
  const handlers = new Map<string, MediaSessionActionHandler>();
  const session = {
    metadata: null as MediaMetadata | null,
    playbackState: 'none' as MediaSessionPlaybackState,
    positions: [] as Array<MediaPositionState | undefined>,
    setActionHandler(action: MediaSessionAction, handler: MediaSessionActionHandler | null) {
      if (action === 'skipad') throw new Error('unsupported');
      if (handler) handlers.set(action, handler);
      else handlers.delete(action);
    },
    setPositionState(state?: MediaPositionState) {
      session.positions.push(state);
    },
  };
  return { session, handlers };
}

function engine() {
  return { play: vi.fn(async () => {}), pause: vi.fn(), next: vi.fn(async () => {}), previous: vi.fn(async () => {}), seek: vi.fn(), seekBy: vi.fn(), stop: vi.fn() };
}

const item: MediaItem = { id: 'a', provider: 'direct', title: 'Song', artist: 'Band', album: 'LP', artwork: 'https://x/a.jpg', sourceUrl: 'https://x/a.mp3', playbackType: 'direct', createdAt: '', updatedAt: '' };

let fake: ReturnType<typeof fakeSession>;
let eng: ReturnType<typeof engine>;
let stop: () => void;

beforeEach(() => {
  vi.stubGlobal('MediaMetadata', FakeMetadata);
  usePlayback.setState({ ...INITIAL_PLAYBACK });
  usePlaybackClock.setState({ currentTime: 0, duration: Number.NaN, bufferedAhead: 0 });
  fake = fakeSession();
  eng = engine();
  stop = startMediaSession(eng, fake.session as unknown as MediaSession);
});

afterEach(() => {
  stop();
  vi.unstubAllGlobals();
});

describe('Media Session (ARCH §33, PROVIDERS §53)', () => {
  it('maps actions to the central engine', () => {
    for (const a of ['play', 'pause', 'stop', 'previoustrack', 'nexttrack'] as const) fake.handlers.get(a)!({ action: a });
    expect(eng.play).toHaveBeenCalledOnce();
    expect(eng.pause).toHaveBeenCalledOnce();
    expect(eng.stop).toHaveBeenCalledOnce();
    expect(eng.previous).toHaveBeenCalledOnce();
    expect(eng.next).toHaveBeenCalledOnce();
  });

  it('exposes metadata and playback state of the current item', () => {
    usePlayback.setState({ currentItem: item, status: 'playing' });
    expect(fake.session.metadata).toMatchObject({ title: 'Song', artist: 'Band', album: 'LP', artwork: [{ src: 'https://x/a.jpg' }] });
    expect(fake.session.playbackState).toBe('playing');
    usePlayback.setState({ status: 'paused' });
    expect(fake.session.playbackState).toBe('paused');
    usePlayback.setState({ ...INITIAL_PLAYBACK });
    expect(fake.session.metadata).toBeNull();
    expect(fake.session.playbackState).toBe('none');
  });

  it('uses the declared station name for live radio, never an invented artist', () => {
    const radio = { ...item, artist: undefined, album: undefined, artwork: undefined, title: 'FIP' };
    usePlayback.setState({ currentItem: radio, isLive: true, streamInfo: { stationName: 'FIP Paris', source: 'http-headers' } });
    expect(fake.session.metadata).toMatchObject({ title: 'FIP', artist: 'FIP Paris', album: '', artwork: [] });
    usePlayback.setState({ streamInfo: null });
    expect(fake.session.metadata).toMatchObject({ artist: '' });
  });

  it('offers seeking only while the source can seek', () => {
    expect(fake.handlers.has('seekto')).toBe(false);
    usePlayback.setState({ currentItem: item, canSeek: true });
    fake.handlers.get('seekforward')!({ action: 'seekforward' });
    fake.handlers.get('seekbackward')!({ action: 'seekbackward', seekOffset: 5 });
    fake.handlers.get('seekto')!({ action: 'seekto', seekTime: 42 });
    expect(eng.seekBy.mock.calls).toEqual([[MEDIA_SESSION_SEEK_OFFSET], [-5]]);
    expect(eng.seek).toHaveBeenCalledWith(42);

    usePlayback.setState({ isLive: true });
    expect(['seekto', 'seekforward', 'seekbackward'].some((a) => fake.handlers.has(a))).toBe(false);
  });

  it('reports position for seekable media and clears it for live streams', () => {
    usePlaybackClock.setState({ currentTime: 12, duration: 200 });
    usePlayback.setState({ currentItem: item, canSeek: true, status: 'playing' });
    expect(fake.session.positions.at(-1)).toEqual({ duration: 200, position: 12, playbackRate: 1 });
    const count = fake.session.positions.length;
    usePlaybackClock.setState({ currentTime: 12.2 }); // normal progress: browser extrapolates
    expect(fake.session.positions.length).toBe(count);
    usePlaybackClock.setState({ currentTime: 90 }); // a seek
    expect(fake.session.positions.at(-1)).toMatchObject({ position: 90 });

    usePlayback.setState({ isLive: true, canSeek: false });
    expect(fake.session.positions.at(-1)).toBeUndefined();
  });

  it('cleanup removes every handler', () => {
    usePlayback.setState({ currentItem: item, canSeek: true });
    stop();
    expect(fake.handlers.size).toBe(0);
    expect(fake.session.metadata).toBeNull();
    stop = () => undefined;
  });
});
