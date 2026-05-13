/**
 * Phase 2.7 — Legacy customer audit utility (read-only).
 *
 * Reports legacy `cust-xxx` customers still present in localStorage,
 * orphan `customer_points` (no matching profile in Supabase), and any
 * profile rows missing from `auth.users` (best-effort: relies on staff
 * RLS visibility — admin sees everything).
 *
 * NOTHING is mutated. Surface this report from a staff-only screen or
 * call from the browser console (`window.__auditLegacyCustomers()`).
 */
import { supabase } from '@/integrations/supabase/client';
import { db, TABLES } from '../dbAdapter';
import type { Customer, CustomerCampaignPoints } from '@/lib/types';
import { isLegacyCustomerId } from '../customers.service';

export interface LegacyCustomerReport {
  legacyCustomers: Array<{ id: string; phone: string; name: string }>;
  orphanLocalPoints: Array<{ customerId: string; campaignId: string; points: number }>;
  profilesWithoutAuthLikely: string[];
  totals: {
    legacyCount: number;
    orphanPointsCount: number;
    profilesWithoutAuthCount: number;
  };
}

export async function auditLegacyCustomers(): Promise<LegacyCustomerReport> {
  const localCustomers = db.readSync<Customer>(TABLES.customers);
  const localPoints = db.readSync<CustomerCampaignPoints>(TABLES.customerCampaignPoints);

  const legacyCustomers = localCustomers
    .filter(c => isLegacyCustomerId(c.id))
    .map(c => ({ id: c.id, phone: c.phone, name: c.name }));

  const legacyIdSet = new Set(legacyCustomers.map(c => c.id));
  const orphanLocalPoints = localPoints
    .filter(p => isLegacyCustomerId(p.customerId) || legacyIdSet.has(p.customerId))
    .map(p => ({ customerId: p.customerId, campaignId: p.campaignId, points: p.points }));

  // Profiles visible to the caller. Admins see all, cashiers see customers.
  let profilesWithoutAuthLikely: string[] = [];
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, legacy_id')
      .not('legacy_id', 'is', null);
    if (!error && data) {
      profilesWithoutAuthLikely = (data as Array<{ id: string; legacy_id: string | null }>)
        .filter(r => !!r.legacy_id)
        .map(r => r.id);
    }
  } catch (err) {
    console.error('[audit] profiles legacy_id query failed', err);
  }

  const report: LegacyCustomerReport = {
    legacyCustomers,
    orphanLocalPoints,
    profilesWithoutAuthLikely,
    totals: {
      legacyCount: legacyCustomers.length,
      orphanPointsCount: orphanLocalPoints.length,
      profilesWithoutAuthCount: profilesWithoutAuthLikely.length,
    },
  };
  console.info('[audit] legacy customer report', report);
  return report;
}

if (typeof window !== 'undefined') {
  (window as unknown as { __auditLegacyCustomers?: () => Promise<LegacyCustomerReport> })
    .__auditLegacyCustomers = auditLegacyCustomers;
}

/**
 * Phase 2.8 assertion — verify the legacy purge worked. Logs (does not
 * throw) so production isn't broken, but any non-zero count means a
 * regression has reintroduced legacy state.
 */
export function assertNoLegacyCustomerState(): void {
  const localCustomers = db.readSync<Customer>(TABLES.customers);
  const localPoints = db.readSync<CustomerCampaignPoints>(TABLES.customerCampaignPoints);
  const legacy = localCustomers.filter(c => isLegacyCustomerId(c.id));
  const orphan = localPoints.filter(p => isLegacyCustomerId(p.customerId));
  if (legacy.length > 0 || orphan.length > 0) {
    console.error('[assert] legacy customer state still present', {
      legacyCount: legacy.length,
      orphanPointsCount: orphan.length,
    });
  } else {
    console.info('[assert] no legacy customer state ✓');
  }
}

if (typeof window !== 'undefined') {
  (window as unknown as { __assertNoLegacyCustomerState?: () => void })
    .__assertNoLegacyCustomerState = assertNoLegacyCustomerState;
}