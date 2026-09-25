// Username rules (D6). The username is the visible identity of a Lique
// (@johan). Kept deliberately simple: 3–20 letters or digits, no spaces or
// symbols. Case is kept as typed but compared case-insensitively ("Johan" and
// "johan" are the same username). The database enforces the same rules and
// the case-insensitive uniqueness (supabase/migrations/*_liqueamp_accounts.sql);
// this module only gives immediate feedback while typing.

export const USERNAME_MIN = 3;
export const USERNAME_MAX = 20;
const PATTERN = /^[A-Za-z0-9]+$/;

/** Names nobody can take (also enforced by the database). */
export const RESERVED_USERNAMES: readonly string[] = ['admin', 'administrator', 'liqueamp', 'support', 'system', 'root', 'moderator', 'official', 'null', 'undefined', 'anonymous', 'everyone'];

export type UsernameProblem = 'empty' | 'too-short' | 'too-long' | 'invalid-characters' | 'reserved';

export type UsernameCheck = { ok: true; username: string } | { ok: false; problem: UsernameProblem; message: string };

/** What the user typed, without surrounding spaces or a leading @. */
export function cleanUsername(input: string): string {
  return input.trim().replace(/^@/, '');
}

/** Case-insensitive comparison key. */
export function usernameKey(username: string): string {
  return cleanUsername(username).toLowerCase();
}

export function checkUsername(input: string): UsernameCheck {
  const username = cleanUsername(input);
  const fail = (problem: UsernameProblem, message: string): UsernameCheck => ({ ok: false, problem, message });
  if (!username) return fail('empty', 'Choose a username.');
  if (!PATTERN.test(username)) return fail('invalid-characters', 'Use only letters (A–Z) and digits (0–9) — no spaces or symbols.');
  if (username.length < USERNAME_MIN) return fail('too-short', `Use at least ${USERNAME_MIN} characters.`);
  if (username.length > USERNAME_MAX) return fail('too-long', `Use at most ${USERNAME_MAX} characters.`);
  if (RESERVED_USERNAMES.includes(username.toLowerCase())) return fail('reserved', 'That username is reserved. Choose another one.');
  return { ok: true, username };
}
