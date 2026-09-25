import { useEffect, useId, useState } from 'react';
import { AccountError, checkEmail } from '../../services/account/account';
import { useAccount } from '../../stores/accountStore';
import { Dialog } from '../ui/Dialog';

export type EmailAuthMode = 'sign-in' | 'sign-up' | 'reset';

type Step = EmailAuthMode | 'confirm-email' | 'reset-sent';

const TITLES: Record<Step, string> = {
  'sign-in': 'Log in with Email',
  'sign-up': 'Create account with Email',
  reset: 'Reset password',
  'confirm-email': 'Check your email',
  'reset-sent': 'Check your email',
};

/**
 * Email + password for Settings › Account (D5). Passwords go straight to
 * Supabase Auth: they live only in this form's state while it is open and
 * are never stored or logged. Password rules are Supabase's; its messages are
 * shown. A new account continues into the same username onboarding as
 * Google/GitHub; with email confirmation on (the current project setting) it
 * has no session until the link in the email is opened.
 */
export function EmailAuthDialog({ mode, onClose }: { mode: EmailAuthMode | null; onClose(): void }) {
  const signInWithEmail = useAccount((s) => s.signInWithEmail);
  const signUpWithEmail = useAccount((s) => s.signUpWithEmail);
  const requestPasswordReset = useAccount((s) => s.requestPasswordReset);
  const [step, setStep] = useState<Step>('sign-in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const emailId = useId();
  const passwordId = useId();
  const confirmId = useId();

  // a fresh form each time it opens; nothing (least of all a password) is kept after closing
  useEffect(() => {
    if (!mode) return;
    setStep(mode);
    setEmail('');
    setPassword('');
    setConfirm('');
    setError(null);
    setBusy(false);
  }, [mode]);

  function go(next: EmailAuthMode) {
    setStep(next);
    setPassword('');
    setConfirm('');
    setError(null);
  }

  /** Client-side checks; the rest (password rules, existing accounts) is Supabase's answer. */
  function problem(): string | null {
    if (!checkEmail(email)) return 'Enter a valid email address.';
    if (step === 'reset') return null;
    if (!password) return step === 'sign-up' ? 'Choose a password.' : 'Enter your password.';
    if (step === 'sign-up' && password !== confirm) return 'The passwords don’t match.';
    return null;
  }

  async function submit() {
    const invalid = problem();
    if (invalid) {
      setError(invalid);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      if (step === 'sign-in') {
        await signInWithEmail(email, password);
        onClose();
      } else if (step === 'sign-up') {
        const result = await signUpWithEmail(email, password);
        if (result === 'confirm-email') setStep('confirm-email');
        else onClose(); // signed in: the username dialog takes over
      } else {
        await requestPasswordReset(email);
        setStep('reset-sent');
      }
      setPassword('');
      setConfirm('');
    } catch (err) {
      setError(err instanceof AccountError ? err.message : 'That didn’t work. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  const open = mode !== null;
  const address = email.trim();

  if (step === 'confirm-email' || step === 'reset-sent') {
    return (
      <Dialog open={open} title={TITLES[step]} onClose={onClose} closeLabel="Done">
        {step === 'confirm-email' ? (
          <>
            <p>
              We sent a confirmation link to <strong>{address}</strong>. Open it <strong>in this browser</strong> to finish creating your account; then you choose
              your username.
            </p>
            <p className="settings-group__note">
              You are not logged in yet. If you open the link somewhere else, your address is still confirmed: come back here and log in with your email and
              password.
            </p>
          </>
        ) : (
          <>
            <p>
              If there is an account for <strong>{address}</strong>, we sent it a link to choose a new password. Open it <strong>in this browser</strong>.
            </p>
            <p className="settings-group__note">The link is valid for a limited time. Nothing changes until you choose a new password.</p>
          </>
        )}
      </Dialog>
    );
  }

  const submitLabel = step === 'sign-in' ? 'Log in' : step === 'sign-up' ? 'Create account' : 'Send reset link';
  return (
    <Dialog
      open={open}
      title={TITLES[step]}
      submitLabel={busy ? 'Please wait…' : submitLabel}
      submitDisabled={busy}
      onClose={onClose}
      onSubmit={() => void submit()}
    >
      <label htmlFor={emailId} className="field__label">
        Email
      </label>
      <input
        id={emailId}
        className="input"
        type="text"
        inputMode="email"
        autoComplete="email"
        autoCapitalize="none"
        spellCheck={false}
        value={email}
        maxLength={254}
        data-autofocus
        onChange={(e) => setEmail(e.currentTarget.value)}
      />
      {step !== 'reset' && (
        <>
          <label htmlFor={passwordId} className="field__label">
            Password
          </label>
          <input
            id={passwordId}
            className="input"
            type="password"
            autoComplete={step === 'sign-up' ? 'new-password' : 'current-password'}
            value={password}
            onChange={(e) => setPassword(e.currentTarget.value)}
          />
        </>
      )}
      {step === 'sign-up' && (
        <>
          <label htmlFor={confirmId} className="field__label">
            Confirm password
          </label>
          <input id={confirmId} className="input" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.currentTarget.value)} />
        </>
      )}
      {step === 'reset' && <p className="settings-group__note">We’ll email you a link to choose a new password.</p>}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <div className="email-auth__links">
        {step === 'sign-in' && (
          <>
            <button type="button" className="btn btn--ghost" onClick={() => go('reset')}>
              Forgot password?
            </button>
            <button type="button" className="btn btn--ghost" onClick={() => go('sign-up')}>
              Create an account
            </button>
          </>
        )}
        {step !== 'sign-in' && (
          <button type="button" className="btn btn--ghost" onClick={() => go('sign-in')}>
            {step === 'sign-up' ? 'I already have an account' : 'Back to log in'}
          </button>
        )}
      </div>
    </Dialog>
  );
}

/** After a password reset link: choose the new password (Supabase has already signed the user in). */
export function SetNewPasswordDialog() {
  const open = useAccount((s) => s.passwordRecovery && s.state.status === 'signed-in');
  const updatePassword = useAccount((s) => s.updatePassword);
  const dismiss = useAccount((s) => s.dismissPasswordRecovery);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const passwordId = useId();
  const confirmId = useId();

  useEffect(() => {
    if (!open) return;
    setPassword('');
    setConfirm('');
    setError(null);
    setBusy(false);
    setDone(false);
  }, [open]);

  async function submit() {
    if (!password) return setError('Choose a new password.');
    if (password !== confirm) return setError('The passwords don’t match.');
    setBusy(true);
    setError(null);
    try {
      await updatePassword(password);
      setDone(true);
    } catch (err) {
      setError(err instanceof AccountError ? err.message : 'That didn’t work. Please try again.');
    } finally {
      setPassword('');
      setConfirm('');
      setBusy(false);
    }
  }

  if (done) {
    return (
      <Dialog open title="Password changed" onClose={() => setDone(false)} closeLabel="Done">
        <p>Your new password is saved. You are logged in.</p>
      </Dialog>
    );
  }
  return (
    <Dialog
      open={open}
      title="Choose a new password"
      submitLabel={busy ? 'Saving…' : 'Save password'}
      submitDisabled={busy}
      closeLabel="Not now"
      onClose={dismiss}
      onSubmit={() => void submit()}
    >
      <p className="settings-group__note">You opened a password reset link and are logged in. Choose your new password.</p>
      <label htmlFor={passwordId} className="field__label">
        New password
      </label>
      <input id={passwordId} className="input" type="password" autoComplete="new-password" value={password} data-autofocus onChange={(e) => setPassword(e.currentTarget.value)} />
      <label htmlFor={confirmId} className="field__label">
        Confirm new password
      </label>
      <input id={confirmId} className="input" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.currentTarget.value)} />
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
    </Dialog>
  );
}
