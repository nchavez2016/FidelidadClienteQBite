/**
 * Unified session service — customer-only legacy compatibility layer.
 *
 * Staff auth no longer uses localStorage; the staff branch was removed in
 * Phase 2.6. The remaining customer slot is still read by a few legacy
 * sync consumers (e.g. useSession, getCurrentCustomer mirrors). It is
 * populated by `syncLegacyCustomerSession` from the Supabase AuthContext
 * bridge — never written directly anymore.
 */
import { storage } from '../storage/localAdapter';
import { STORAGE_KEYS } from '../storage/keys';
import type { Customer } from '@/lib/types';
import type { Session, Profile, AuthUser, Role } from './types';

function customerToSession(c: Customer): Session {
  const user: AuthUser = { id: c.id, identifier: c.phone, factor: 'phone' };
  const profile: Profile = { id: c.id, role: 'customer', displayName: c.name };
  return { user, profile };
}

/** Returns the active customer session (legacy mirror). Staff sessions live in AuthContext. */
export function getCurrentSession(): Session | null {
  const customer = storage.get<Customer | null>(STORAGE_KEYS.currentCustomer, null);
  if (customer) return customerToSession(customer);
  return null;
}

export function getCurrentRole(): Role | null {
  return getCurrentSession()?.profile.role ?? null;
}

export function hasRole(...roles: Role[]): boolean {
  const role = getCurrentRole();
  return role !== null && roles.includes(role);
}

/** Clears the legacy customer slot. Staff slot is no longer written. */
export function clearSession(): void {
  storage.remove(STORAGE_KEYS.currentCustomer);
  storage.remove(STORAGE_KEYS.currentStaff);
}
