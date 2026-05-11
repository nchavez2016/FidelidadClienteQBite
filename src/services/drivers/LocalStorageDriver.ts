/**
 * LocalStorageDriver — current persistence backend.
 *
 * Implements both the async `DbDriver` contract and the transitional
 * `SyncKeyValueDriver` helpers, backed by `window.localStorage` under the
 * legacy `gaviota_*` physical keys (no data migration required).
 *
 * When swapping to Supabase, instantiate a different driver in
 * `dbAdapter.ts` — no other file should need changes.
 */
import type { DbDriver, RowLike, SyncKeyValueDriver } from './DbDriver';

/** Logical table name → physical localStorage key. */
const KEY_MAP: Record<string, string> = {
  customers: 'gaviota_customers',
  staff_profiles: 'gaviota_staff',
  credentials: 'gaviota_credentials',
  campaigns: 'gaviota_campaigns',
  branches: 'gaviota_branches',
  redemption_requests: 'gaviota_redemption_requests',
  customer_campaign_points: 'gaviota_customer_campaign_points',
  consents: 'gaviota_consents',
  audit_logs: 'gaviota_audit_logs',
  session_customer: 'gaviota_current_customer',
  session_staff: 'gaviota_current_staff',
};

function physicalKey(table: string): string {
  return KEY_MAP[table] ?? `gaviota_${table}`;
}

function rawRead<T>(table: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(physicalKey(table));
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}
function rawWrite<T>(table: string, value: T): void {
  localStorage.setItem(physicalKey(table), JSON.stringify(value));
}
function rawRemove(table: string): void {
  localStorage.removeItem(physicalKey(table));
}

function generateId(table: string): string {
  return `${table}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

export class LocalStorageDriver implements DbDriver, SyncKeyValueDriver {
  // ===== Async DbDriver =====

  async getAll<T extends RowLike = RowLike>(table: string): Promise<T[]> {
    return rawRead<T[]>(table, []);
  }

  async getById<T extends RowLike = RowLike>(table: string, id: string): Promise<T | null> {
    const list = rawRead<T[]>(table, []);
    return list.find(r => r.id === id) ?? null;
  }

  async insert<T extends RowLike>(table: string, row: T): Promise<T> {
    const list = rawRead<T[]>(table, []);
    const withId = (row.id ? row : { ...row, id: generateId(table) }) as T;
    rawWrite(table, [...list, withId]);
    return withId;
  }

  async update<T extends RowLike>(table: string, id: string, patch: Partial<T>): Promise<T | null> {
    const list = rawRead<T[]>(table, []);
    const idx = list.findIndex(r => r.id === id);
    if (idx < 0) return null;
    list[idx] = { ...list[idx], ...patch } as T;
    rawWrite(table, list);
    return list[idx];
  }

  async delete(table: string, id: string): Promise<void> {
    const list = rawRead<RowLike[]>(table, []);
    rawWrite(table, list.filter(r => r.id !== id));
  }

  // ===== Transitional SyncKeyValueDriver =====

  readSync<T = unknown>(table: string): T[] {
    return rawRead<T[]>(table, []);
  }
  writeSync<T>(table: string, rows: T[]): void {
    rawWrite(table, rows);
  }
  readValueSync<T>(table: string, fallback: T): T {
    return rawRead<T>(table, fallback);
  }
  writeValueSync<T>(table: string, value: T): void {
    rawWrite(table, value);
  }
  removeSync(table: string): void {
    rawRemove(table);
  }
}