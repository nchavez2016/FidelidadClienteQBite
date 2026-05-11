/**
 * Phase 2.8 — defensive shim only.
 *
 * Supabase Auth + `useAuth()` are now the ONLY source of truth for
 * customer/staff identity. This module no longer materializes legacy
 * `gaviota_current_*` rows. The remaining helpers exist solely to:
 *   1. resolve the audience of an authenticated user, and
 *   2. wipe stale legacy session slots so old code paths can't read them.
 */
import type { User } from '@supabase/supabase-js';
import { db, TABLES } from '../dbAdapter';
import type { AppRole } from '@/contexts/AuthContext';

function meta(user: User): Record<string, unknown> {
  return (user.user_metadata ?? {}) as Record<string, unknown>;
}

function resolveAudience(user: User, roles: AppRole[]): 'staff' | 'customer' {
  // Prefer the explicit audience the user signed in with.
  // Only fall back to roles when audience metadata is missing.
  const audience = (meta(user).audience as string | undefined) ?? null;
  if (audience === 'staff') return 'staff';
  if (audience === 'customer') return 'customer';
  if (roles.includes('admin') || roles.includes('cashier')) return 'staff';
  return 'customer';
}

export { resolveAudience };

export function clearLegacySessions(): void {
  try {
    console.debug('[legacyBridge] clearLegacySessions');
    db.removeSync(TABLES.sessionCustomer);
    db.removeSync(TABLES.sessionStaff);
  } catch (error) {
    console.error('[legacyBridge] clearLegacySessions crashed', error);
  }
}

/**
 * @deprecated Phase 2.8 — no-op kept so older imports do not break the
 * build. New code MUST NOT call this. Logs a warning if hit.
 */
export function syncLegacyCustomerSession(_user: User): null {
  console.warn('[legacyBridge] syncLegacyCustomerSession is a no-op (Phase 2.8 purge)');
  return null;
}
