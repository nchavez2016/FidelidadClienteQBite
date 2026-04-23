/**
 * Unified auth types.
 *
 * Goal: model BOTH customers and staff under a single `Session` + `Profile`
 * abstraction so the upcoming Supabase Auth migration is a one-file change.
 *
 * - `AuthUser` mirrors `auth.users` (id, contact handle, factor used to sign in).
 * - `Profile` mirrors a future `public.profiles` row (role + display data).
 * - `Session` is what UI hooks should consume (current user + role).
 */
export type Role = 'customer' | 'cashier' | 'admin';

/** Identity row — what `auth.users` will provide once Supabase is wired in. */
export interface AuthUser {
  id: string;
  /** Phone for customers, username for staff (until SSO/email is added). */
  identifier: string;
  /** Identity factor used to authenticate (informational, not a credential). */
  factor: 'phone' | 'username' | 'email';
}

/** Domain-side profile — maps to `public.profiles` post-migration. */
export interface Profile {
  id: string;
  role: Role;
  displayName: string;
  /** Optional active branch (cashier/admin shift context). */
  branchId?: string;
}

export interface Session {
  user: AuthUser;
  profile: Profile;
}
