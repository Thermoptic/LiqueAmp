import { useEffect, useRef, useState } from 'react';
import { Copy, Ellipsis, ExternalLink, Heart, Play, Plus, Share2 } from 'lucide-react';
import { getEngine } from '../../services/playback/engine';
import { playStation, queueStation } from '../../services/radio/actions';
import { shareOrCopy } from '../../services/share';
import { useFavorites } from '../../stores/favoritesStore';
import { useUi } from '../../stores/uiStore';

/**
 * Commands for the current selection (a station or a media item). Only
 * actions that can actually work for that selection are enabled.
 */
export function QuickActionsPanel() {
  const selection = useUi((s) => s.selection);
  const toast = useUi((s) => s.toast);
  const favorites = useFavorites((s) => s.favorites);
  const toggleStation = useFavorites((s) => s.toggleStation);
  const [moreOpen, setMoreOpen] = useState(false);
  const moreRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!moreOpen) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === 'Escape' : !moreRef.current?.contains(e.target as Node)) setMoreOpen(false);
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', close);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', close);
    };
  }, [moreOpen]);

  const station = selection?.kind === 'station' ? selection.station : null;
  const item = selection?.kind === 'media' ? selection.item : null;
  const title = station?.name ?? item?.title ?? '';
  const shareUrl = station ? (station.homepage ?? station.sourceUrl ?? station.streamUrl) : (item?.sourceUrl ?? '');
  const streamUrl = station?.streamUrl ?? item?.streamUrl ?? item?.sourceUrl ?? '';
  const homepage = station?.homepage;
  const isFav = station ? favorites.some((f) => f.id === `station:${station.id}`) : false;

  async function share() {
    const result = await shareOrCopy({ title, url: shareUrl });
    if (result === 'copied') toast('Link copied', 'success');
    else if (result === 'unavailable') toast('Sharing is not available here', 'error');
  }

  async function copyStream() {
    try {
      await navigator.clipboard.writeText(streamUrl);
      toast('Stream URL copied', 'success');
    } catch {
      toast('Could not copy to the clipboard', 'error');
    }
    setMoreOpen(false);
  }

  return (
    <section className="panel area-actions" aria-labelledby="qa-heading">
      <header className="panel__header">
        <h2 className="panel__title panel__title--small" id="qa-heading">
          Quick Actions
        </h2>
      </header>
      <div className="panel__body quick-actions">
        <button
          type="button"
          className="btn btn--block btn--primary"
          disabled={!selection}
          onClick={() => void (station ? playStation(station) : item && getEngine().playNow(item))}
        >
          <Play size={15} aria-hidden="true" /> Play Now
        </button>
        <button
          type="button"
          className="btn btn--block"
          disabled={!selection}
          onClick={() => {
            if (station) queueStation(station);
            else if (item) getEngine().enqueue([item]);
            toast('Added to queue', 'success');
          }}
        >
          <Plus size={15} aria-hidden="true" /> Add to Queue
        </button>
        {!item && (
          <button
            type="button"
            className="btn btn--block"
            disabled={!station}
            aria-pressed={isFav}
            onClick={() => station && void toggleStation(station).then((added) => toast(added ? 'Added to favourites' : 'Removed from favourites', 'success'))}
          >
            <Heart size={15} aria-hidden="true" /> {isFav ? 'In Favourites' : 'Add to Favourites'}
          </button>
        )}
        <button type="button" className="btn btn--block" disabled={!shareUrl} onClick={() => void share()}>
          <Share2 size={15} aria-hidden="true" /> {station ? 'Share Station' : 'Share'}
        </button>
        <div className="quick-actions__more" ref={moreRef}>
          <button
            type="button"
            className="btn btn--block"
            disabled={!selection}
            aria-expanded={moreOpen}
            aria-haspopup="menu"
            onClick={() => setMoreOpen((o) => !o)}
          >
            <Ellipsis size={15} aria-hidden="true" /> More Actions
          </button>
          {moreOpen && (
            <div className="menu" role="menu">
              {homepage && (
                <a role="menuitem" className="menu__item" href={homepage} target="_blank" rel="noreferrer noopener" onClick={() => setMoreOpen(false)}>
                  <ExternalLink size={14} aria-hidden="true" /> Open website
                </a>
              )}
              <button type="button" role="menuitem" className="menu__item" disabled={!streamUrl} onClick={() => void copyStream()}>
                <Copy size={14} aria-hidden="true" /> Copy stream URL
              </button>
            </div>
          )}
        </div>
        {!selection && <p className="quick-actions__hint muted">Select a station or track first.</p>}
      </div>
    </section>
  );
}
