import type { HTMLAttributes, ReactNode } from 'react';
import { usePlayback } from '../../stores/playbackStore';
import { useUi } from '../../stores/uiStore';
import type { MediaItem } from '../../types/media';
import { PROVIDER_LABEL } from '../player/NowPlayingPanel';

interface MediaRowProps {
  item: MediaItem;
  index: number;
  meta?: ReactNode;
  /** Buttons shown at the end of the row. */
  actions?: ReactNode;
  onActivate(): void;
  leading?: ReactNode;
  rowProps?: HTMLAttributes<HTMLLIElement> & Record<string, unknown>;
}

/**
 * One media item in a library list. Clicking plays it; it also becomes the
 * selection for Quick Actions. The currently playing item is highlighted
 * everywhere (DESIGN §82).
 */
export function MediaRow({ item, index, meta, actions, onActivate, leading, rowProps }: MediaRowProps) {
  const isCurrent = usePlayback((s) => s.currentItem?.id === item.id);
  const select = useUi((s) => s.select);
  const defaultMeta = [item.artist, PROVIDER_LABEL[item.provider] ?? item.provider].filter(Boolean).join(' · ');
  return (
    <li className="media-row" aria-current={isCurrent ? 'true' : undefined} {...rowProps}>
      {leading}
      <span className="row__index">{String(index + 1).padStart(2, '0')}</span>
      <button
        type="button"
        className="media-row__main"
        onClick={() => {
          select({ kind: 'media', item });
          onActivate();
        }}
        aria-label={`Play ${item.title}${isCurrent ? ' (now playing)' : ''}`}
      >
        <span className="media-row__title truncate">{item.title}</span>
        <span className="media-row__meta truncate">{meta ?? defaultMeta}</span>
      </button>
      {actions && <span className="media-row__actions">{actions}</span>}
    </li>
  );
}
