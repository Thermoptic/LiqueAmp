import { useState } from 'react';
import { AUTH_METHOD_LABEL, AUTH_METHODS } from '../../services/account/account';
import type { SharingDecision } from '../../services/profile/sharing';
import { accountAuthMethod, accountUser, useAccount } from '../../stores/accountStore';
import { Status } from '../ui/controls';
import { Dialog } from '../ui/Dialog';

/**
 * Settings › Account (D5, D14, D15). Accounts are optional; the username is
 * the identity of the Lique. Logging out never changes anything on this
 * device; deleting the account keeps the local Lique too.
 */
export function AccountSection() {
  const state = useAccount((s) => s.state);
  const available = useAccount((s) => s.available);
  const problem = useAccount((s) => s.problem);
  const loading = useAccount((s) => s.loading);
  const error = useAccount((s) => s.error);
  const signIn = useAccount((s) => s.signIn);
  const signOut = useAccount((s) => s.signOut);
  const user = accountUser(state);
  const method = accountAuthMethod(state);
  const [deleting, setDeleting] = useState(false);

  return (
    <section className="settings-group" aria-labelledby="set-account">
      <h3 id="set-account" className="settings-group__title">
        Account
      </h3>
      {loading ? (
        <p className="account__status">Checking account…</p>
      ) : user ? (
        <>
          <p className="account__username">@{user.username}</p>
          <Status tone="ok">{method ? `Logged in with ${AUTH_METHOD_LABEL[method]}` : 'Logged in'}</Status>
          <SyncStatus />
          <div className="account__actions">
            <button type="button" className="btn" onClick={() => void signOut()}>
              Log out
            </button>
            <button type="button" className="btn btn--danger" onClick={() => setDeleting(true)}>
              Delete account
            </button>
          </div>
          <p className="settings-group__note">Logging out keeps everything on this device exactly as it is.</p>
          <DeleteAccountDialog open={deleting} username={user.username} onClose={() => setDeleting(false)} />
        </>
      ) : (
        <>
          <p className="account__status">Not logged in</p>
          <div className="account__actions">
            {AUTH_METHODS.map((m) => (
              <button key={m} type="button" className="btn" disabled={!available} onClick={() => void signIn(m)}>
                Continue with {AUTH_METHOD_LABEL[m]}
              </button>
            ))}
          </div>
          <p className="settings-group__note">
            {available
              ? 'An account keeps your Lique in the cloud and lets friends add it. LiqueAmp keeps working without one.'
              : (problem ?? 'Accounts are not available in this version yet. LiqueAmp works fully without one.')}
          </p>
        </>
      )}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}

/** Sync state and the explicit choices the user may have to make (D9, D13). */
function SyncStatus() {
  const sync = useAccount((s) => s.sync);
  const resolve = useAccount((s) => s.resolve);
  const reviewSharing = useAccount((s) => s.reviewSharing);
  switch (sync.state) {
    case 'syncing':
      return <p className="account__sync muted">Syncing your Lique…</p>;
    case 'synced':
      return <p className="account__sync muted">Your Lique is saved to your account.</p>;
    case 'error':
      return (
        <p className="account__sync form-error" role="alert">
          {sync.message}
        </p>
      );
    case 'blocked-other-account':
      return (
        <p className="account__sync notice" role="alert">
          The LiqueAmp on this device belongs to another account. It is not synced with this account, and nothing was changed.
        </p>
      );
    case 'conflict':
    case 'resolve-local':
      return (
        <div className="account__sync notice" role="alert">
          <p>
            {sync.state === 'conflict'
              ? 'Your Lique changed on this device and in your account since the last sync.'
              : 'This device has its own LiqueAmp, and your account already has a Lique.'}{' '}
            Choose which one to keep. Nothing has been overwritten yet.
          </p>
          <div className="account__actions">
            <button type="button" className="btn" onClick={() => void resolve('keep-local')}>
              Keep local profile
            </button>
            <button type="button" className="btn" onClick={() => void resolve('use-cloud')}>
              Use cloud profile
            </button>
          </div>
          <p className="settings-group__note">Using the cloud profile replaces this device’s playlists, library and theme. Queue, history and device settings stay.</p>
        </div>
      );
    case 'needs-review':
      return <SharingReview findings={sync.findings} onDone={(d) => void reviewSharing(d)} />;
    default:
      return null;
  }
}

function SharingReview({ findings, onDone }: { findings: Array<{ key: string; label: string; urls: Array<{ url: string }> }>; onDone(decisions: Record<string, SharingDecision> | null): void }) {
  const [decisions, setDecisions] = useState<Record<string, SharingDecision>>(() => Object.fromEntries(findings.map((f) => [f.key, 'exclude' as const])));
  return (
    <div className="account__sync notice" role="alert">
      <p>
        {findings.length === 1 ? 'One stream address looks' : `${findings.length} stream addresses look`} like it contains a password or key. Choose what goes to your
        account. The copy on this device is not changed.
      </p>
      <ul className="account__findings">
        {findings.map((f) => (
          <li key={f.key}>
            <span className="truncate" title={f.urls.map((u) => u.url).join('\n')}>
              {f.label}
            </span>
            <select
              className="select"
              aria-label={`What to do with ${f.label}`}
              value={decisions[f.key]}
              onChange={(e) => setDecisions({ ...decisions, [f.key]: e.currentTarget.value as SharingDecision })}
            >
              <option value="exclude">Leave out of the cloud</option>
              <option value="share">Save it anyway</option>
            </select>
          </li>
        ))}
      </ul>
      <div className="account__actions">
        <button type="button" className="btn btn--primary" onClick={() => onDone(decisions)}>
          Continue sync
        </button>
        <button type="button" className="btn" onClick={() => onDone(null)}>
          Cancel sync
        </button>
      </div>
    </div>
  );
}

function DeleteAccountDialog({ open, username, onClose }: { open: boolean; username: string; onClose(): void }) {
  const deleteAccount = useAccount((s) => s.deleteAccount);
  const [error, setError] = useState<string | null>(null);
  return (
    <Dialog
      open={open}
      title="Delete account"
      submitLabel="Delete account"
      danger
      onClose={onClose}
      onSubmit={() => {
        setError(null);
        deleteAccount({ confirmed: true }).then(onClose, (err: unknown) => setError(err instanceof Error ? err.message : String(err)));
      }}
    >
      <p>
        Delete <strong>@{username}</strong> permanently? Your account and the Lique saved in it are removed, and the username becomes available to others.
      </p>
      <p className="muted">LiqueAmp and everything on this device stay exactly as they are.</p>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
    </Dialog>
  );
}
