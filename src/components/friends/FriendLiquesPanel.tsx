import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import { ArrowLeft, RefreshCw, UserMinus, UserPlus } from 'lucide-react';
import { accountUser, useAccount } from '../../stores/accountStore';
import { useFriends, type FriendPreview } from '../../stores/friendsStore';
import { useUi } from '../../stores/uiStore';
import type { Friend } from '../../services/friends/friends';
import { EmptyState, Status } from '../ui/controls';
import { Dialog } from '../ui/Dialog';
import { RowList } from '../ui/RowList';

/**
 * FRIEND LIQUES on Home (docs/LIQUEAMP_FRIEND_LIQUES_SPEC.md, D10–D12, D17):
 * the people I added, by @username, a read-only preview of their Lique, and
 * ACTIVATE LIQUE (checkpoint 8): their Lique replaces mine on screen,
 * read-only, until RETURN TO MY LIQUE. Adding is immediate and one-way.
 * Online/offline is not shown: there is no presence source yet (D11).
 * Everything here needs an account; without one LiqueAmp is unaffected.
 */
export function FriendLiquesPanel() {
  const accountState = useAccount((s) => s.state);
  const accountLoading = useAccount((s) => s.loading);
  const available = useAccount((s) => s.available);
  const problem = useAccount((s) => s.problem);
  const userId = accountUser(accountState)?.userId ?? null;
  const directory = useFriends((s) => s.directory);
  const load = useFriends((s) => s.load);
  const [adding, setAdding] = useState(false);
  const signedIn = Boolean(userId && directory);

  useEffect(() => {
    void load(userId);
  }, [userId, directory, load]);

  return (
    <section className="panel area-actions friend-liques" aria-labelledby="friend-liques-heading">
      <header className="panel__header">
        <h2 className="panel__title panel__title--small" id="friend-liques-heading">
          Friend Liques
        </h2>
        {signedIn && (
          <div className="panel__actions">
            <button type="button" className="btn btn--ghost btn--icon" aria-label="Add Friend" title="Add Friend" onClick={() => setAdding(true)}>
              <UserPlus size={14} />
            </button>
          </div>
        )}
      </header>
      <div className="panel__body panel__body--flush friend-liques__body">
        {accountLoading ? (
          <EmptyState title="LOADING…" />
        ) : signedIn ? (
          <>
            <ActiveLiqueBanner />
            <FriendList onAdd={() => setAdding(true)} />
          </>
        ) : accountState.status === 'needs-username' ? (
          <EmptyState title="CHOOSE A USERNAME">Your username is how friends find your Lique. Choose one to add friends.</EmptyState>
        ) : (
          <EmptyState title="ACCOUNT REQUIRED">
            {available && directory ? (
              <>
                Friend Liques need an account. <Link to="/settings">Log in under Settings › Account</Link> to add friends and preview their Liques. Everything
                else works without one.
              </>
            ) : (
              <>{problem ?? 'Friend Liques need an account, and accounts are not available in this version.'} LiqueAmp works fully without one.</>
            )}
          </EmptyState>
        )}
      </div>
      {signedIn && <AddFriendDialog open={adding} onClose={() => setAdding(false)} />}
    </section>
  );
}

