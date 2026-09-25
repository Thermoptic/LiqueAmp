import { useState } from 'react';
import { ArrowLeft, Heart, Pencil, Play, Plus, Shuffle, Trash2, X } from 'lucide-react';
import { getEngine } from '../../services/playback/engine';
import { useFavorites } from '../../stores/favoritesStore';
import { usePlaylists } from '../../stores/playlistStore';
import { useLibrary } from '../../stores/libraryStore';
import { useUi } from '../../stores/uiStore';
import type { MediaItem, Playlist } from '../../types/media';
import { Dialog } from '../ui/Dialog';
import { NameDialog } from '../ui/NameDialog';
import { EmptyState } from '../ui/controls';
import { DragHandle, ReorderButtons, useDragReorder } from '../ui/reorder';
import { MediaRow } from './MediaRow';
import { RowList } from '../ui/RowList';

export function shuffled<T>(list: T[], random: () => number = Math.random): T[] {
  const copy = [...list];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [copy[i], copy[j]] = [copy[j]!, copy[i]!];
  }
  return copy;
}

export function PlaylistsView() {
  const openId = useUi((s) => s.openPlaylistId);
  const playlist = usePlaylists((s) => s.playlists.find((p) => p.id === openId));
  return playlist ? <PlaylistDetail playlist={playlist} /> : <PlaylistList />;
}

function PlaylistList() {
  const playlists = usePlaylists((s) => s.playlists);
  const create = usePlaylists((s) => s.create);
  const resolve = usePlaylists((s) => s.resolve);
  const readOnly = usePlaylists((s) => s.scope.kind !== 'own'); // a Friend Lique's playlists
  const openPlaylist = useUi((s) => s.openPlaylist);
  const toast = useUi((s) => s.toast);
  const [creating, setCreating] = useState(false);

  function play(p: Playlist) {
    const { items } = resolve(p.id);
    if (items.length === 0) return toast('This playlist is empty', 'info');
    void getEngine().playList(items);
  }

  return (
    <>
      <div className="library-toolbar">
        <span className="muted">{playlists.length === 1 ? '1 playlist' : `${playlists.length} playlists`}</span>
        {!readOnly && (
          <button type="button" className="btn" onClick={() => setCreating(true)}>
            <Plus size={14} aria-hidden="true" /> New
          </button>
        )}
      </div>
      {playlists.length === 0 ? (
        <EmptyState title="NO PLAYLISTS">Create your first playlist to begin.</EmptyState>
      ) : (
        <RowList aria-label="Playlists">
          {playlists.map((p, i) => (
            <li key={p.id} className="media-row">
              <span className="row__index">{String(i + 1).padStart(2, '0')}</span>
              <button type="button" className="media-row__main" onClick={() => openPlaylist(p.id)} aria-label={`Open playlist ${p.name}`}>
                <span className="media-row__title truncate">{p.name}</span>
              </button>
              <span className="media-row__actions">
                <span className="row__index" aria-label={`${p.items.length} items`}>
                  {p.items.length}
                </span>
                <button type="button" className="btn btn--ghost btn--icon" aria-label={`Play ${p.name}`} onClick={() => play(p)}>
                  <Play size={14} />
                </button>
              </span>
            </li>
          ))}
        </RowList>
      )}
      <NameDialog
        open={creating}
        title="New playlist"
        submitLabel="Create"
        onClose={() => setCreating(false)}
        onSubmit={async (name) => {
          const p = await create(name);
          toast('Playlist created', 'success');
          openPlaylist(p.id);
        }}
      />
    </>
  );
}

