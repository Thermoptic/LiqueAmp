import type { HTMLAttributes, ReactNode } from 'react';
import { usePlayback } from '../../stores/playbackStore';
import type { MediaItem } from '../../types/media';
import { ItemActionsMenu } from '../actions/ItemActions';
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
 * One media item in a library list. Clicking plays it; the "⋯" menu has its
 * other actions (queue, playlist, favourite, share, copy stream URL). The
 * currently playing item is highlighted everywhere (DESIGN §82).
 */
export function MediaRow({ item, index, meta, actions, onActivate, leading, rowProps }: MediaRowProps) {
  const isCurrent = usePlayback((s) => s.currentItem?.id === item.id);
  const defaultMeta = [item.artist, PROVIDER_LABEL[item.provider] ?? item.provider].filter(Boolean).join(' · ');
  return (
    <li className="media-row" aria-current={isCurrent ? 'true' : undefined} data-disabled={item.enabled === false || undefined} {...rowProps}>
      {leading}
      <span className="row__index">{String(index + 1).padStart(2, '0')}</span>
      <button
        type="button"
        className="media-row__main"
        onClick={onActivate}
        aria-label={`Play ${item.title}${isCurrent ? ' (now playing)' : ''}${item.enabled === false ? ' (disabled in /control)' : ''}`}
      >
        <span className="media-row__title truncate">
          {item.title}
          {item.enabled === false && <span className="station-row__flag station-row__flag--off">DISABLED</span>}
        </span>
        <span className="media-row__meta truncate">{meta ?? defaultMeta}</span>
      </button>
      <span className="media-row__actions">
        {actions}
        <ItemActionsMenu target={{ kind: 'media', item }} />
      </span>
    </li>
  );
}
