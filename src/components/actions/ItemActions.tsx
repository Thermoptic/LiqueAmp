import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { Copy, Ellipsis, ExternalLink, Heart, ListPlus, Plus, Share2 } from 'lucide-react';
import { getEngine } from '../../services/playback/engine';
import { queueStation } from '../../services/radio/actions';
import { stationToMediaItem } from '../../services/radio/stations';
import { shareOrCopy } from '../../services/share';
import { isItemFavorite, myFavorites, myStations, useFavorites } from '../../stores/favoritesStore';
import { usePlaylists } from '../../stores/playlistStore';
import { useUi } from '../../stores/uiStore';
import type { MediaItem, RadioStation } from '../../types/media';
import { AddToPlaylistDialog } from '../library/AddToPlaylistDialog';

/** What an action applies to: a radio station, or any other playable item. */
export type ActionTarget = { kind: 'station'; station: RadioStation } | { kind: 'media'; item: MediaItem };

/**
 * The actions that used to live in the Quick Actions panel, for one target.
 * One implementation for every place that offers them (media rows, Station
 * Info, Now Playing).
 *
 * Ownership: the queue is always the viewer's personal queue. The heart is
 * always the viewer's OWN favourites, also while a Friend Lique is shown
 * (D3). Playlists go through their store, which writes to the profile it
 * holds; a Friend Lique's playlists are read-only, so "Add to playlist" is
 * not offered while one is shown.
 */
export function useItemActions(target: ActionTarget) {
  const toast = useUi((s) => s.toast);
  const favorites = useFavorites(myFavorites);
  const ownStations = useFavorites(myStations);
  const shownStations = useFavorites((s) => s.stations);
  const toggleStation = useFavorites((s) => s.toggleOwnStation);
  const toggleItem = useFavorites((s) => s.toggleOwnItem);
  const canAddToPlaylist = usePlaylists((s) => s.scope.kind === 'own');

  const station = target.kind === 'station' ? target.station : null;
  const item = target.kind === 'media' ? target.item : null;
  const title = station?.name ?? item?.title ?? '';
  const shareUrl = station ? (station.homepage ?? station.sourceUrl ?? station.streamUrl) : (item?.sourceUrl ?? '');
  const streamUrl = station?.streamUrl ?? item?.streamUrl ?? item?.sourceUrl ?? '';
  const homepage = station?.homepage;
  const isFav = station ? favorites.some((f) => f.id === `station:${station.id}`) : item ? isItemFavorite(item, favorites, { ...shownStations, ...ownStations }) : false;
  const playlistItems = station ? [stationToMediaItem(station)] : item ? [item] : [];

  function queue() {
    if (station) queueStation(station);
    else if (item) getEngine().enqueue([item]);
    toast('Added to queue', 'success');
  }

  function toggleFavourite() {
    const done = (added: boolean) => toast(added ? 'Added to favourites' : 'Removed from favourites', 'success');
    if (station) void toggleStation(station).then(done);
    else if (item) void toggleItem(item).then(done);
  }

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
  }

  return { title, shareUrl, streamUrl, homepage, isFav, playlistItems, canAddToPlaylist, queue, toggleFavourite, share, copyStream };
}

/**
 * Station Info's action row: queue, playlist, share, copy stream. (The
 * station's website is already a link in the details, favourite a button on
 * every station row.)
 */
export function StationActions({ station }: { station: RadioStation }) {
  const a = useItemActions({ kind: 'station', station });
  const [addingToPlaylist, setAddingToPlaylist] = useState(false);
  return (
    <div className="station-info__actions" role="group" aria-label={`Actions for ${station.name}`}>
      <button type="button" className="btn" onClick={a.queue}>
        <Plus size={14} aria-hidden="true" /> Add to Queue
      </button>
      {a.canAddToPlaylist && (
        <button type="button" className="btn" onClick={() => setAddingToPlaylist(true)}>
          <ListPlus size={14} aria-hidden="true" /> Add to Playlist
        </button>
      )}
      <button type="button" className="btn" disabled={!a.shareUrl} onClick={() => void a.share()}>
        <Share2 size={14} aria-hidden="true" /> Share Station
      </button>
      <button type="button" className="btn" disabled={!a.streamUrl} onClick={() => void a.copyStream()}>
        <Copy size={14} aria-hidden="true" /> Copy Stream URL
      </button>
      <AddToPlaylistDialog open={addingToPlaylist} items={a.playlistItems} onClose={() => setAddingToPlaylist(false)} />
    </div>
  );
}

