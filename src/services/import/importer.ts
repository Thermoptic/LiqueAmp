// URL import pipeline (PROVIDERS §10, MASTER §18):
// URL → normalize → detect provider → validate → resolve → preview → import.
// Nothing is saved here; the preview is committed by the caller.

import { mediaIdentity } from '../../stores/libraryStore';
import type { MediaItem } from '../../types/media';
import { detectSource, InvalidUrlError, type Detection } from '../providers/detect';
import { resolveDirect, type DirectFormat } from '../providers/direct';
import { ProviderError } from '../providers/errors';

export type ImportStep = 'detecting' | 'resolving';

export interface PreviewEntry {
  item: MediaItem;
  /** Already in the library (same id or same source); not selected by default. */
  duplicateOf?: MediaItem;
}

export type ImportPreview =
  | { status: 'ready'; detection: Detection; kind: DirectFormat; entries: PreviewEntry[]; notes: string[] }
  /** Recognised, but this provider's integration (metadata/playback) is not built yet. */
  | { status: 'provider-pending'; detection: Detection }
  | { status: 'error'; title: string; message: string };

export interface ImportOptions {
  library: MediaItem[];
  onStep?(step: ImportStep): void;
  fetchImpl?: typeof fetch;
}

/** Builds an import preview for a pasted URL. Never throws. */
export async function previewImport(input: string, { library, onStep, fetchImpl }: ImportOptions): Promise<ImportPreview> {
  onStep?.('detecting');
  let detection: Detection;
  try {
    detection = detectSource(input);
  } catch (err) {
    return { status: 'error', title: 'INVALID URL', message: err instanceof InvalidUrlError ? err.message : String(err) };
  }
  if (detection.kind === 'unsupported') {
    return { status: 'error', title: 'UNSUPPORTED SOURCE', message: detection.reason ?? 'This address cannot be played in a browser.' };
  }
  if (detection.provider !== 'direct') return { status: 'provider-pending', detection };

  onStep?.('resolving');
  try {
    const result = await resolveDirect(detection.normalizedUrl, fetchImpl);
    const byId = new Map(library.map((m) => [m.id, m]));
    const byIdentity = new Map(library.map((m) => [mediaIdentity(m), m]));
    const entries = result.items.map((item) => ({
      item,
      duplicateOf: byId.get(item.id) ?? byIdentity.get(mediaIdentity(item)),
    }));
    return { status: 'ready', detection: result.detection, kind: result.kind, entries, notes: result.notes };
  } catch (err) {
    if (err instanceof ProviderError) return { status: 'error', title: err.title, message: err.message };
    return { status: 'error', title: 'IMPORT FAILED', message: String(err) };
  }
}

export interface ImportEdits {
  /** Only applied to a single item; callers pass it only for single-item imports. */
  title?: string;
  artist?: string;
  categoryId?: string | null;
}

/** Applies preview edits to the selected items before they are saved. */
export function applyEdits(items: MediaItem[], edits: ImportEdits): MediaItem[] {
  const single = items.length === 1;
  return items.map((item) => ({
    ...item,
    title: single && edits.title?.trim() ? edits.title.trim() : item.title,
    artist: single ? edits.artist?.trim() || item.artist : item.artist,
    categoryId: edits.categoryId ?? item.categoryId ?? null,
  }));
}
