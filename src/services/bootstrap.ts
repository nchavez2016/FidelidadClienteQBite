/**
 * One-time bootstrap: run migrations, then seed empty stores.
 *
 * Seeding keeps the local demo usable after preview refreshes or storage resets.
 * When migrating to Supabase, replace seeding with SQL `seed.sql`.
 */
import { storage } from './storage/localAdapter';
import { STORAGE_KEYS } from './storage/keys';
import { runAllMigrations } from './migrations';
import {
  SEED_CAMPAIGNS,
  SEED_CUSTOMERS,
  SEED_STAFF,
  SEED_TRANSACTIONS,
} from './mocks/seed';
import type { Campaign, Customer, StaffUser, Transaction } from '@/lib/types';

function seedCampaigns(): void {
  const campaigns = storage.get<Campaign[]>(STORAGE_KEYS.campaigns, []);
  if (campaigns.length === 0) storage.set(STORAGE_KEYS.campaigns, SEED_CAMPAIGNS);
}

function seedCustomers(): void {
  const customers = storage.get<Customer[]>(STORAGE_KEYS.customers, []);
  if (customers.length === 0) storage.set(STORAGE_KEYS.customers, SEED_CUSTOMERS);
}

function seedStaff(): void {
  const staff = storage.get<StaffUser[]>(STORAGE_KEYS.staff, []);
  if (staff.length === 0) {
    storage.set(STORAGE_KEYS.staff, SEED_STAFF);
    return;
  }
  // Idempotent backfill: ensure the Matriz cashier exists in older installs.
  if (!staff.find(s => s.username === 'cajero2')) {
    const cajero2 = SEED_STAFF.find(s => s.username === 'cajero2');
    if (cajero2) storage.set(STORAGE_KEYS.staff, [...staff, cajero2]);
  }
}

function seedTransactions(): void {
  const transactions = storage.get<Transaction[]>(STORAGE_KEYS.transactions, []);
  if (transactions.length === 0) storage.set(STORAGE_KEYS.transactions, SEED_TRANSACTIONS);
}

let bootstrapped = false;
export function bootstrapStore(): void {
  if (bootstrapped) return;
  bootstrapped = true;
  // Migrations always run — they only normalize existing data, never insert demo rows.
  runAllMigrations();
  seedCampaigns();
  seedCustomers();
  seedStaff();
  seedTransactions();
}