/**
 * A "⋯" menu with the item's actions, for places without room for buttons
 * (media rows, Now Playing). The menu is rendered in a portal with fixed
 * positioning so scrolling panels cannot clip it.
 */
export function ItemActionsMenu({ target, favourite = true }: { target: ActionTarget; favourite?: boolean }) {
  const a = useItemActions(target);
  const [open, setOpen] = useState(false);
  const [addingToPlaylist, setAddingToPlaylist] = useState(false);
  const [position, setPosition] = useState<CSSProperties>({});
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const close = (focusButton = false) => {
    setOpen(false);
    if (focusButton) buttonRef.current?.focus();
  };

  // place the menu under the button, or above it when there is no room below
  function place() {
    if (!buttonRef.current || !menuRef.current) return;
    const r = buttonRef.current.getBoundingClientRect();
    const h = menuRef.current.offsetHeight;
    const below = r.bottom + 4 + h <= window.innerHeight;
    setPosition({ position: 'fixed', right: Math.max(8, window.innerWidth - r.right), ...(below ? { top: r.bottom + 4 } : { bottom: window.innerHeight - r.top + 4 }) });
  }

  useLayoutEffect(() => {
    if (!open) return;
    place();
    menuRef.current?.querySelector<HTMLElement>('[role="menuitem"]:not(:disabled)')?.focus({ preventScroll: true });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!menuRef.current?.contains(t) && !buttonRef.current?.contains(t)) close();
    };
    // the menu follows its button when a panel or the page scrolls
    document.addEventListener('mousedown', onPointer);
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [open]);

  function onMenuKey(e: ReactKeyboardEvent<HTMLDivElement>) {
    const items = [...(menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]:not(:disabled)') ?? [])];
    const index = items.indexOf(document.activeElement as HTMLElement);
    if (e.key === 'Escape') {
      e.preventDefault();
      close(true);
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const step = e.key === 'ArrowDown' ? 1 : -1;
      items[(index + step + items.length) % items.length]?.focus();
    } else if (e.key === 'Tab') {
      close();
    }
    e.stopPropagation(); // keep list keyboard navigation out of the menu
  }

  const run = (action: () => void) => () => {
    close(true);
    action();
  };

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        className="btn btn--ghost btn--icon item-actions__button"
        aria-label={`More actions for ${a.title}`}
        title="More actions"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <Ellipsis size={14} />
      </button>
      {open &&
        createPortal(
          <div ref={menuRef} className="menu item-actions__menu" role="menu" aria-label={`Actions for ${a.title}`} style={position} onKeyDown={onMenuKey}>
            <button type="button" role="menuitem" className="menu__item" onClick={run(a.queue)}>
              <Plus size={14} aria-hidden="true" /> Add to queue
            </button>
            {a.canAddToPlaylist && (
              <button type="button" role="menuitem" className="menu__item" onClick={run(() => setAddingToPlaylist(true))}>
                <ListPlus size={14} aria-hidden="true" /> Add to playlist
              </button>
            )}
            {favourite && (
              <button type="button" role="menuitem" className="menu__item" onClick={run(a.toggleFavourite)}>
                <Heart size={14} aria-hidden="true" /> {a.isFav ? 'Remove from favourites' : 'Add to favourites'}
              </button>
            )}
            <button type="button" role="menuitem" className="menu__item" disabled={!a.shareUrl} onClick={run(() => void a.share())}>
              <Share2 size={14} aria-hidden="true" /> Share
            </button>
            <button type="button" role="menuitem" className="menu__item" disabled={!a.streamUrl} onClick={run(() => void a.copyStream())}>
              <Copy size={14} aria-hidden="true" /> Copy stream URL
            </button>
            {a.homepage && (
              <a role="menuitem" className="menu__item" href={a.homepage} target="_blank" rel="noreferrer noopener" onClick={() => close()}>
                <ExternalLink size={14} aria-hidden="true" /> Open website
              </a>
            )}
          </div>,
          document.body,
        )}
      <AddToPlaylistDialog open={addingToPlaylist} items={a.playlistItems} onClose={() => setAddingToPlaylist(false)} />
    </>
  );
}
