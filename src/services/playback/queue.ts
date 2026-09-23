// Pure queue logic (ARCH §19). No I/O, no randomness unless injected, so the
// transitions are fully testable. The queue store wraps these functions.

import type { MediaItem } from '../../types/media';
import type { RepeatMode } from '../../types/settings';

export interface QueueEntry {
  /** Unique per queue slot, so the same media can be queued twice. */
  entryId: string;
  item: MediaItem;
}

export interface QueueState {
  entries: QueueEntry[];
  currentId: string | null;
  /** Entries played before the current one, oldest first (for Previous). */
  history: string[];
  /** Entries already played in the current shuffle cycle. */
  played: string[];
}

export const EMPTY_QUEUE: QueueState = { entries: [], currentId: null, history: [], played: [] };

export function indexOf(state: QueueState, entryId: string | null): number {
  return entryId ? state.entries.findIndex((e) => e.entryId === entryId) : -1;
}

export function currentEntry(state: QueueState): QueueEntry | null {
  return state.entries.find((e) => e.entryId === state.currentId) ?? null;
}

export function append(state: QueueState, entries: QueueEntry[]): QueueState {
  return { ...state, entries: [...state.entries, ...entries] };
}

/** Inserts right after the current entry (or at the start when idle). */
export function insertNext(state: QueueState, entries: QueueEntry[]): QueueState {
  const at = indexOf(state, state.currentId) + 1;
  const next = [...state.entries];
  next.splice(at, 0, ...entries);
  return { ...state, entries: next };
}

export function remove(state: QueueState, entryId: string): QueueState {
  return {
    entries: state.entries.filter((e) => e.entryId !== entryId),
    currentId: state.currentId === entryId ? null : state.currentId,
    history: state.history.filter((id) => id !== entryId),
    played: state.played.filter((id) => id !== entryId),
  };
}

export function move(state: QueueState, entryId: string, toIndex: number): QueueState {
  const from = indexOf(state, entryId);
  if (from < 0) return state;
  const target = Math.max(0, Math.min(state.entries.length - 1, toIndex));
  if (from === target) return state;
  const next = [...state.entries];
  const [entry] = next.splice(from, 1);
  next.splice(target, 0, entry!);
  return { ...state, entries: next };
}

/** Clears everything except the entry that is currently playing. */
export function clearUpcoming(state: QueueState): QueueState {
  const cur = currentEntry(state);
  return { entries: cur ? [cur] : [], currentId: cur?.entryId ?? null, history: [], played: cur ? [cur.entryId] : [] };
}

/** Shuffles the entries after the current one, in place of play order. */
export function shuffleUpcoming(state: QueueState, random: () => number = Math.random): QueueState {
  const at = indexOf(state, state.currentId) + 1;
  const head = state.entries.slice(0, at);
  const tail = state.entries.slice(at);
  for (let i = tail.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [tail[i], tail[j]] = [tail[j]!, tail[i]!];
  }
  return { ...state, entries: [...head, ...tail] };
}

/** Marks an entry as current, recording the previous one in history. */
export function setCurrent(state: QueueState, entryId: string, recordHistory = true): QueueState {
  if (indexOf(state, entryId) < 0) return state;
  const history =
    recordHistory && state.currentId && state.currentId !== entryId ? [...state.history, state.currentId].slice(-200) : state.history;
  const played = state.played.includes(entryId) ? state.played : [...state.played, entryId];
  return { ...state, currentId: entryId, history, played };
}

export interface NextOptions {
  shuffle: boolean;
  repeat: RepeatMode;
  /** true when the current track ended by itself (vs. the user pressing Next). */
  auto: boolean;
  random?: () => number;
}

export interface NextResult {
  entryId: string | null;
  /** Shuffle cycle to use once the next entry is set. */
  played: string[];
}

/**
 * Decides what plays next. Repeat-one only applies to automatic advance;
 * pressing Next always moves on.
 */
export function computeNext(state: QueueState, opts: NextOptions): NextResult {
  const { entries, currentId } = state;
  if (entries.length === 0) return { entryId: null, played: state.played };
  if (opts.auto && opts.repeat === 'one' && currentId && indexOf(state, currentId) >= 0) {
    return { entryId: currentId, played: state.played };
  }

  if (opts.shuffle) {
    const random = opts.random ?? Math.random;
    let played = state.played;
    let pool = entries.filter((e) => e.entryId !== currentId && !played.includes(e.entryId));
    if (pool.length === 0) {
      if (opts.repeat !== 'all') return { entryId: null, played };
      // new cycle: everything except the entry that just played
      played = currentId ? [currentId] : [];
      pool = entries.filter((e) => e.entryId !== currentId);
      if (pool.length === 0) pool = entries;
    }
    const pick = pool[Math.floor(random() * pool.length)]!;
    return { entryId: pick.entryId, played };
  }

  const i = indexOf(state, currentId);
  if (i + 1 < entries.length) return { entryId: entries[i + 1]!.entryId, played: state.played };
  if (opts.repeat === 'all') return { entryId: entries[0]!.entryId, played: [] };
  return { entryId: null, played: state.played };
}

/** Previous entry: shuffle walks back through history, otherwise list order. */
export function computePrevious(state: QueueState, opts: { shuffle: boolean; repeat: RepeatMode }): string | null {
  if (opts.shuffle) {
    for (let k = state.history.length - 1; k >= 0; k--) {
      const id = state.history[k]!;
      if (indexOf(state, id) >= 0) return id;
    }
    return null;
  }
  const i = indexOf(state, state.currentId);
  if (i > 0) return state.entries[i - 1]!.entryId;
  if (i === 0 && opts.repeat === 'all' && state.entries.length > 1) return state.entries[state.entries.length - 1]!.entryId;
  return null;
}
