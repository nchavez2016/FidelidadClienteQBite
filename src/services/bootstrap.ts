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
  SEED_CUSTOMERS,
  SEED_STAFF,
  SEED_TRANSACTIONS,
  SEED_CREDENTIALS,
} from './mocks/seed';
import { setCredential } from './credentials.service';
import { importFromCustomers } from './customerPoints.service';
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
  if (!staff.find(s => s.username === 'cajero2')) {
    const cajero2 = SEED_STAFF.find(s => s.username === 'cajero2');
    if (cajero2) storage.set(STORAGE_KEYS.staff, [...staff, cajero2]);
  }
}

function seedTransactions(): void {
  const transactions = storage.get<Transaction[]>(STORAGE_KEYS.transactions, []);
  if (transactions.length === 0) storage.set(STORAGE_KEYS.transactions, SEED_TRANSACTIONS);
}

function seedCredentials(): void {
  const existing = db.readSync(TABLES.credentials);
  if (existing.length > 0) return;
  for (const c of SEED_CREDENTIALS) {
    setCredential(c.id, c.factor, c.identifier, c.password);
  }
}

function seedPoints(): void {
  const customers = storage.get<Customer[]>(STORAGE_KEYS.customers, []);
  importFromCustomers(customers);
}

let bootstrapped = false;
export function bootstrapStore(): void {
  if (bootstrapped) return;
  bootstrapped = true;
  runAllMigrations();
  seedCampaigns();
  seedCustomers();
  seedStaff();
  seedTransactions();
  seedCredentials();
  seedPoints();
}
