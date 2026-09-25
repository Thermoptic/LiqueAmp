// Provider-neutral account service (docs/LIQUEAMP_IMPLEMENTATION_PLAN.md D5,
// D6, D16). Accounts are optional: without one, LiqueAmp works exactly as a
// local app. Supabase is the selected backend, but the UI and the rest of the
// app only see this interface — and the authentication method itself (D5) is
// still open, so credentials are opaque here.

export interface AccountUser {
  /** Opaque, stable id from the auth backend. Used for ownership and relationships; never shown as the identity. */
  userId: string;
  /** The human-facing identity of the Lique (@username). Unique case-insensitively; rules are D6. */
  username: string;
}

export interface AccountSession {
  user: AccountUser;
}

export type AccountState = { status: 'signed-out' } | { status: 'signed-in'; session: AccountSession };

/**
 * Credentials for the chosen authentication method. The method is not decided
 * yet (D5), so nothing here assumes email, passwords, magic links, OAuth or
 * passkeys; a provider implementation defines what it accepts.
 */
export type AuthCredentials = { method: string } & Record<string, unknown>;

export interface SignUpRequest {
  /** The username the account claims. Validation rules are D6. */
  username: string;
  credentials: AuthCredentials;
}

export interface AccountProvider {
  /** e.g. 'local' (no accounts) or 'supabase'. */
  readonly id: string;
  /** Whether this provider can create accounts and sign in at all. */
  readonly available: boolean;
  getSession(): Promise<AccountSession | null>;
  getCurrentUser(): Promise<AccountUser | null>;
  signUp(request: SignUpRequest): Promise<AccountSession>;
  signIn(credentials: AuthCredentials): Promise<AccountSession>;
  /** Disconnects the session only (D14); never touches local data. */
  signOut(): Promise<void>;
  /** Permanently deletes the cloud account server-side (D15). */
  deleteAccount(): Promise<void>;
  onChange(listener: (state: AccountState) => void): () => void;
}

export class AccountUnavailableError extends Error {
  constructor() {
    super('Accounts are not available in this version of LiqueAmp yet.');
  }
}

/**
 * The provider when no account backend is configured: always signed out.
 * LiqueAmp keeps working locally; sign-up and sign-in explain that accounts
 * are not available.
 */
export function createLocalAccountProvider(): AccountProvider {
  return {
    id: 'local',
    available: false,
    getSession: async () => null,
    getCurrentUser: async () => null,
    signUp: () => Promise.reject(new AccountUnavailableError()),
    signIn: () => Promise.reject(new AccountUnavailableError()),
    signOut: async () => undefined,
    deleteAccount: () => Promise.reject(new AccountUnavailableError()),
    onChange: () => () => undefined,
  };
}
