import { createId, nowIso } from '../../lib/id';
import { usePlayback, usePlaybackClock } from '../../stores/playbackStore';
import { useHistory } from '../../stores/historyStore';
import type { MediaItem } from '../../types/media';

/** Seconds of real listening before a play counts as history (ARCH §21). */
export const MIN_LISTEN_SECONDS = 5;
/** While playing, the entry is updated this often so a closed tab loses little. */
const SAVE_EVERY_SECONDS = 15;
/** Ignore gaps longer than this between ticks (tab suspended, sleep). */
const MAX_TICK_MS = 2000;

interface Session {
  loadId: number;
  entryId: string;
  item: MediaItem;
  startedAt: string;
  listened: number;
  lastTick: number | null;
  savedAt: number | null;
}

/**
 * Records actual playback into history. One entry per loaded item; only
 * wall-clock time spent in the "playing" state counts, so pauses, buffering
 * and errors do not inflate it, and quick skips (< 5 s) are not recorded.
 * Returns a function that stops recording.
 */
export function startHistoryRecorder(now: () => number = () => performance.now()): () => void {
  let session: Session | null = null;

  function completion(item: MediaItem): number | undefined {
    const { duration, currentTime } = usePlaybackClock.getState();
    const total = Number.isFinite(duration) && duration > 0 ? duration : (item.duration ?? 0);
    if (!total || !Number.isFinite(total) || usePlayback.getState().isLive) return undefined;
    return Math.max(0, Math.min(100, Math.round((currentTime / total) * 100)));
  }

  function persist(s: Session, final: boolean) {
    s.savedAt = s.listened;
    void useHistory.getState().upsert({
      id: s.entryId,
      mediaId: s.item.id,
      startedAt: s.startedAt,
      endedAt: final ? nowIso() : undefined,
      durationPlayed: Math.round(s.listened),
      completionPercentage: completion(s.item),
      item: s.item,
    });
  }

  function tick() {
    const s = session;
    if (!s || s.lastTick === null) return;
    const t = now();
    s.listened += Math.min(t - s.lastTick, MAX_TICK_MS) / 1000;
    s.lastTick = t;
    if (s.savedAt === null ? s.listened >= MIN_LISTEN_SECONDS : s.listened - s.savedAt >= SAVE_EVERY_SECONDS) persist(s, false);
  }

  function finalize() {
    if (session) {
      tick();
      if (session.savedAt !== null) persist(session, true);
    }
    session = null;
  }

  const unsubPlayback = usePlayback.subscribe((state, prev) => {
    if (state.loadId !== prev.loadId) finalize();
    if (state.status === 'playing' && state.currentItem) {
      if (!session) {
        session = {
          loadId: state.loadId,
          entryId: createId('hist'),
          item: state.currentItem,
          startedAt: nowIso(),
          listened: 0,
          lastTick: null,
          savedAt: null,
        };
      }
      if (session.lastTick === null) session.lastTick = now();
    } else if (session) {
      tick();
      session.lastTick = null;
    }
  });
  const unsubClock = usePlaybackClock.subscribe(tick);
  const onPageHide = () => finalize();
  if (typeof window !== 'undefined') window.addEventListener('pagehide', onPageHide);

  return () => {
    finalize();
    unsubPlayback();
    unsubClock();
    if (typeof window !== 'undefined') window.removeEventListener('pagehide', onPageHide);
  };
}
