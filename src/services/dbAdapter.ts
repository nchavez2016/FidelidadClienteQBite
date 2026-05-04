/**
 * dbAdapter — single abstraction over the persistence layer.
 *
 * Today: backed by localStorage (same physical keys as the legacy
 * `storage` adapter, so no data migration is needed).
 * Tomorrow (Supabase): swap the bodies of the methods below for the
 * `@supabase/supabase-js` client. Table names map 1:1.
 *
 * The async API is the future-facing contract (Promise<T>, Supabase-shaped).
 * The sync helpers exist ONLY to keep the current UI/services working
 * during the transition; they will be removed once components consume the
 * async API via TanStack Query.
 *
 * TODO(Supabase):
 *   - Replace LocalDriver with SupabaseDriver.
 *   - Drop sync helpers and migrate callers to async/Promise.
 *   - Apply RLS policies per table (see comments under TABLES).
 */

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
 * Map logical table name → physical localStorage key.
 * Preserves legacy keys so existing data is read in place.
 */
const KEY_MAP: Record<string, string> = {
  customers: 'gaviota_customers',
  staff_profiles: 'gaviota_staff',
  credentials: 'gaviota_credentials',
  campaigns: 'gaviota_campaigns',
  branches: 'gaviota_branches',
  transactions: 'gaviota_transactions',
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

// ---------- low-level local driver (sync) ----------
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

interface RowLike {
  id: string;
  [k: string]: unknown;
}

export const db = {
  // ===== Async, Supabase-shaped =====

  /** Read all rows from a collection table. */
  async get<T extends RowLike = RowLike>(table: string): Promise<T[]> {
    return rawRead<T[]>(table, []);
  },

  /** Insert a row; returns the inserted row. Generates id if missing. */
  async insert<T extends RowLike>(table: string, row: T): Promise<T> {
    const list = rawRead<T[]>(table, []);
    const withId = (row.id ? row : { ...row, id: `${table}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}` }) as T;
    rawWrite(table, [...list, withId]);
    return withId;
  },

  /** Update a row by id; returns the updated row, or null if not found. */
  async update<T extends RowLike>(table: string, id: string, patch: Partial<T>): Promise<T | null> {
    const list = rawRead<T[]>(table, []);
    const idx = list.findIndex(r => r.id === id);
    if (idx < 0) return null;
    list[idx] = { ...list[idx], ...patch } as T;
    rawWrite(table, list);
    return list[idx];
  },

  /** Delete a row by id. */
  async delete(table: string, id: string): Promise<void> {
    const list = rawRead<RowLike[]>(table, []);
    rawWrite(table, list.filter(r => r.id !== id));
  },

  // ===== Sync helpers (TRANSITIONAL — remove after async migration) =====

  /** @transitional Sync collection read. */
  readSync<T = unknown>(table: string): T[] {
    return rawRead<T[]>(table, []);
  },
  /** @transitional Sync collection write (replace whole array). */
  writeSync<T>(table: string, rows: T[]): void {
    rawWrite(table, rows);
  },
  /** @transitional Single-value read (sessions). */
  readValueSync<T>(table: string, fallback: T): T {
    return rawRead<T>(table, fallback);
  },
  /** @transitional Single-value write (sessions). */
  writeValueSync<T>(table: string, value: T): void {
    rawWrite(table, value);
  },
  /** @transitional Remove a value/collection. */
  removeSync(table: string): void {
    rawRemove(table);
  },
};
