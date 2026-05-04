/**
 * @deprecated Thin façade kept for backwards compatibility.
 *
 * All persistence now flows through `src/services/dbAdapter.ts`. This
 * file simply translates the legacy `storage.{get,set,remove}(KEY, ...)`
 * calls into the new adapter so older callers keep working during the
 * incremental migration.
 *
 * TODO(Supabase): delete this file once every caller imports `db` from
 * `@/services/dbAdapter`.
 */
import { db } from '../dbAdapter';

// Map physical localStorage key → logical table name expected by db.
const PHYSICAL_TO_TABLE: Record<string, string> = {
  gaviota_customers: 'customers',
  gaviota_staff: 'staff_profiles',
  gaviota_credentials: 'credentials',
  gaviota_campaigns: 'campaigns',
  gaviota_branches: 'branches',
  gaviota_transactions: 'transactions',
  gaviota_redemption_requests: 'redemption_requests',
  gaviota_customer_campaign_points: 'customer_campaign_points',
  gaviota_consents: 'consents',
  gaviota_audit_logs: 'audit_logs',
  gaviota_current_customer: 'session_customer',
  gaviota_current_staff: 'session_staff',
};

function tableFor(key: string): string {
  return PHYSICAL_TO_TABLE[key] ?? key.replace(/^gaviota_/, '');
}

export const storage = {
  get<T>(key: string, fallback: T): T {
    return db.readValueSync<T>(tableFor(key), fallback);
  },
  set<T>(key: string, value: T): void {
    db.writeValueSync<T>(tableFor(key), value);
  },
  remove(key: string): void {
    db.removeSync(tableFor(key));
  },
};
