/**
 * Customers domain service.
 *
 * Pure data-access layer — no React, no UI. Now backed by `dbAdapter`
 * instead of touching localStorage directly. Passwords have been moved
 * to `credentials.service.ts`. Points have been moved to
 * `customerPoints.service.ts` (with a denormalized cache on the row to
 * preserve the current sync UI contract).
 *
 * TODO(Supabase):
 *   - Replace `db.*` calls with `supabase.from('customers')...`.
 *   - Apply RLS: customer can read self; staff scoped by branch; admin all.
 *   - Drop the `pointsByCampaign` cache once UI consumes points async.
 */
import { Customer, Gender } from '@/lib/types';
import { db, TABLES } from './dbAdapter';
import { getActiveCampaigns } from './campaigns.service';
import {
  validateOrThrow,
  customerRegistrationSchema,
  customerLoginSchema,
} from './validation';
import {
  setCredential,
  verifyCredential,
  updateCredentialIdentifier,
  getCredentialPassword,
} from './credentials.service';
import {
  getPoints,
  getPointsByCustomer,
  setPoints,
  clearAllPoints,
} from './customerPoints.service';
import { registerConsent } from './consent.service';
import { logAudit } from './audit.service';

function withDerivedFields(c: any): Customer {
  const base: Customer = {
    ...c,
    pointsByCampaign: c.pointsByCampaign || {},
    acceptedCampaigns: c.acceptedCampaigns || [],
    isActive: c.isActive !== false,
  };
  // Hydrate denormalized points cache from the normalized table.
  base.pointsByCampaign = getPointsByCustomer(c.id);
  return base;
}

export function getCustomers(): Customer[] {
  return db.readSync<any>(TABLES.customers).map(withDerivedFields);
}

/** Active customers only (excludes soft-deleted). */
export function getActiveCustomers(): Customer[] {
  return getCustomers().filter(c => c.isActive !== false);
}

export function getCustomerByPhone(phone: string): Customer | undefined {
  return getCustomers().find(c => c.phone === phone);
}

export function getCustomerById(id: string): Customer | undefined {
  return getCustomers().find(c => c.id === id);
}

export interface RegisterCustomerOptions {
  /** LOPDP: must be true; the service blocks registration if false. */
  consentAccepted: boolean;
}

export function registerCustomer(
  phone: string,
  name: string,
  password: string,
  gender: Gender,
  options: RegisterCustomerOptions = { consentAccepted: false },
): Customer | null {
  if (!options.consentAccepted) return null; // LOPDP: explicit consent required
  try {
    validateOrThrow(customerRegistrationSchema, { phone, name, password, gender });
  } catch {
    return null;
  }
  if (getCustomerByPhone(phone)) return null;
  const id = `cust-${Date.now()}`;
  const customer: Customer = {
    id,
    phone,
    name,
    gender,
    pointsByCampaign: {},
    acceptedCampaigns: [],
    isActive: true,
    createdAt: new Date().toISOString(),
  };
  // TODO(Supabase Auth): replace setCredential with supabase.auth.signUp.
  setCredential(id, 'phone', phone, password);
  db.writeSync(TABLES.customers, [
    ...db.readSync<any>(TABLES.customers),
    customer,
  ]);
  registerConsent(id);
  logAudit({ action: 'customer_login', actorId: id, actorRole: 'customer', targetUserId: id, metadata: { event: 'registered' } });
  return customer;
}

/** Points for a customer in one specific campaign. */
export function getCustomerPoints(
  customer: Customer | undefined | null,
  campaignId: string,
): number {
  if (!customer) return 0;
  return getPoints(customer.id, campaignId);
}

/** Sum of points across every campaign (global totals). */
export function getCustomerTotalPoints(customer: Customer | undefined | null): number {
  if (!customer) return 0;
  return Object.values(getPointsByCustomer(customer.id)).reduce((s, n) => s + (n || 0), 0);
}

/** Set absolute points for a campaign. */
export function setCustomerPoints(id: string, campaignId: string, newPoints: number): void {
  setPoints(id, campaignId, newPoints);
  // Refresh embedded cache so sync readers (current UI) see the update.
  const list = db.readSync<any>(TABLES.customers).map((c: any) =>
    c.id === id
      ? { ...c, pointsByCampaign: { ...(c.pointsByCampaign || {}), [campaignId]: newPoints } }
      : c,
  );
  db.writeSync(TABLES.customers, list);
}

