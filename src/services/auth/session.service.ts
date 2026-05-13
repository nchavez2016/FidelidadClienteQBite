/**
 * Phase 2.8 — sessions live exclusively in `AuthContext`.
 *
 * These helpers are no-ops kept ONLY so older imports do not break the
 * build. New code must consume `useAuth()` / `useSession()`.
 */
import { storage } from '../storage/localAdapter';
import { STORAGE_KEYS } from '../storage/keys';
import type { Session, Role } from './types';

/** @deprecated Phase 2.8 — always null. Read identity via `useAuth()`. */
export function getCurrentSession(): Session | null {
  return null;
}

/** @deprecated Phase 2.8 — always null. */
export function getCurrentRole(): Role | null {
  return null;
}

/** @deprecated Phase 2.8 — always false. */
export function hasRole(..._roles: Role[]): boolean {
  return false;
}

/** Defensive cleanup of legacy session slots. */
export function clearSession(): void {
  storage.remove(STORAGE_KEYS.currentCustomer);
  storage.remove(STORAGE_KEYS.currentStaff);
}
