/**
 * One-time bootstrap: run migrations, then seed empty stores.
 *
 * TODO(Supabase): replace seeding with `supabase/seed.sql`.
 */
import { db, TABLES } from './dbAdapter';
import { storage } from './storage/localAdapter';
import { STORAGE_KEYS } from './storage/keys';
import { runAllMigrations } from './migrations';
import {
  SEED_CAMPAIGNS,
  SEED_STAFF,
  SEED_CREDENTIALS,
} from './mocks/seed';
import { setCredential } from './credentials.service';
import type { Campaign, Customer, CustomerCampaignPoints, StaffUser } from '@/lib/types';
import { hydrateBranches } from './branches.service';
import { hydrateCampaigns } from './campaigns.service';
import { hydrateCustomers } from './customers.service';
import './diagnostics/legacyCustomers.diagnostics';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function seedCampaigns(): void {
  const campaigns = storage.get<Campaign[]>(STORAGE_KEYS.campaigns, []);
  if (campaigns.length === 0) storage.set(STORAGE_KEYS.campaigns, SEED_CAMPAIGNS);
}

function seedStaff(): void {
  const staff = storage.get<StaffUser[]>(STORAGE_KEYS.staff, []);
  if (staff.length === 0) {
    storage.set(STORAGE_KEYS.staff, SEED_STAFF);
    return;
  }
  if (!staff.find(s => s.username === 'cajero2')) {
    const cajero2 = SEED_STAFF.find(s => s.username === 'cajero2');
    if (cajero2) storage.set(STORAGE_KEYS.staff, [...staff, cajero2]);
  }
}

function purgeLegacyTransactions(): void {
  // Phase 3.3: localStorage.transactions is no longer the source of truth
  // for points history. Wipe any stale mirror left by older builds so the
  // ledger cache is the only reader path.
  try { storage.set(STORAGE_KEYS.transactions, []); } catch { /* ignore */ }
}

function seedCredentials(): void {
  const existing = db.readSync(TABLES.credentials);
  if (existing.length > 0) return;
  for (const c of SEED_CREDENTIALS) {
    setCredential(c.id, c.factor, c.identifier, c.password);
  }
}

/**
 * Phase 2.8 — purge any legacy `cust-xxx` customers and their orphan
 * point rows from localStorage. Supabase data is never touched.
 */
function purgeLegacyCustomerData(): void {
  try {
    const customers = db.readSync<Customer>(TABLES.customers);
    const legacy = customers.filter(c => !UUID_RE.test(c.id));
    if (legacy.length > 0) {
      console.warn('[bootstrap] purging legacy local customers', { count: legacy.length, ids: legacy.map(c => c.id) });
      db.writeSync(TABLES.customers, customers.filter(c => UUID_RE.test(c.id)));
    }
    const points = db.readSync<CustomerCampaignPoints>(TABLES.customerCampaignPoints);
    const orphan = points.filter(p => !UUID_RE.test(p.customerId));
    if (orphan.length > 0) {
      console.warn('[bootstrap] purging orphan local customer_points', { count: orphan.length });
      db.writeSync(TABLES.customerCampaignPoints, points.filter(p => UUID_RE.test(p.customerId)));
    }
    // Drop any stale legacy session slot.
    db.removeSync(TABLES.sessionCustomer);
    db.removeSync(TABLES.sessionStaff);
  } catch (err) {
    console.error('[bootstrap] purgeLegacyCustomerData failed', err);
  }
}

let bootstrapped = false;
export function bootstrapStore(): void {
  if (bootstrapped) return;
  bootstrapped = true;
  runAllMigrations();
  seedCampaigns();
  seedStaff();
  purgeLegacyTransactions();
  seedCredentials();
  purgeLegacyCustomerData();
  // Phase 4: branches + campaigns now live in Supabase. Hydrate the
  // in-memory cache in the background so legacy sync getters return
  // real data once the network round-trip completes.
  void hydrateBranches().then(() => hydrateCampaigns());
  // Phase 5: customers (via profiles) hydrate from Supabase.
  void hydrateCustomers();
  // NOTE: hydrateCustomerPoints requires an authenticated session (RLS).
  // It is invoked from AuthContext.postAuthHydrate() after sign-in/init,
  // not here — running it anonymously spams 401s in the console.
}
