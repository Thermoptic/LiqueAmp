import { beforeEach, describe, expect, it } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { resetDbForTests } from '../storage/db';
import { INITIAL_PLAYBACK, usePlayback } from '../../stores/playbackStore';
import { useQueue } from '../../stores/queueStore';
import { useSettings } from '../../stores/settingsStore';
import { DEFAULT_SETTINGS } from '../../types/settings';
import type { MediaItem } from '../../types/media';
import type { AudioBackend, BackendListener } from './backend';
import { PlaybackEngine, resolvePlaybackMode } from './engine';
import { EMPTY_QUEUE } from './queue';
import { fromMediaError, fromPlayRejection, playbackError, PlaybackFailure } from './errors';

/** Records calls and lets tests fire backend events. */
class FakeBackend implements AudioBackend {
  listener!: BackendListener;
  calls: string[] = [];
  loaded: string[] = [];
  currentTime = 0;
  volume = -1;
  muted = false;
  failLoad: PlaybackFailure | null = null;
  setListener(l: BackendListener) {
    this.listener = l;
  }
  prime() {
    this.calls.push('prime');
  }
  async load(url: string) {
    this.calls.push('load');
    if (this.failLoad) throw this.failLoad;
    this.loaded.push(url);
    this.listener.onStatus('loading');
  }
  async play() {
    this.calls.push('play');
    this.listener.onStatus('playing');
  }
  pause() {
    this.calls.push('pause');
    this.listener.onStatus('paused');
  }
  stop() {
    this.calls.push('stop');
  }
  seek(t: number) {
    this.calls.push(`seek:${t}`);
    this.currentTime = t;
  }
  setVolume(v: number, m: boolean) {
    this.volume = v;
    this.muted = m;
  }
}

function item(id: string, extra: Partial<MediaItem> = {}): MediaItem {
  return { id, provider: 'direct', title: id, sourceUrl: `https://x/${id}.mp3`, playbackType: 'direct', createdAt: '', updatedAt: '', ...extra };
}

let backend: FakeBackend;
let engine: PlaybackEngine;

beforeEach(async () => {
  await resetDbForTests();
  globalThis.indexedDB = new IDBFactory();
  useSettings.setState({ ...DEFAULT_SETTINGS, hydrated: true });
  useQueue.setState({ ...EMPTY_QUEUE });
  usePlayback.setState({ ...INITIAL_PLAYBACK });
  backend = new FakeBackend();
  engine = new PlaybackEngine(backend);
});

