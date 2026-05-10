/**
 * dbAdapter — single abstraction over the persistence layer.
 *
 * The concrete backend lives in `src/services/drivers/`. Today the
 * adapter is wired to `LocalStorageDriver`; swapping to Supabase will
 * be a one-line change here (plus a `SupabaseDriver` implementation).
 *
 * The exposed `db` object preserves the EXACT shape used by services
 * today (async CRUD + transitional sync helpers) so no caller changes.
 *
 * TODO(Supabase):
 *   - Add `SupabaseDriver implements DbDriver` and swap the instance below.
 *   - Migrate callers to the async API and drop the sync helpers.
 */
import type { DbDriver, SyncKeyValueDriver, RowLike } from './drivers/DbDriver';
import { LocalStorageDriver } from './drivers/LocalStorageDriver';

/** Logical table names. Map 1:1 to a future Supabase table. */
export const TABLES = {
  customers: 'customers',                          // RLS: self-read; admin all
  staff: 'staff_profiles',                         // RLS: admin all
  credentials: 'credentials',                       // TODO: deleted once Supabase Auth handles passwords
  campaigns: 'campaigns',                          // RLS: public read (active), admin write
  branches: 'branches',                            // RLS: public read, admin write
  transactions: 'transactions',                    // RLS: self-read; staff campaign-scoped read
  redemptionRequests: 'redemption_requests',       // RLS: self read/insert; staff campaign-scoped
  customerCampaignPoints: 'customer_campaign_points', // RLS: self-read; staff campaign-scoped
  consents: 'consents',                            // RLS: self read/insert/revoke
  auditLogs: 'audit_logs',                         // RLS: admin read only; insert via SECURITY DEFINER
  // Session slots (single-value, not collections) — replaced by Supabase Auth session.
  sessionCustomer: 'session_customer',
  sessionStaff: 'session_staff',
} as const;

export type TableName = (typeof TABLES)[keyof typeof TABLES];

/**
 * Active driver instance.
 * Swap this single line to migrate to Supabase (`new SupabaseDriver(...)`).
 * The driver must implement `DbDriver`; it MAY also implement
 * `SyncKeyValueDriver` while sync helpers are still in use.
 */
const driver: DbDriver & SyncKeyValueDriver = new LocalStorageDriver();

/**
 * Public persistence API consumed by services.
 *
 * Shape preserved for backwards compatibility:
 *   - Async CRUD: get / insert / update / delete  (DbDriver-shaped)
 *   - Sync helpers: readSync / writeSync / readValueSync / writeValueSync /
 *     removeSync (transitional, scheduled for removal)
 *
 * Note: `db.get` is kept as the legacy async-collection alias for
 * `driver.getAll`. New code should prefer `driver.getAll` / `getById`.
 */
export const db = {
  // ===== Async (DbDriver) =====
  get: <T extends RowLike = RowLike>(table: string): Promise<T[]> => driver.getAll<T>(table),
  getAll: <T extends RowLike = RowLike>(table: string): Promise<T[]> => driver.getAll<T>(table),
  getById: <T extends RowLike = RowLike>(table: string, id: string): Promise<T | null> =>
    driver.getById<T>(table, id),
  insert: <T extends RowLike>(table: string, row: T): Promise<T> => driver.insert<T>(table, row),
  update: <T extends RowLike>(table: string, id: string, patch: Partial<T>): Promise<T | null> =>
    driver.update<T>(table, id, patch),
  delete: (table: string, id: string): Promise<void> => driver.delete(table, id),

  // ===== Transitional sync helpers (SyncKeyValueDriver) =====
  readSync: <T = unknown>(table: string): T[] => driver.readSync<T>(table),
  writeSync: <T>(table: string, rows: T[]): void => driver.writeSync<T>(table, rows),
  readValueSync: <T>(table: string, fallback: T): T => driver.readValueSync<T>(table, fallback),
  writeValueSync: <T>(table: string, value: T): void => driver.writeValueSync<T>(table, value),
  removeSync: (table: string): void => driver.removeSync(table),
};

export type { DbDriver, SyncKeyValueDriver, RowLike } from './drivers/DbDriver';
