import { announce } from '../a11y/announce';
import type { PlaybackEngine } from '../playback/engine';
import { usePlayback } from '../../stores/playbackStore';
import { useSettings } from '../../stores/settingsStore';

export const SEEK_STEP = 10;
export const VOLUME_STEP = 0.05;

/** Shown in Settings; the one source for what the keys do (ARCH §35). */
export const SHORTCUTS: ReadonlyArray<{ keys: string; action: string }> = [
  { keys: 'Space', action: 'Play / pause' },
  { keys: 'N', action: 'Next' },
  { keys: 'P', action: 'Previous' },
  { keys: 'M', action: 'Mute / unmute' },
  { keys: '← / →', action: `Seek −/+ ${SEEK_STEP} s (seekable sources only)` },
  { keys: '↑ / ↓', action: `Volume +/− ${Math.round(VOLUME_STEP * 100)}%` },
];

type EngineCommands = Pick<PlaybackEngine, 'togglePlay' | 'next' | 'previous' | 'seekBy'>;

/** Anything the user types into, or that uses its own keys. */
const TYPING = 'input, textarea, select, [contenteditable]:not([contenteditable="false"])';
/** Widgets where Space activates the focused control. */
const ACTIVATES = 'button, a[href], summary, [role="button"], [role="switch"], [role="checkbox"], [role="radio"], [role="tab"], [role="option"], [role="menuitem"], [role="link"]';
/** Widgets that use arrow keys themselves. */
const ARROW_WIDGETS = '[role="slider"], [role="radiogroup"], [role="radio"], [role="tablist"], [role="tab"], [role="listbox"], [role="option"], [role="menu"], [role="menuitem"], [role="grid"], [role="tree"], [role="spinbutton"]';

function closest(target: EventTarget | null, selector: string): boolean {
  return target instanceof Element && target.closest(selector) !== null;
}

/**
 * Handles one keydown. Returns true when it was a player shortcut (and the
 * default was prevented). Shortcuts never fire while typing, with modifier
 * keys, inside an open dialog, or when the focused control needs the key.
 */
export function handleShortcut(e: KeyboardEvent, engine: EngineCommands): boolean {
  if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey || e.isComposing) return false;
  if (!useSettings.getState().shortcuts) return false;
  const target = e.target;
  if (closest(target, TYPING)) return false;
  if (typeof document !== 'undefined' && document.querySelector('dialog[open]')) return false;

  const key = e.key;
  const lower = key.length === 1 ? key.toLowerCase() : key;
  const run = (fn: () => void) => {
    e.preventDefault();
    fn();
    return true;
  };

  switch (lower) {
    case ' ':
      if (e.repeat || closest(target, ACTIVATES)) return false;
      return run(() => void engine.togglePlay());
    case 'n':
      return e.shiftKey || e.repeat ? false : run(() => void engine.next());
    case 'p':
      return e.shiftKey || e.repeat ? false : run(() => void engine.previous());
    case 'm':
      return e.shiftKey || e.repeat ? false : run(toggleMute);
    case 'ArrowLeft':
    case 'ArrowRight': {
      if (closest(target, ARROW_WIDGETS)) return false;
      const { canSeek, isLive } = usePlayback.getState();
      if (!canSeek || isLive) return run(() => announce(isLive ? 'Live stream — seeking not available' : 'Seeking not available'));
      const delta = lower === 'ArrowLeft' ? -SEEK_STEP : SEEK_STEP;
      return run(() => {
        engine.seekBy(delta);
        announce(`Seek ${delta > 0 ? 'forward' : 'back'} ${SEEK_STEP} seconds`);
      });
    }
    case 'ArrowUp':
    case 'ArrowDown':
      if (closest(target, ARROW_WIDGETS)) return false;
      return run(() => changeVolume(lower === 'ArrowUp' ? VOLUME_STEP : -VOLUME_STEP));
    default:
      return false;
  }
}

function toggleMute() {
  if (!usePlayback.getState().canSetVolume) return announce('Volume is controlled by the provider player');
  const { muted, update } = useSettings.getState();
  update({ muted: !muted });
  announce(muted ? 'Unmuted' : 'Muted');
}

function changeVolume(delta: number) {
  if (!usePlayback.getState().canSetVolume) return announce('Volume is controlled by the provider player');
  const { volume, update } = useSettings.getState();
  // two decimals so repeated steps land on clean values
  const next = Math.round(Math.min(1, Math.max(0, volume + delta)) * 100) / 100;
  update({ volume: next, muted: false });
  announce(`Volume ${Math.round(next * 100)}%`);
}

/** Installs the global keyboard layer; returns a cleanup function. */
export function startKeyboardShortcuts(engine: EngineCommands, target: Window = window): () => void {
  const onKeyDown = (e: KeyboardEvent) => void handleShortcut(e, engine);
  target.addEventListener('keydown', onKeyDown);
  return () => target.removeEventListener('keydown', onKeyDown);
}
