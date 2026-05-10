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
import { getStaff } from '../staff.service';
import type { Customer, Gender, StaffUser } from '@/lib/types';
import type { AppRole } from '@/contexts/AuthContext';

function meta(user: User): Record<string, unknown> {
  return (user.user_metadata ?? {}) as Record<string, unknown>;
}

export function syncLegacyCustomerSession(user: User): Customer | null {
  const m = meta(user);
  const phone = String(m.identifier ?? '').trim();
  if (!phone) return null;
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
  return customer;
}

export function syncLegacyStaffSession(user: User, roles: AppRole[]): StaffUser | null {
  const m = meta(user);
  const username = String(m.identifier ?? '').trim();
  if (!username) return null;
  const role: 'admin' | 'cashier' = roles.includes('admin') ? 'admin' : 'cashier';
  let staff = getStaff().find(s => s.username.toLowerCase() === username.toLowerCase());
  if (!staff) {
    staff = {
      id: user.id,
      username,
      name: String(m.display_name ?? username),
      role,
      active: true,
    };
    db.writeSync(TABLES.staff, [...getStaff(), staff]);
  } else if (staff.role !== role) {
    // Mantener el rol legacy alineado con user_roles cuando difiera.
    staff = { ...staff, role };
    const all = getStaff().map(s => (s.id === staff!.id ? staff! : s));
    db.writeSync(TABLES.staff, all);
  }
  db.writeValueSync(TABLES.sessionStaff, staff);
  return staff;
}

export function clearLegacySessions(): void {
  db.removeSync(TABLES.sessionCustomer);
  db.removeSync(TABLES.sessionStaff);
}
