/**
 * Customers domain service.
 *
 * Pure data-access layer — no React, no UI. When Supabase is wired in,
 * each function becomes an async call to the `customers` table; the
 * shape of the public API stays the same so UI hooks don't change.
 */
import { Customer, Gender } from '@/lib/types';
import { storage } from './storage/localAdapter';
import { STORAGE_KEYS } from './storage/keys';
import { getActiveCampaigns } from './campaigns.service';
import {
  validateOrThrow,
  customerRegistrationSchema,
  customerLoginSchema,
} from './validation';

function normalizeCustomer(c: any): Customer {
  return {
    ...c,
    pointsByCampaign: c.pointsByCampaign || {},
    acceptedCampaigns: c.acceptedCampaigns || [],
  };
}

export function getCustomers(): Customer[] {
  return storage.get<Customer[]>(STORAGE_KEYS.customers, []).map(normalizeCustomer);
}

export function getCustomerByPhone(phone: string): Customer | undefined {
  return getCustomers().find(c => c.phone === phone);
}

export function getCustomerById(id: string): Customer | undefined {
  return getCustomers().find(c => c.id === id);
}

export function registerCustomer(
  phone: string,
  name: string,
  password: string,
  gender: Gender,
): Customer | null {
  // Service-layer validation: never persist malformed customers, even if
  // the UI form skipped client-side checks.
  try {
    validateOrThrow(customerRegistrationSchema, { phone, name, password, gender });
  } catch {
    return null;
  }
  if (getCustomerByPhone(phone)) return null;
  const customer: Customer = {
    id: `cust-${Date.now()}`,
    phone,
    name,
    password,
    gender,
    pointsByCampaign: {},
    acceptedCampaigns: [],
    createdAt: new Date().toISOString(),
  };
  storage.set(STORAGE_KEYS.customers, [...getCustomers(), customer]);
  return customer;
}

/** Points for a customer in one specific campaign. */
export function getCustomerPoints(
  customer: Customer | undefined | null,
  campaignId: string,
): number {
  if (!customer) return 0;
  return customer.pointsByCampaign?.[campaignId] ?? 0;
}

/** Sum of points across every campaign (global totals). */
export function getCustomerTotalPoints(customer: Customer | undefined | null): number {
  if (!customer) return 0;
  return Object.values(customer.pointsByCampaign || {}).reduce((s, n) => s + (n || 0), 0);
}

/** Set absolute points for a campaign. */
export function setCustomerPoints(id: string, campaignId: string, newPoints: number): void {
  const customers = getCustomers().map(c =>
    c.id === id
      ? { ...c, pointsByCampaign: { ...c.pointsByCampaign, [campaignId]: newPoints } }
      : c,
  );
  storage.set(STORAGE_KEYS.customers, customers);
}

/** @deprecated use setCustomerPoints(id, campaignId, n). Kept for compat. */
export function updateCustomerPoints(id: string, newPoints: number): void {
  const active = getActiveCampaigns()[0];
  if (active) setCustomerPoints(id, active.id, newPoints);
}

export function resetCustomerPassword(id: string, newPassword: string): void {
  const customers = getCustomers().map(c =>
    c.id === id ? { ...c, password: newPassword } : c,
  );
  storage.set(STORAGE_KEYS.customers, customers);
}

export function updateCustomerPhone(id: string, newPhone: string): boolean {
  if (getCustomerByPhone(newPhone)) return false;
  const customers = getCustomers().map(c =>
    c.id === id ? { ...c, phone: newPhone } : c,
  );
  storage.set(STORAGE_KEYS.customers, customers);
  return true;
}

export function loginCustomer(phone: string, password: string): Customer | null {
  try {
    validateOrThrow(customerLoginSchema, { phone, password });
  } catch {
    return null;
  }
  const c = getCustomerByPhone(phone);
  if (c && c.password === password) {
    storage.set(STORAGE_KEYS.currentCustomer, c);
    return c;
  }
  return null;
}

export function getCurrentCustomer(): Customer | null {
  const stored = storage.get<any>(STORAGE_KEYS.currentCustomer, null);
  return stored ? normalizeCustomer(stored) : null;
}

export function logoutCustomer(): void {
  storage.remove(STORAGE_KEYS.currentCustomer);
}

export function resetAllCustomerPoints(): void {
  const customers = getCustomers().map(c => ({ ...c, pointsByCampaign: {} }));
  storage.set(STORAGE_KEYS.customers, customers);
}

/** Idempotent: append a campaignId to the accepted-terms list. */
export function acceptCampaignTerms(customerId: string, campaignId: string): void {
  const customers = getCustomers().map(c => {
    if (c.id !== customerId) return c;
    const accepted = c.acceptedCampaigns || [];
    if (accepted.includes(campaignId)) return c;
    return { ...c, acceptedCampaigns: [...accepted, campaignId] };
  });
  storage.set(STORAGE_KEYS.customers, customers);
}

export function customerNeedsPasswordChange(customer: Customer): boolean {
  return customer.password === customer.phone;
}
