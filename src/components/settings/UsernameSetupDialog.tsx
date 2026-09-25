import { useId, useState } from 'react';
import { AccountError } from '../../services/account/account';
import { checkUsername } from '../../services/account/username';
import { useAccount } from '../../stores/accountStore';
import { Dialog } from '../ui/Dialog';

/**
 * First login (D6, D7): the account needs a username before anything is
 * synced. Typing is checked immediately; the reservation itself is atomic in
 * the database, so "taken" can still come back from the server.
 * Cancel logs out again — nothing on this device changes either way.
 */
export function UsernameSetupDialog() {
  const needsUsername = useAccount((s) => s.state.status === 'needs-username');
  const claimUsername = useAccount((s) => s.claimUsername);
  const signOut = useAccount((s) => s.signOut);
  const [value, setValue] = useState('');
  const [touched, setTouched] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const id = useId();
  const check = checkUsername(value);
  const shownError = serverError ?? (touched && !check.ok ? check.message : null);

  async function submit() {
    setTouched(true);
    if (!check.ok || busy) return;
    setBusy(true);
    setServerError(null);
    try {
      await claimUsername(check.username);
    } catch (err) {
      setServerError(err instanceof AccountError ? err.message : 'That didn’t work. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open={needsUsername}
      title="Welcome to LiqueAmp"
      submitLabel={busy ? 'Saving…' : 'Continue'}
      submitDisabled={busy || (touched && !check.ok)}
      closeLabel="Log out"
      onClose={() => void signOut()}
      onSubmit={() => void submit()}
    >
      <label htmlFor={id} className="field__label">
        Choose your username
      </label>
      <div className="username-field">
        <span className="username-field__at" aria-hidden="true">
          @
        </span>
        <input
          id={id}
          className="input"
          value={value}
          maxLength={40}
          autoComplete="username"
          spellCheck={false}
          autoCapitalize="none"
          data-autofocus
          aria-invalid={Boolean(shownError)}
          aria-describedby={`${id}-help`}
          onChange={(e) => {
            setValue(e.currentTarget.value);
            setTouched(true);
            setServerError(null);
          }}
        />
      </div>
      <p id={`${id}-help`} className={shownError ? 'form-error' : 'muted'} role={shownError ? 'alert' : undefined}>
        {shownError ?? 'Your username identifies your Lique. Letters and digits, 3–20 characters.'}
      </p>
      <p className="muted">Your current LiqueAmp becomes your account’s Lique — you don’t start over.</p>
    </Dialog>
  );
}
