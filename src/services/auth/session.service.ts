/**
 * Unified session service.
 *
 * Today: reads the legacy `currentCustomer` / `currentStaff` localStorage
 * slots and projects them into a unified `Session`.
 * Tomorrow (Supabase): replace the bodies with `supabase.auth.getSession()`
 * + a join on `public.profiles`. Public API does NOT change.
 */
import { storage } from '../storage/localAdapter';
import { STORAGE_KEYS } from '../storage/keys';
import type { Customer, StaffUser } from '@/lib/types';
import type { Session, Profile, AuthUser, Role } from './types';

function customerToSession(c: Customer): Session {
  const user: AuthUser = { id: c.id, identifier: c.phone, factor: 'phone' };
  const profile: Profile = { id: c.id, role: 'customer', displayName: c.name };
  return { user, profile };
}

function staffToSession(s: StaffUser): Session {
  const user: AuthUser = { id: s.id, identifier: s.username, factor: 'username' };
  const profile: Profile = {
    id: s.id,
    role: s.role as Role,
    displayName: s.name,
    branchId: s.branchCampaignId,
  };
  return { user, profile };
}

/** Returns the active session, regardless of which audience signed in. */
export function getCurrentSession(): Session | null {
  const staff = storage.get<StaffUser | null>(STORAGE_KEYS.currentStaff, null);
  if (staff) return staffToSession(staff);
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

/** Centralized logout — clears whichever session is active. */
export function clearSession(): void {
  storage.remove(STORAGE_KEYS.currentCustomer);
  storage.remove(STORAGE_KEYS.currentStaff);
}
