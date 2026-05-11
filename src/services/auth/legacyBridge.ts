/**
 * Bridge between Supabase Auth (source of truth) and the legacy
 * localStorage-based domain layer that still backs most services.
 *
 * AuthContext calls these helpers whenever the Supabase session changes,
 * so legacy reads (`getCurrentCustomer`, `getCurrentStaff`, services that
 * key off `gaviota_current_*`) keep working without manual writes.
 *
 * If the authenticated user does not yet have a matching legacy row
 * (typical after a Supabase signup), we materialize a stub row from the
 * auth metadata so downstream services find something to operate on.
 */
import type { User } from '@supabase/supabase-js';
import { db, TABLES } from '../dbAdapter';
import { getCustomerByPhone, getCustomers } from '../customers.service';
import type { Customer, Gender } from '@/lib/types';
import type { AppRole } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';

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

/**
 * @deprecated Phase 2.7 — to be removed once all customer reads consume
 * `AuthContext` + Supabase `profiles` directly. Materializes a legacy
 * `currentCustomer` slot so synchronous services keep functioning during
 * the migration. Do not introduce new callers.
 */
export function syncLegacyCustomerSession(user: User): Customer | null {
  try {
  console.info('🚨 [legacyBridge] syncLegacyCustomerSession:start', { uid: user.id, metadata: meta(user) });
  // Defensive: if some other slot is set from a previous session of a
  // different audience, clear it so legacy reads don't pick the wrong one.
  db.removeSync(TABLES.sessionStaff);
  const m = meta(user);
  const phone = String(m.identifier ?? '').trim();
  if (!phone) {
    console.warn('🚨 [legacyBridge] customer session missing identifier', { uid: user.id });
    return null;
  }
  let customer = getCustomerByPhone(phone);
  if (!customer) {
    customer = {
      id: user.id,
      phone,
      name: String(m.display_name ?? phone),
      gender: ((m.gender as Gender) ?? 'otro') as Gender,
      pointsByCampaign: {},
      acceptedCampaigns: [],
      isActive: true,
      createdAt: new Date().toISOString(),
    };
    db.writeSync(TABLES.customers, [...getCustomers(), customer]);
  }
  db.writeValueSync(TABLES.sessionCustomer, customer);
  // Persist phone/name/gender into the Supabase profile (handle_new_user
  // creates the row but doesn't see metadata.identifier). Best-effort.
  void supabase
    .from('profiles')
    .update({
      display_name: customer.name,
      phone: customer.phone,
      gender: customer.gender,
    } as never)
    .eq('id', user.id)
    .then(({ error }) => {
      if (error) console.error('🚨 [legacyBridge] profile sync failed', error);
      else console.info('🚨 [legacyBridge] profile sync ok', { uid: user.id });
    });
  console.info('🚨 [legacyBridge] syncLegacyCustomerSession:done', { customer });
  return customer;
  } catch (error) {
    console.error('🚨 [legacyBridge] syncLegacyCustomerSession crashed', error);
    return null;
  }
}

export function clearLegacySessions(): void {
  try {
    console.info('🚨 [legacyBridge] clearLegacySessions');
    db.removeSync(TABLES.sessionCustomer);
    db.removeSync(TABLES.sessionStaff);
  } catch (error) {
    console.error('🚨 [legacyBridge] clearLegacySessions crashed', error);
  }
}