/** @deprecated use setCustomerPoints(id, campaignId, n). Kept for compat. */
export function updateCustomerPoints(id: string, newPoints: number): void {
  const active = getActiveCampaigns()[0];
  if (active) setCustomerPoints(id, active.id, newPoints);
}

export function resetCustomerPassword(id: string, newPassword: string): void {
  // TODO(Supabase Auth): supabase.auth.updateUser({ password }).
  const customer = getCustomerById(id);
  if (!customer) return;
  setCredential(id, 'phone', customer.phone, newPassword);
}

export function updateCustomerPhone(id: string, newPhone: string): boolean {
  if (getCustomerByPhone(newPhone)) return false;
  const list = db.readSync<any>(TABLES.customers).map((c: any) =>
    c.id === id ? { ...c, phone: newPhone } : c,
  );
  db.writeSync(TABLES.customers, list);
  updateCredentialIdentifier(id, newPhone);
  return true;
}

export function loginCustomer(phone: string, password: string): Customer | null {
  try {
    validateOrThrow(customerLoginSchema, { phone, password });
  } catch {
    return null;
  }
  const userId = verifyCredential('phone', phone, password);
  if (!userId) return null;
  const c = getCustomerById(userId);
  if (!c) return null;
  if (c.isActive === false) return null; // soft-deleted cannot login
  db.writeValueSync(TABLES.sessionCustomer, c);
  logAudit({ action: 'customer_login', actorId: c.id, actorRole: 'customer', targetUserId: c.id });
  return c;
}

export function getCurrentCustomer(): Customer | null {
  const stored = db.readValueSync<any>(TABLES.sessionCustomer, null);
  if (!stored) return null;
  // Re-hydrate fresh state (could be soft-deleted server-side).
  return getCustomerById(stored.id) ?? withDerivedFields(stored);
}

export function logoutCustomer(): void {
  db.removeSync(TABLES.sessionCustomer);
}

export function resetAllCustomerPoints(): void {
  clearAllPoints();
  const list = db.readSync<any>(TABLES.customers).map((c: any) => ({ ...c, pointsByCampaign: {} }));
  db.writeSync(TABLES.customers, list);
}

/** Idempotent: append a campaignId to the accepted-terms list. */
export function acceptCampaignTerms(customerId: string, campaignId: string): void {
  const list = db.readSync<any>(TABLES.customers).map((c: any) => {
    if (c.id !== customerId) return c;
    const accepted = c.acceptedCampaigns || [];
    if (accepted.includes(campaignId)) return c;
    return { ...c, acceptedCampaigns: [...accepted, campaignId] };
  });
  db.writeSync(TABLES.customers, list);
}

/** Soft-delete: only admins may call this. Throws if caller lacks privilege. */
export function deactivateCustomer(customerId: string, actor: { id: string; role: 'admin' | 'cashier' }): void {
  if (actor.role !== 'admin') throw new Error('Solo un administrador puede desactivar clientes');
  const list = db.readSync<any>(TABLES.customers).map((c: any) =>
    c.id === customerId
      ? { ...c, isActive: false, deletedAt: new Date().toISOString() }
      : c,
  );
  db.writeSync(TABLES.customers, list);
  logAudit({
    action: 'customer_deactivated',
    actorId: actor.id,
    actorRole: 'admin',
    targetUserId: customerId,
  });
}

export function reactivateCustomer(customerId: string, actor: { id: string; role: 'admin' | 'cashier' }): void {
  if (actor.role !== 'admin') throw new Error('Solo un administrador puede reactivar clientes');
  const list = db.readSync<any>(TABLES.customers).map((c: any) =>
    c.id === customerId
      ? { ...c, isActive: true, deletedAt: undefined }
      : c,
  );
  db.writeSync(TABLES.customers, list);
  logAudit({
    action: 'customer_reactivated',
    actorId: actor.id,
    actorRole: 'admin',
    targetUserId: customerId,
  });
}

export function customerNeedsPasswordChange(customer: Customer): boolean {
  // TODO(Supabase Auth): replace with a `must_change_password` flag on the profile.
  return getCredentialPassword(customer.id) === customer.phone;
}
