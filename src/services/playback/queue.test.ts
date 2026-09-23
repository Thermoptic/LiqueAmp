import { describe, expect, it } from 'vitest';
import type { MediaItem } from '../../types/media';
import * as Q from './queue';

function item(id: string): MediaItem {
  return { id, provider: 'direct', title: id, sourceUrl: `https://x/${id}.mp3`, playbackType: 'direct', createdAt: '', updatedAt: '' };
}

function queueOf(...ids: string[]): Q.QueueState {
  return { ...Q.EMPTY_QUEUE, entries: ids.map((id) => ({ entryId: id, item: item(id) })) };
}

const ids = (s: Q.QueueState) => s.entries.map((e) => e.entryId);

describe('queue editing', () => {
  it('insertNext puts entries right after the current one', () => {
    const s = Q.setCurrent(queueOf('a', 'b', 'c'), 'a');
    const next = Q.insertNext(s, [{ entryId: 'x', item: item('x') }]);
    expect(ids(next)).toEqual(['a', 'x', 'b', 'c']);
  });

  it('insertNext on an idle queue inserts at the start', () => {
    expect(ids(Q.insertNext(queueOf('a'), [{ entryId: 'x', item: item('x') }]))).toEqual(['x', 'a']);
  });

  it('allows the same media twice via distinct entry ids', () => {
    const s = Q.append(queueOf('a'), [{ entryId: 'a2', item: item('a') }]);
    expect(s.entries.map((e) => e.item.id)).toEqual(['a', 'a']);
  });

  it('remove clears current/history references', () => {
    let s = Q.setCurrent(queueOf('a', 'b'), 'a');
    s = Q.setCurrent(s, 'b');
    s = Q.remove(s, 'a');
    expect(ids(s)).toEqual(['b']);
    expect(s.history).toEqual([]);
    expect(Q.remove(s, 'b').currentId).toBeNull();
  });

  it('move clamps and reorders', () => {
    const s = queueOf('a', 'b', 'c');
    expect(ids(Q.move(s, 'a', 2))).toEqual(['b', 'c', 'a']);
    expect(ids(Q.move(s, 'c', -5))).toEqual(['c', 'a', 'b']);
    expect(Q.move(s, 'nope', 0)).toBe(s);
  });

  it('clearUpcoming keeps only the current entry', () => {
    const s = Q.setCurrent(queueOf('a', 'b', 'c'), 'b');
    expect(ids(Q.clearUpcoming(s))).toEqual(['b']);
    expect(ids(Q.clearUpcoming(queueOf('a')))).toEqual([]);
  });

  it('shuffleUpcoming leaves played/current entries in place', () => {
    const s = Q.setCurrent(queueOf('a', 'b', 'c', 'd', 'e'), 'b');
    const shuffled = Q.shuffleUpcoming(s, () => 0);
    expect(ids(shuffled).slice(0, 2)).toEqual(['a', 'b']);
    expect([...ids(shuffled).slice(2)].sort()).toEqual(['c', 'd', 'e']);
  });
});

describe('computeNext', () => {
  const base = { shuffle: false, repeat: 'off' as const, auto: false };

  it('advances in order and stops at the end without repeat', () => {
    const s = Q.setCurrent(queueOf('a', 'b'), 'a');
    expect(Q.computeNext(s, base).entryId).toBe('b');
    expect(Q.computeNext(Q.setCurrent(s, 'b'), base).entryId).toBeNull();
  });

  it('wraps with repeat all', () => {
    const s = Q.setCurrent(queueOf('a', 'b'), 'b');
    expect(Q.computeNext(s, { ...base, repeat: 'all' }).entryId).toBe('a');
  });

  it('repeat one only repeats on automatic advance', () => {
    const s = Q.setCurrent(queueOf('a', 'b'), 'a');
    expect(Q.computeNext(s, { ...base, repeat: 'one', auto: true }).entryId).toBe('a');
    expect(Q.computeNext(s, { ...base, repeat: 'one', auto: false }).entryId).toBe('b');
  });

  it('starts from the first entry when nothing is current', () => {
    expect(Q.computeNext(queueOf('a', 'b'), base).entryId).toBe('a');
  });

  it('shuffle never repeats within a cycle and ends without repeat', () => {
    let s = Q.setCurrent(queueOf('a', 'b', 'c'), 'a');
    const seen = ['a'];
    for (let i = 0; i < 2; i++) {
      const r = Q.computeNext(s, { ...base, shuffle: true, random: () => 0.99 });
      expect(r.entryId).not.toBeNull();
      expect(seen).not.toContain(r.entryId);
      seen.push(r.entryId!);
      s = Q.setCurrent({ ...s, played: r.played }, r.entryId!);
    }
    expect(Q.computeNext(s, { ...base, shuffle: true }).entryId).toBeNull();
  });

  it('shuffle with repeat all starts a new cycle, not replaying the current entry first', () => {
    let s = Q.setCurrent(queueOf('a', 'b'), 'a');
    s = Q.setCurrent(s, 'b');
    const r = Q.computeNext(s, { ...base, shuffle: true, repeat: 'all', random: () => 0 });
    expect(r.entryId).toBe('a');
    expect(r.played).toEqual(['b']);
  });
});

describe('computePrevious', () => {
  it('goes back in list order', () => {
    const s = Q.setCurrent(queueOf('a', 'b', 'c'), 'c');
    expect(Q.computePrevious(s, { shuffle: false, repeat: 'off' })).toBe('b');
    expect(Q.computePrevious(Q.setCurrent(s, 'a'), { shuffle: false, repeat: 'off' })).toBeNull();
    expect(Q.computePrevious(Q.setCurrent(s, 'a'), { shuffle: false, repeat: 'all' })).toBe('c');
  });

  it('walks back through play history when shuffled', () => {
    let s = queueOf('a', 'b', 'c');
    s = Q.setCurrent(s, 'c');
    s = Q.setCurrent(s, 'a');
    expect(Q.computePrevious(s, { shuffle: true, repeat: 'off' })).toBe('c');
  });
});