describe('PlaybackEngine', () => {
  it('playList replaces the queue and plays the start item', async () => {
    await engine.playList([item('a'), item('b')], 1);
    expect(backend.loaded).toEqual(['https://x/b.mp3']);
    expect(usePlayback.getState().status).toBe('playing');
    expect(usePlayback.getState().currentItem?.id).toBe('b');
    expect(useQueue.getState().entries).toHaveLength(2);
  });

  it('primes the audio backend synchronously on user commands', async () => {
    const p = engine.playNow(item('a'));
    expect(backend.calls[0]).toBe('prime');
    await p;
  });

  it('prefers streamUrl over sourceUrl', async () => {
    await engine.playNow(item('a', { streamUrl: 'https://cdn/a.aac' }));
    expect(backend.loaded).toEqual(['https://cdn/a.aac']);
  });

  it('enqueue never starts playback (DESIGN §76)', () => {
    engine.enqueue([item('a')]);
    expect(backend.calls).not.toContain('load');
    expect(usePlayback.getState().status).toBe('idle');
  });

  it('playNow inserts after the current entry', async () => {
    await engine.playList([item('a'), item('b')]);
    await engine.playNow(item('x'));
    expect(useQueue.getState().entries.map((e) => e.item.id)).toEqual(['a', 'x', 'b']);
  });

  it('togglePlay pauses and resumes', async () => {
    await engine.playList([item('a')]);
    await engine.togglePlay();
    expect(usePlayback.getState().status).toBe('paused');
    await engine.togglePlay();
    expect(usePlayback.getState().status).toBe('playing');
    expect(backend.loaded).toHaveLength(1);
  });

  it('play on an idle engine starts the restored queue', async () => {
    engine.enqueue([item('a'), item('b')]);
    await engine.play();
    expect(usePlayback.getState().currentItem?.id).toBe('a');
  });

  it('auto-advances on end and pauses at the end of the queue', async () => {
    await engine.playList([item('a'), item('b')]);
    backend.listener.onEnded();
    await Promise.resolve();
    await Promise.resolve();
    expect(usePlayback.getState().currentItem?.id).toBe('b');
    backend.listener.onEnded();
    expect(usePlayback.getState().status).toBe('paused');
    expect(usePlayback.getState().currentItem?.id).toBe('b');
  });

  it('repeat one replays the same item on end', async () => {
    useSettings.setState({ repeat: 'one' });
    await engine.playList([item('a'), item('b')]);
    backend.listener.onEnded();
    await Promise.resolve();
    expect(backend.calls).toContain('seek:0');
    expect(usePlayback.getState().currentItem?.id).toBe('a');
  });

  it('previous restarts the track after 3 seconds, else goes back', async () => {
    await engine.playList([item('a'), item('b')], 1);
    usePlayback.setState({ canSeek: true });
    backend.currentTime = 10;
    await engine.previous();
    expect(backend.calls).toContain('seek:0');
    expect(usePlayback.getState().currentItem?.id).toBe('b');
    backend.currentTime = 1;
    await engine.previous();
    expect(usePlayback.getState().currentItem?.id).toBe('a');
  });

  it('seek is ignored for non-seekable (live) sources', async () => {
    await engine.playList([item('a')]);
    backend.listener.onMeta({ duration: Infinity, isLive: true, canSeek: false });
    engine.seek(30);
    expect(backend.calls.some((c) => c.startsWith('seek'))).toBe(false);
    expect(usePlayback.getState().isLive).toBe(true);
  });

  it('reports load failures as structured errors', async () => {
    backend.failLoad = new PlaybackFailure(playbackError('MIXED_CONTENT', 'insecure', false));
    await engine.playNow(item('a'));
    const s = usePlayback.getState();
    expect(s.status).toBe('error');
    expect(s.error?.code).toBe('MIXED_CONTENT');
  });

  it('does not fake playback for providers without a backend yet', async () => {
    await engine.playNow(item('yt', { provider: 'youtube', playbackType: 'embed' }));
    const s = usePlayback.getState();
    expect(s.status).toBe('error');
    expect(s.error?.code).toBe('PROVIDER_NOT_SUPPORTED');
    expect(backend.loaded).toEqual([]);
  });

  it('a later backend error is not overwritten by a pause event', async () => {
    await engine.playNow(item('a'));
    backend.listener.onError(playbackError('NETWORK_ERROR', 'lost'));
    backend.listener.onStatus('paused');
    expect(usePlayback.getState().status).toBe('error');
  });

  it('applies and follows volume settings', () => {
    expect(backend.volume).toBe(DEFAULT_SETTINGS.volume);
    useSettings.getState().update({ volume: 0.25, muted: true });
    expect(backend.volume).toBe(0.25);
    expect(backend.muted).toBe(true);
  });

  it('stop resets the session but keeps the queue', async () => {
    await engine.playList([item('a'), item('b')]);
    engine.stop();
    expect(usePlayback.getState().status).toBe('idle');
    expect(usePlayback.getState().currentItem).toBeNull();
    expect(useQueue.getState().entries).toHaveLength(2);
  });
});

describe('playback helpers', () => {
  it('maps playback types to modes', () => {
    expect(resolvePlaybackMode(item('a'))).toBe('native-audio');
    expect(resolvePlaybackMode(item('a', { playbackType: 'radio' }))).toBe('native-audio');
    expect(resolvePlaybackMode(item('a', { playbackType: 'embed' }))).toBe('embedded');
    expect(resolvePlaybackMode(item('a', { playbackType: 'external' }))).toBe('external');
  });

  it('maps media element errors', () => {
    expect(fromMediaError(1, true)).toBeNull();
    expect(fromMediaError(2, true)?.code).toBe('NETWORK_ERROR');
    expect(fromMediaError(3, true)?.code).toBe('MEDIA_FORMAT_NOT_SUPPORTED');
    expect(fromMediaError(4, true)?.code).toBe('STREAM_UNAVAILABLE');
    expect(fromMediaError(4, false)?.message).toMatch(/offline/i);
  });

  it('maps play() rejections', () => {
    expect(fromPlayRejection(new DOMException('x', 'NotAllowedError'))?.code).toBe('PLAYBACK_BLOCKED');
    expect(fromPlayRejection(new DOMException('x', 'AbortError'))).toBeNull();
  });
});
