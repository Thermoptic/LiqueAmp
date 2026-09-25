import { accountUser, useAccount } from '../../stores/accountStore';
import { Status } from '../ui/controls';

/**
 * Settings › Account (D5, D14). Accounts are optional; the username is the
 * identity of the Lique. Signing in itself is not wired up until the
 * authentication method is decided — without a backend the buttons explain
 * that instead of pretending.
 */
export function AccountSection() {
  const state = useAccount((s) => s.state);
  const available = useAccount((s) => s.available);
  const signOut = useAccount((s) => s.signOut);
  const user = accountUser(state);

  return (
    <section className="settings-group" aria-labelledby="set-account">
      <h3 id="set-account" className="settings-group__title">
        Account
      </h3>
      {user ? (
        <>
          <Status tone="ok">Logged in</Status>
          <p className="account__username">@{user.username}</p>
          <div className="account__actions">
            <button type="button" className="btn" onClick={() => void signOut()}>
              Log out
            </button>
          </div>
          <p className="settings-group__note">Logging out keeps everything on this device exactly as it is.</p>
        </>
      ) : (
        <>
          <p className="account__status">Not logged in</p>
          <div className="account__actions">
            <button type="button" className="btn" disabled={!available}>
              Create account
            </button>
            <button type="button" className="btn" disabled={!available}>
              Log in
            </button>
          </div>
          <p className="settings-group__note">
            {available
              ? 'An account lets friends add your Lique. Your LiqueAmp keeps working without one.'
              : 'Accounts are not available in this version yet. LiqueAmp works fully without one.'}
          </p>
        </>
      )}
    </section>
  );
}