function PlaylistDetail({ playlist }: { playlist: Playlist }) {
  const { rename, remove, removeItem, moveItem } = usePlaylists.getState();
  const media = useLibrary((s) => s.media);
  const openPlaylist = useUi((s) => s.openPlaylist);
  const toast = useUi((s) => s.toast);
  const isFav = useFavorites((s) => s.favorites.some((f) => f.id === `playlist:${playlist.id}`));
  const readOnly = usePlaylists((s) => s.scope.kind !== 'own');
  const toggleFav = useFavorites((s) => s.togglePlaylist);
  const [renaming, setRenaming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const move = (from: number, to: number) => void moveItem(playlist.id, from, to);
  const { rowProps } = useDragReorder(move);

  // Each row keeps its position in the playlist, so edits target the right entry
  // even when some referenced media no longer exists.
  const rows = playlist.items
    .map((ref, position) => ({ item: media.find((m) => m.id === ref.mediaId), position }))
    .filter((r): r is { item: MediaItem; position: number } => r.item !== undefined);
  const items = rows.map((r) => r.item);
  const missing = playlist.items.length - rows.length;

  return (
    <>
      <div className="library-toolbar">
        <button type="button" className="btn btn--ghost" onClick={() => openPlaylist(null)}>
          <ArrowLeft size={14} aria-hidden="true" /> All
        </button>
        <h3 className="library-toolbar__title truncate">{playlist.name}</h3>
        {!readOnly && (
          <>
            <button type="button" className="btn btn--ghost btn--icon" aria-label="Rename playlist" onClick={() => setRenaming(true)}>
              <Pencil size={14} />
            </button>
            <button
              type="button"
              className="btn btn--ghost btn--icon station-row__fav"
              aria-label={isFav ? 'Remove playlist from favourites' : 'Add playlist to favourites'}
              aria-pressed={isFav}
              onClick={() => void toggleFav(playlist.id)}
            >
              <Heart size={14} />
            </button>
            <button type="button" className="btn btn--ghost btn--icon btn--danger" aria-label="Delete playlist" onClick={() => setDeleting(true)}>
              <Trash2 size={14} />
            </button>
          </>
        )}
      </div>
      <div className="library-toolbar">
        <button type="button" className="btn btn--primary" disabled={items.length === 0} onClick={() => void getEngine().playList(items)}>
          <Play size={14} aria-hidden="true" /> Play
        </button>
        <button type="button" className="btn" disabled={items.length < 2} onClick={() => void getEngine().playList(shuffled(items))}>
          <Shuffle size={14} aria-hidden="true" /> Shuffle
        </button>
        <span className="muted">{items.length === 1 ? '1 item' : `${items.length} items`}</span>
      </div>
      {missing > 0 && <p className="notice">{missing} item(s) in this playlist no longer exist in the library and are skipped.</p>}
      {rows.length === 0 ? (
        <EmptyState title="PLAYLIST EMPTY">Use Add to playlist in a track’s ⋯ menu, or in Station Info, to add tracks or stations.</EmptyState>
      ) : (
        <RowList aria-label={`Items in ${playlist.name}`}>
          {rows.map(({ item, position }, i) => (
            <MediaRow
              key={`${item.id}-${position}`}
              item={item}
              index={i}
              leading={readOnly ? undefined : <DragHandle />}
              rowProps={readOnly ? undefined : rowProps(position)}
              onActivate={() => void getEngine().playList(items, i)}
              actions={
                readOnly ? undefined : (
                <>
                  <ReorderButtons index={position} count={playlist.items.length} label={item.title} onMove={move} />
                  <button
                    type="button"
                    className="btn btn--ghost btn--icon"
                    aria-label={`Remove ${item.title} from playlist`}
                    onClick={() => void removeItem(playlist.id, position)}
                  >
                    <X size={14} />
                  </button>
                </>
                )
              }
            />
          ))}
        </RowList>
      )}
      <NameDialog
        open={renaming}
        title="Rename playlist"
        submitLabel="Rename"
        initial={playlist.name}
        onClose={() => setRenaming(false)}
        onSubmit={(name) => rename(playlist.id, name)}
      />
      <Dialog
        open={deleting}
        title="Delete playlist"
        submitLabel="Delete"
        danger
        onClose={() => setDeleting(false)}
        onSubmit={() => {
          setDeleting(false);
          openPlaylist(null);
          void remove(playlist.id).then(() => toast('Playlist deleted', 'success'));
        }}
      >
        <p>
          Delete <strong>{playlist.name}</strong>? The stations and tracks stay in your library.
        </p>
      </Dialog>
    </>
  );
}
