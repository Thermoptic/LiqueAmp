// The header tagline (the ticker box, shown while nothing is playing). One
// slogan is picked at random when LiqueAmp loads and stays for the whole
// session; a new page load may pick another. Add or edit slogans here.

export const SLOGANS: readonly string[] = [
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

/** A random slogan from `list` (`random` returns a number in [0, 1), like Math.random). */
export function pickSlogan(list: readonly string[] = SLOGANS, random: () => number = Math.random): string {
  return list[Math.min(list.length - 1, Math.floor(random() * list.length))] ?? '';
}

let sessionPick: string | null = null;

/** This session's slogan: picked on first use, then the same everywhere (the header re-mounts between pages). */
export function sessionSlogan(): string {
  sessionPick ??= pickSlogan();
  return sessionPick;
}