function FriendList({ onAdd }: { onAdd(): void }) {
  const status = useFriends((s) => s.status);
  const friends = useFriends((s) => s.friends);
  const error = useFriends((s) => s.error);
  const userId = useFriends((s) => s.userId);
  const selectedId = useFriends((s) => s.selectedId);
  const select = useFriends((s) => s.select);
  const load = useFriends((s) => s.load);
  const activeId = useFriends((s) => s.active?.userId ?? null);
  const [removing, setRemoving] = useState<Friend | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const returnTo = useRef<string | null>(null);

  // back from a preview: focus returns to that friend's row
  useEffect(() => {
    if (selectedId || !returnTo.current) return;
    listRef.current?.querySelector<HTMLElement>(`[data-friend-id="${CSS.escape(returnTo.current)}"]`)?.focus();
    returnTo.current = null;
  }, [selectedId]);

  if (status === 'error' && friends.length === 0) {
    return (
      <div className="friend-liques__message">
        <p className="form-error" role="alert">
          {error}
        </p>
        <button type="button" className="btn" onClick={() => void load(userId)}>
          <RefreshCw size={14} aria-hidden="true" /> Try again
        </button>
      </div>
    );
  }
  if (friends.length === 0) {
    if (status !== 'ready') return <EmptyState title="LOADING…" />;
    return (
      <div className="friend-liques__message">
        <EmptyState title="NO FRIEND LIQUES YET">Add friends by their username to explore their LiqueAmp environments.</EmptyState>
        <button type="button" className="btn" onClick={onAdd}>
          <UserPlus size={14} aria-hidden="true" /> Add Friend
        </button>
      </div>
    );
  }

  const selected = friends.find((f) => f.userId === selectedId) ?? null;
  if (selected) {
    // the panel is small: the preview takes its place, Back returns to the list
    return (
      <FriendPreviewCard
        friend={selected}
        onBack={() => {
          returnTo.current = selected.userId;
          void select(null);
        }}
      />
    );
  }
  return (
    <div ref={listRef} className="friend-liques__list">
      <RowList aria-label="Friend Liques">
        {friends.map((friend) => (
          <li key={friend.userId} className="row friend-row" data-active={friend.userId === activeId || undefined}>
            <button type="button" className="friend-row__main" data-friend-id={friend.userId} title={`Preview @${friend.username}’s Lique`} onClick={() => void select(friend.userId)}>
              <span className="truncate">@{friend.username}</span>
              {friend.userId === activeId && <span className="friend-row__active">ACTIVE</span>}
            </button>
            <button type="button" className="btn btn--ghost btn--icon friend-row__remove" aria-label={`Remove @${friend.username}`} onClick={() => setRemoving(friend)}>
              <UserMinus size={14} />
            </button>
          </li>
        ))}
      </RowList>
      {status === 'error' && (
        <p className="form-error friend-liques__inline-error" role="alert">
          {error}
        </p>
      )}
      <RemoveFriendDialog friend={removing} onClose={() => setRemoving(null)} />
    </div>
  );
}

/**
 * The Friend Lique being shown instead of mine: always visible at the top of
 * the panel while one is active, with the way back.
 */
function ActiveLiqueBanner() {
  const active = useFriends((s) => s.active);
  const returning = useFriends((s) => s.activation.status === 'working' && s.activation.action === 'return');
  const returnError = useFriends((s) => (s.activation.status === 'error' && s.activation.friendId === s.active?.userId ? s.activation.message : null));
  const returnToMyLique = useFriends((s) => s.returnToMyLique);
  if (!active) return null;
  return (
    <div className="friend-lique-active" role="status">
      <span className="friend-lique-active__label">FRIEND LIQUE ACTIVE</span>
      <span className="friend-lique-active__name">@{active.username}</span>
      <span className="muted friend-lique-active__note">{active.source === 'cache' ? 'Read-only · saved copy (offline)' : 'Read-only'}</span>
      <button type="button" className="btn btn--primary" disabled={returning} onClick={() => void returnToMyLique()}>
        {returning ? 'Returning…' : 'Return to My Lique'}
      </button>
      {returnError && (
        <p className="form-error friend-lique-active__error" role="alert">
          {returnError}
        </p>
      )}
    </div>
  );
}

