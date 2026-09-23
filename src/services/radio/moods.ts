// Radio Browser has no "mood" field. The MOOD tab is therefore a curated set
// of real directory tags per mood, and the UI shows which tags each mood
// searches — it never claims a station "is" a mood.

export interface Mood {
  id: string;
  label: string;
  tags: readonly string[];
}

export const MOODS: readonly Mood[] = [
  { id: 'chill', label: 'Chill', tags: ['chillout', 'lounge', 'downtempo'] },
  { id: 'focus', label: 'Focus', tags: ['lofi', 'ambient', 'classical'] },
  { id: 'energetic', label: 'Energetic', tags: ['dance', 'techno', 'edm'] },
  { id: 'late-night', label: 'Late Night', tags: ['jazz', 'smooth jazz', 'deep house'] },
  { id: 'retro', label: 'Retro', tags: ['80s', 'synthwave', 'oldies'] },
  { id: 'talk', label: 'Talk & News', tags: ['news', 'talk'] },
];

/** Merges per-tag results: de-duplicated, most-clicked first. */
export function mergeByPopularity<T extends { id: string; directory?: { clicks?: number } }>(lists: T[][], limit = 60): T[] {
  const byId = new Map<string, T>();
  for (const list of lists) for (const s of list) if (!byId.has(s.id)) byId.set(s.id, s);
  return [...byId.values()].sort((a, b) => (b.directory?.clicks ?? 0) - (a.directory?.clicks ?? 0)).slice(0, limit);
}
