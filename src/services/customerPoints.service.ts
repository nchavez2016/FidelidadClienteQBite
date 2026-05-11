/**
 * Customer points service — Phase 3.2: READ-ONLY cache derived from the ledger.
 *
 * Source of truth: `public.customer_points`, mutated exclusively by the
 * ledger trigger (`apply_point_transaction`) attached to `point_transactions`
 * inserts. The frontend MUST NOT insert/update/upsert/delete this table.
 *
 * This service exposes:
 *   - hydrateCustomerPoints()   — pull current balances from Supabase
 *   - getPoints / getPointsRow / getPointsByCustomer  — sync readers
 *   - applyLedgerBalance()      — in-memory cache reconciliation after an
 *                                 RPC returns a fresh balance_after.
 *
 * All write helpers (setPoints, clearAllPoints, importFromCustomers,
 * persistPointsAsync) have been removed. Mutations live in
 * `pointsLedger.service.ts` (earn/redeem/adjust/reverse RPCs).
 */
import { supabase } from '@/integrations/supabase/client';
import type { CustomerCampaignPoints } from '@/lib/types';

const TABLE = 'customer_points';

interface PointsRow {
  customer_id: string;
  campaign_id: string;
  points: number;
  updated_at: string;
}

function rowId(customerId: string, campaignId: string): string {
  return `${customerId}:${campaignId}`;
}

let cache: CustomerCampaignPoints[] = [];
let hydrated = false;
let inflight: Promise<CustomerCampaignPoints[]> | null = null;

/** Hydrate cache from Supabase. RLS scopes rows to the caller. */
export async function hydrateCustomerPoints(): Promise<CustomerCampaignPoints[]> {
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      const { data, error } = await supabase.from(TABLE).select('*');
      if (error) throw error;
      const remote = (data as PointsRow[] | null) ?? [];
      cache = remote.map(r => ({
        id: rowId(r.customer_id, r.campaign_id),
        customerId: r.customer_id,
        campaignId: r.campaign_id,
        points: r.points,
        updatedAt: r.updated_at,
      }));
      hydrated = true;
      return cache;
    } catch (err) {
      console.error('[customerPoints] hydrate failed', err);
      return cache;
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

export function isCustomerPointsHydrated(): boolean {
  return hydrated;
}

export function getPointsRow(customerId: string, campaignId: string): CustomerCampaignPoints | undefined {
  return cache.find(r => r.id === rowId(customerId, campaignId));
}

export function getPoints(customerId: string, campaignId: string): number {
  return getPointsRow(customerId, campaignId)?.points ?? 0;
}

export function getPointsByCustomer(customerId: string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const r of cache) if (r.customerId === customerId) out[r.campaignId] = r.points;
  return out;
}

/**
 * Reconcile the in-memory cache after a ledger RPC returns balance_after.
 * This is NOT a write to the source of truth — the trigger already updated
 * `customer_points`. We only mirror the new value so sync UI readers see it
 * immediately without waiting for a re-hydrate.
 */
export function applyLedgerBalance(
  customerId: string,
  campaignId: string,
  balanceAfter: number,
): void {
  const id = rowId(customerId, campaignId);
  const idx = cache.findIndex(r => r.id === id);
  const next: CustomerCampaignPoints = {
    id,
    customerId,
    campaignId,
    points: balanceAfter,
    updatedAt: new Date().toISOString(),
  };
  if (idx >= 0) cache[idx] = next;
  else cache.push(next);
}

/** @deprecated Phase 3.2 — direct writes are forbidden. No-op + warning. */
export function setPoints(customerId: string, campaignId: string, _points: number): void {
  console.warn(
    '[customerPoints] @deprecated setPoints is a no-op. Use ledger RPCs (earn/redeem/adjust/reverse).',
    { customerId, campaignId },
  );
}

/** @deprecated Phase 3.2 — clearing balances must go through admin RPCs. */
export function clearAllPoints(): void {
  console.warn('[customerPoints] @deprecated clearAllPoints is a no-op. Use adjust_points RPC.');
  cache = [];
}
