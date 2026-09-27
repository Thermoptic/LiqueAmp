// Retro systems shown in the Retro panel (the tabs are built from this list).
// Adding a system (SNES, Game Boy, Arcade, …) is a new entry here plus, when
// its music is added, a source registered for it (./sources.ts); the Browse
// layout does not change.

export interface RetroSystem {
  /** Stable id, also used for a source registration and in element ids. */
  id: string;
  /** Tab label, as on the hardware. */
  name: string;
  /** The full name, for accessible labels and hints. */
  label: string;
  /** Music file format of this system's source (NSF, SID, VGM, …). */
  format: string;
}

export const RETRO_SYSTEMS: readonly RetroSystem[] = [
  { id: 'nes', name: 'NES', label: 'Nintendo Entertainment System', format: 'NSF' },
  { id: 'c64', name: 'C64', label: 'Commodore 64', format: 'SID' },
  { id: 'megadrive', name: 'MEGADRIVE', label: 'Sega Mega Drive', format: 'VGM' },
];

export function retroSystem(id: string | null | undefined): RetroSystem | undefined {
  return RETRO_SYSTEMS.find((s) => s.id === id);
}