/** Read-only preview of a friend's Lique, and the way to activate it. */
function FriendPreviewCard({ friend, onBack }: { friend: Friend; onBack(): void }) {
  const preview = useFriends((s) => s.preview);
  const select = useFriends((s) => s.select);
  const isActive = useFriends((s) => s.active?.userId === friend.userId);
  const activation = useFriends((s) => s.activation);
  const activate = useFriends((s) => s.activate);
  const working = activation.status === 'working';
  const activatingThis = working && activation.friendId === friend.userId && activation.action === 'activate';
  const activationError = activation.status === 'error' && activation.friendId === friend.userId ? activation.message : null;
  const headingId = useId();
  const noteId = useId();
  const heading = useRef<HTMLHeadingElement>(null);
  const state: FriendPreview = preview.status !== 'idle' && preview.friendId === friend.userId ? preview : { status: 'loading', friendId: friend.userId };

  // keyboard and screen-reader users land on what just opened
  useEffect(() => heading.current?.focus(), [friend.userId]);

  return (
    <section className="friend-preview" aria-labelledby={headingId} aria-busy={state.status === 'loading'}>
      <header className="friend-preview__head">
        <button type="button" className="btn btn--ghost btn--icon" aria-label="Back to Friend Liques" title="Back to Friend Liques" onClick={onBack}>
          <ArrowLeft size={14} />
        </button>
        <h3 className="friend-preview__name" id={headingId} ref={heading} tabIndex={-1}>
          @{friend.username}’s Lique
        </h3>
      </header>
      <Status tone="idle">READ ONLY</Status>
      {state.status === 'loading' && <p className="muted friend-preview__message">Loading their Lique…</p>}
      {state.status === 'none' && <p className="muted friend-preview__message">@{friend.username} has no Lique in the cloud yet.</p>}
      {state.status === 'error' && (
        <div className="friend-preview__message">
          <p className="form-error" role="alert">
            Preview unavailable: {state.message}
          </p>
          <button type="button" className="btn" onClick={() => void select(friend.userId)}>
            <RefreshCw size={14} aria-hidden="true" /> Try again
          </button>
        </div>
      )}
      {state.status === 'ready' && (
        <>
          <dl className="kv-list friend-preview__facts">
            <Fact label="Theme">{state.summary.theme.name}</Fact>
            <Fact label="Visualizer">{state.summary.visualizer.enabled ? state.summary.visualizer.name : `${state.summary.visualizer.name} (off)`}</Fact>
          </dl>
          <dl className="friend-preview__counts">
            <Count label="Playlists" value={state.summary.counts.playlists} />
            <Count label="Categories" value={state.summary.counts.categories} />
            <Count label="Streams" value={state.summary.counts.streams} />
            <Count label="Stations" value={state.summary.counts.stations} />
          </dl>
        </>
      )}
      <div className="friend-preview__actions">
        {isActive ? (
          <Status tone="ok">ACTIVE</Status>
        ) : (
          <button
            type="button"
            className="btn btn--primary"
            disabled={working || state.status === 'none'}
            aria-describedby={noteId}
            onClick={() => void activate(friend.userId)}
          >
            {activatingThis ? 'Activating…' : 'Activate Lique'}
          </button>
        )}
      </div>
      {activationError && (
        <p className="form-error" role="alert">
          {activationError}
        </p>
      )}
      <p className="settings-group__note" id={noteId}>
        Shows their theme, playlists and library, read-only. What you listen to, your favourites and your volume stay yours.
      </p>
    </section>
  );
}

function Count({ label, value }: { label: string; value: number }) {
  return (
    <div className="friend-preview__count">
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="kv-list__row friend-preview__row">
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

function AddFriendDialog({ open, onClose }: { open: boolean; onClose(): void }) {
  const add = useFriends((s) => s.add);
  const toast = useUi((s) => s.toast);
  const [username, setUsername] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const inputId = useId();
  const hintId = useId();

  useEffect(() => {
    if (open) {
      setUsername('');
      setError(null);
      setBusy(false);
    }
  }, [open]);

  return (
    <Dialog
      open={open}
      title="Add Friend"
      submitLabel={busy ? 'Adding…' : 'Add Friend'}
      submitDisabled={busy || !username.trim()}
      onClose={onClose}
      onSubmit={() => {
        setBusy(true);
        setError(null);
        void add(username)
          .then((friend) => {
            toast(`Added @${friend.username} to your Friend Liques.`, 'success');
            onClose();
          })
          .catch((err: unknown) => {
            setError(err instanceof Error ? err.message : String(err));
            setBusy(false);
          });
      }}
    >
      <label htmlFor={inputId} className="field__label">
        Username
      </label>
      <input
        id={inputId}
        className="input"
        value={username}
        maxLength={40}
        autoComplete="off"
        autoCapitalize="none"
        spellCheck={false}
        placeholder="@username"
        aria-describedby={hintId}
        aria-invalid={error ? true : undefined}
        data-autofocus
        onChange={(e) => setUsername(e.currentTarget.value)}
      />
      <p className="settings-group__note" id={hintId}>
        Their exact username. You can then preview their Lique; they are not notified and get no access to yours.
      </p>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
    </Dialog>
  );
}

function RemoveFriendDialog({ friend, onClose }: { friend: Friend | null; onClose(): void }) {
  const remove = useFriends((s) => s.remove);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setError(null);
    setBusy(false);
  }, [friend]);

  return (
    <Dialog
      open={Boolean(friend)}
      title="Remove Friend"
      submitLabel={busy ? 'Removing…' : 'Remove'}
      submitDisabled={busy}
      danger
      onClose={onClose}
      onSubmit={() => {
        if (!friend) return;
        setBusy(true);
        void remove(friend.userId)
          .then(onClose)
          .catch((err: unknown) => {
            setError(err instanceof Error ? err.message : String(err));
            setBusy(false);
          });
      }}
    >
      <p>
        Remove <strong>@{friend?.username}</strong> from your Friend Liques? You will no longer see their Lique. They are not notified, and you can add them again later.
      </p>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
    </Dialog>
  );
}
