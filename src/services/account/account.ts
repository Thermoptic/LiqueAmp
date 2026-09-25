// Provider-neutral account service (docs/LIQUEAMP_IMPLEMENTATION_PLAN.md D5,
// D6, D14–D16). Accounts are optional: without one, LiqueAmp works exactly as
// a local app. The Supabase implementation lives in src/services/cloud/; the
// UI and the rest of the app only see this interface.

/**
 * D5 (extended 2026-09-26): Google and GitHub OAuth, and email + password —
 * all through Supabase Auth, all leading to the same kind of LiqueAmp account.
 */
export const AUTH_METHODS = ['google', 'github', 'email'] as const;
export type AuthMethod = (typeof AUTH_METHODS)[number];

/** The methods that sign in by leaving for the provider and coming back (the "Continue with …" buttons). */
export const OAUTH_METHODS = ['google', 'github'] as const;
export type OAuthMethod = (typeof OAUTH_METHODS)[number];

export const AUTH_METHOD_LABEL: Record<AuthMethod, string> = { google: 'Google', github: 'GitHub', email: 'Email' };

export interface AccountUser {
  /** The Supabase auth user UUID: permanent technical identity, used for ownership and relationships. */
  userId: string;
  /** The visible identity of the Lique (@johan). Unique case-insensitively (D6). */
  username: string;
}

export interface AccountSession {
  user: AccountUser;
  /** How this session signed in; null if the backend does not say. */
  authMethod: AuthMethod | null;
}

export type AccountState =
  | { status: 'signed-out' }
  /** Signed in for the first time (any method): a username must be chosen before anything else happens. */
  | { status: 'needs-username'; userId: string; authMethod: AuthMethod | null }
  | { status: 'signed-in'; session: AccountSession };

/**
 * Credentials for signing in. OAuth needs only the provider; email needs the
 * address and password, which go straight to the auth backend and are never
 * stored or logged by LiqueAmp.
 */
export type AuthCredentials = { method: OAuthMethod } | { method: 'email'; email: string; password: string };

/** After an email sign-up: signed in at once, or the address must be confirmed first (no session yet). */
export type SignUpResult = 'signed-in' | 'confirm-email';

export type AccountErrorCode =
  | 'unavailable' // no backend configured in this build
  | 'offline' // backend unreachable / network error / timeout
  | 'cancelled' // the user cancelled the OAuth sign-in
  | 'auth-failed' // OAuth or session error
  | 'session-expired'
  | 'username-taken'
  | 'username-invalid'
  | 'profile-rejected' // the server refused a profile (structure/owner/size)
  | 'not-signed-in'
  | 'email-invalid'
  | 'password-invalid' // the auth backend's password rules (its own message is shown)
  | 'email-taken'
  | 'wrong-credentials'
  | 'email-not-confirmed'
  | 'rate-limited'
  | 'unknown';

/** An error a LiqueAmp user can understand; the technical cause is kept for logs only. */
export class AccountError extends Error {
  constructor(
    readonly code: AccountErrorCode,
    message: string,
    readonly cause?: unknown,
  ) {
    super(message);
  }
}

export const ACCOUNT_MESSAGES: Record<AccountErrorCode, string> = {
  unavailable: 'Accounts are not available in this version of LiqueAmp.',
  offline: 'The LiqueAmp account service can’t be reached right now. Everything on this device keeps working.',
  cancelled: 'Sign-in was cancelled.',
  'auth-failed': 'Sign-in didn’t work. Please try again.',
  'session-expired': 'Your session has expired. Log in again to sync your Lique.',
  'username-taken': 'That username is already taken. Choose another one.',
  'username-invalid': 'That username can’t be used.',
  'profile-rejected': 'Your account could not store this Lique. Nothing on this device was changed.',
  'not-signed-in': 'You’re not logged in.',
  'email-invalid': 'Enter a valid email address.',
  'password-invalid': 'Choose a stronger password.',
  'email-taken': 'This email is already registered. Log in, or use “Forgot password?”.',
  'wrong-credentials': 'Wrong email or password.',
  'email-not-confirmed': 'Confirm your email first: open the link we sent you, then log in.',
  'rate-limited': 'Too many attempts. Wait a minute and try again.',
  unknown: 'Something went wrong with your account. Everything on this device keeps working.',
};

export const accountError = (code: AccountErrorCode, cause?: unknown, message: string = ACCOUNT_MESSAGES[code]) => new AccountError(code, message, cause);

/** A plausible email address (the auth backend does the real check). */
export function checkEmail(input: string): string | null {
  const email = input.trim();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 254 ? email : null;
}

export interface AccountProvider {
  /** e.g. 'local' (no accounts) or 'supabase'. */
  readonly id: string;
  /** Whether this provider can sign in at all. */
  readonly available: boolean;
  /** The full account state (signed out / needs a username / signed in). */
  getState(): Promise<AccountState>;
  /** The signed-in session, or null (also while a username is still missing). */
  getSession(): Promise<AccountSession | null>;
  getCurrentUser(): Promise<AccountUser | null>;
  /**
   * OAuth: starts sign-in; the browser leaves for the provider and returns to
   * the app's callback URL. Email: signs in directly (resolves once signed in).
   */
  signIn(credentials: AuthCredentials): Promise<void>;
  /** Email: creates the account. OAuth: the same as signIn (the first sign-in creates the account). */
  signUp(credentials: AuthCredentials): Promise<SignUpResult>;
  /** Sends a password reset link that returns to the app's callback URL. */
  requestPasswordReset(email: string): Promise<void>;
  /** Sets a new password for the signed-in user (after following a reset link). */
  updatePassword(password: string): Promise<void>;
  /** Called when the user arrived through a password reset link (also if that happened before subscribing). */
  onPasswordRecovery(listener: () => void): () => void;
  /** Reserves the username for the signed-in user (atomic, server-side). */
  claimUsername(username: string): Promise<AccountSession>;
  /** Disconnects the session on this device only (D14); never touches local data. */
  signOut(): Promise<void>;
  /** Permanently deletes the cloud account server-side (D15). */
  deleteAccount(): Promise<void>;
  onChange(listener: (state: AccountState) => void): () => void;
}

/**
 * The provider when no account backend is configured: always signed out.
 * LiqueAmp keeps working locally; sign-in explains that accounts are not
 * available.
 */
export function createLocalAccountProvider(): AccountProvider {
  const unavailable = () => Promise.reject(accountError('unavailable'));
  return {
    id: 'local',
    available: false,
    getState: async () => ({ status: 'signed-out' }),
    getSession: async () => null,
    getCurrentUser: async () => null,
    signIn: unavailable,
    signUp: unavailable,
    requestPasswordReset: unavailable,
    updatePassword: unavailable,
    onPasswordRecovery: () => () => undefined,
    claimUsername: unavailable,
    signOut: async () => undefined,
    deleteAccount: unavailable,
    onChange: () => () => undefined,
  };
}
