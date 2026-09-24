// Validation helpers for editable media fields (/control › Media).

/** Comma-separated tags → trimmed, de-duplicated list (max 20). */
export function parseTags(input: string): string[] {
  // de-duplicate case-insensitively, keeping the user's casing of the first occurrence
  const out: string[] = [];
  const used = new Set<string>();
  for (const raw of input.split(',')) {
    const tag = raw.trim().replace(/^#/, '').slice(0, 40);
    if (tag && !used.has(tag.toLowerCase())) {
      used.add(tag.toLowerCase());
      out.push(tag);
    }
  }
  return out.slice(0, 20);
}

/** Artwork must be an http(s) image URL, or empty. */
export function validArtwork(url: string): boolean {
  if (!url.trim()) return true;
  try {
    return ['http:', 'https:'].includes(new URL(url.trim()).protocol);
  } catch {
    return false;
  }
}
