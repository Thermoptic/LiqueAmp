import { beforeEach, describe, expect, it, vi } from 'vitest';
import { INITIAL_PLAYBACK, usePlayback } from '../../stores/playbackStore';
import { useSettings } from '../../stores/settingsStore';
import { DEFAULT_SETTINGS } from '../../types/settings';
import { handleShortcut, SEEK_STEP } from './keyboard';

function engine() {
  return { togglePlay: vi.fn(async () => {}), next: vi.fn(async () => {}), previous: vi.fn(async () => {}), seekBy: vi.fn() };
}

function press(key: string, target: Element = document.body, init: KeyboardEventInit = {}) {
  const e = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init });
  Object.defineProperty(e, 'target', { value: target });
  return e;
}

let eng: ReturnType<typeof engine>;

beforeEach(() => {
  document.body.innerHTML = '';
  useSettings.setState({ ...DEFAULT_SETTINGS, hydrated: true, volume: 0.5, muted: false });
  usePlayback.setState({ ...INITIAL_PLAYBACK, canSeek: true, canSetVolume: true });
  eng = engine();
});

describe('keyboard shortcuts (ARCH §35, MASTER §44)', () => {
  it('maps the documented keys to engine commands', () => {
    const e = press(' ');
    expect(handleShortcut(e, eng)).toBe(true);
    expect(e.defaultPrevented).toBe(true);
    expect(eng.togglePlay).toHaveBeenCalledOnce();

    handleShortcut(press('n'), eng);
    handleShortcut(press('P'), eng); // caps lock
    expect(eng.next).toHaveBeenCalledOnce();
    expect(eng.previous).toHaveBeenCalledOnce();

    handleShortcut(press('ArrowLeft'), eng);
    handleShortcut(press('ArrowRight'), eng);
    expect(eng.seekBy.mock.calls).toEqual([[-SEEK_STEP], [SEEK_STEP]]);
  });

  it('changes volume in 5% steps, clamped, and unmutes', () => {
    useSettings.setState({ muted: true, volume: 0.98 });
    handleShortcut(press('ArrowUp'), eng);
    expect(useSettings.getState()).toMatchObject({ volume: 1, muted: false });
    for (let i = 0; i < 30; i++) handleShortcut(press('ArrowDown'), eng);
    expect(useSettings.getState().volume).toBe(0);
  });

  it('M toggles mute', () => {
    handleShortcut(press('m'), eng);
    expect(useSettings.getState().muted).toBe(true);
    handleShortcut(press('m'), eng);
    expect(useSettings.getState().muted).toBe(false);
  });

  it('never fires while typing', () => {
    document.body.innerHTML = '<input id="i"><textarea id="t"></textarea><select id="s"></select><div id="c" contenteditable="true"><span id="inner">x</span></div>';
    for (const id of ['i', 't', 's', 'c', 'inner']) {
      const e = press(' ', document.getElementById(id)!);
      expect(handleShortcut(e, eng)).toBe(false);
      expect(e.defaultPrevented).toBe(false);
      handleShortcut(press('n', document.getElementById(id)!), eng);
      handleShortcut(press('ArrowUp', document.getElementById(id)!), eng);
    }
    expect(eng.togglePlay).not.toHaveBeenCalled();
    expect(eng.next).not.toHaveBeenCalled();
    expect(useSettings.getState().volume).toBe(0.5);
  });

  it('leaves Space to a focused button and arrows to widgets that use them', () => {
    document.body.innerHTML = '<button id="b">x</button><input type="range" id="r"><div role="radiogroup"><button role="radio" id="radio">a</button></div><div role="tablist"><button role="tab" id="tab">t</button></div>';
    expect(handleShortcut(press(' ', document.getElementById('b')!), eng)).toBe(false);
    expect(handleShortcut(press('ArrowLeft', document.getElementById('radio')!), eng)).toBe(false);
    expect(handleShortcut(press('ArrowRight', document.getElementById('tab')!), eng)).toBe(false);
    expect(handleShortcut(press('ArrowUp', document.getElementById('r')!), eng)).toBe(false);
    // letters still work from a focused button
    expect(handleShortcut(press('n', document.getElementById('b')!), eng)).toBe(true);
  });

  it('ignores modifier combinations, key repeat for toggles, open dialogs and the off switch', () => {
    expect(handleShortcut(press('n', document.body, { ctrlKey: true }), eng)).toBe(false);
    expect(handleShortcut(press('p', document.body, { metaKey: true }), eng)).toBe(false);
    expect(handleShortcut(press(' ', document.body, { repeat: true }), eng)).toBe(false);

    document.body.innerHTML = '<dialog open><p>x</p></dialog>';
    expect(handleShortcut(press(' '), eng)).toBe(false);
    document.body.innerHTML = '';

    useSettings.setState({ shortcuts: false });
    expect(handleShortcut(press(' '), eng)).toBe(false);
    expect(eng.togglePlay).not.toHaveBeenCalled();
  });

  it('does not seek live or non-seekable sources, and respects provider volume', () => {
    usePlayback.setState({ isLive: true, canSeek: false });
    expect(handleShortcut(press('ArrowRight'), eng)).toBe(true); // consumed, announced
    expect(eng.seekBy).not.toHaveBeenCalled();

    usePlayback.setState({ canSetVolume: false });
    handleShortcut(press('ArrowUp'), eng);
    handleShortcut(press('m'), eng);
    expect(useSettings.getState()).toMatchObject({ volume: 0.5, muted: false });
  });
});
