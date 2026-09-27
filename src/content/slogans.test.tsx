// The header tagline: one random slogan per page load, unchanged while navigating.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { pickSlogan, SLOGANS } from './slogans';

afterEach(cleanup);

const EXPECTED = [
  'There are better music players, but none this lickable.',
  'Because apparently music needed a tongue.',
  'We could have made a better player, but we got distracted by licking things.',
  'Premium audio, questionable tongue technique.',
  'Your music has never felt this unnecessarily seductive.',
  'Why listen to music when you can make it uncomfortable?',
  'A mediocre music player with surprisingly intimate audio.',
  'We put the sexy back into unnecessarily complicated audio software.',
  'For when your playlist needs a little tongue action.',
  'Other players stream music, LiqueAmp gets unnecessarily intimate with it.',
  'Music playback has never been this close to needing a safe word.',
  'We spent months building this instead of using a perfectly good music player.',
  'Your ears called, and apparently they want to be seduced.',
  'Like other music players, but with considerably more tongue.',
  'Technically a music player, emotionally a bad decision.',
  'We could explain the audio engine, but licking the waveform is easier.',
  "Making your frequencies feel things they probably shouldn't.",
  'For people who want their audio deep, warm, and slightly moist.',
  "It plays music, and somehow that's the least interesting thing about it.",
  'LiqueAmp — because your audio deserves to be licked before it gets played.',
];

describe('header slogans', () => {
  it('the list is exactly the new slogans, each once; the old tagline is gone', () => {
    expect(SLOGANS).toEqual(EXPECTED);
    expect(new Set(SLOGANS).size).toBe(SLOGANS.length);
    expect(SLOGANS.join(' ')).not.toMatch(/PLACES|ALWAYS ON/i);
  });

  it('picks any slogan, uniformly by index', () => {
    expect(pickSlogan(SLOGANS, () => 0)).toBe(SLOGANS[0]);
    expect(pickSlogan(SLOGANS, () => 0.999999)).toBe(SLOGANS[SLOGANS.length - 1]);
    expect(pickSlogan(SLOGANS, () => 0.5)).toBe(SLOGANS[10]);
    expect(new Set(SLOGANS.map((_, i) => pickSlogan(SLOGANS, () => i / SLOGANS.length)))).toEqual(new Set(SLOGANS));
  });

  it('the header shows one slogan at once and keeps it while pages change; a new load can pick another', async () => {
    const shown = new Set<string>();
    for (const r of [0.01, 0.51]) {
      vi.resetModules(); // a page load
      vi.spyOn(Math, 'random').mockReturnValue(r);
      const { Header } = await import('../components/layout/Header');
      const ticker = () => document.querySelector('.app-header__ticker .truncate')!.textContent!;
      const first = render(
        <MemoryRouter>
          <Header />
        </MemoryRouter>,
      );
      const slogan = ticker();
      expect(SLOGANS).toContain(slogan); // immediately on the first render
      first.unmount(); // e.g. Home → /control: another page renders the header anew
      vi.spyOn(Math, 'random').mockReturnValue(0.99);
      render(
        <MemoryRouter>
          <Header />
        </MemoryRouter>,
      );
      expect(ticker()).toBe(slogan); // the same slogan all session
      shown.add(slogan);
      cleanup();
      vi.restoreAllMocks();
    }
    expect(shown.size).toBe(2); // two loads, two different slogans
  });
});
