/**
 * Customer points service — Supabase-backed (Phase 5).
 *
 * Source of truth: `public.customer_points` (PK = (customer_id, campaign_id)).
 * Hybrid pattern:
 *  - Sync getters read from an in-memory cache (UI is still sync).
 *  - Mutations apply optimistically to the cache + localStorage mirror,
 *    then persist to Supabase in the background (only when both ids are
 *    real UUIDs; legacy `cust-xxx` ids stay in cache only).
 *
 * The legacy `customer_campaign_points` localStorage table is preserved
 * as a transitional fallback until every customer is auth-backed.
 */
import { supabase } from '@/integrations/supabase/client';
import { db, TABLES } from './dbAdapter';
import type { Customer, CustomerCampaignPoints } from '@/lib/types';

const TABLE = 'customer_points';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isUuid = (v: string) => UUID_RE.test(v);

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

function loadLegacyCache(): CustomerCampaignPoints[] {
  return db.readSync<CustomerCampaignPoints>(TABLES.customerCampaignPoints);
}

function persistLegacyCache(): void {
  db.writeSync(TABLES.customerCampaignPoints, cache);
}

/** Hydrate cache from Supabase (merged on top of legacy localStorage rows). */
export async function hydrateCustomerPoints(): Promise<CustomerCampaignPoints[]> {
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      cache = loadLegacyCache();
      const { data, error } = await supabase.from(TABLE).select('*');
      if (error) throw error;
      const remote = (data as PointsRow[] | null) ?? [];
      const map = new Map<string, CustomerCampaignPoints>();
      for (const r of cache) map.set(r.id, r);
      for (const r of remote) {
        const id = rowId(r.customer_id, r.campaign_id);
        map.set(id, {
          id,
          customerId: r.customer_id,
          campaignId: r.campaign_id,
          points: r.points,
          updatedAt: r.updated_at,
        });
      }
      cache = Array.from(map.values());
      persistLegacyCache();
      hydrated = true;
      return cache;
    } catch (err) {
      console.error('[customerPoints] hydrate failed', err);
      cache = loadLegacyCache();
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

function ensureCacheLoaded(): void {
  if (cache.length === 0) cache = loadLegacyCache();
}

export function getPointsRow(customerId: string, campaignId: string): CustomerCampaignPoints | undefined {
  ensureCacheLoaded();
  return cache.find(r => r.id === rowId(customerId, campaignId));
}

export function getPoints(customerId: string, campaignId: string): number {
  return getPointsRow(customerId, campaignId)?.points ?? 0;
}

export function getPointsByCustomer(customerId: string): Record<string, number> {
  ensureCacheLoaded();
  const out: Record<string, number> = {};
  for (const r of cache) if (r.customerId === customerId) out[r.campaignId] = r.points;
  return out;
}

async function persistPointsAsync(customerId: string, campaignId: string, points: number): Promise<void> {
  if (!isUuid(customerId) || !isUuid(campaignId)) return; // legacy ids stay local-only
  const { error } = await supabase
    .from(TABLE)
    .upsert(
      { customer_id: customerId, campaign_id: campaignId, points } as never,
      { onConflict: 'customer_id,campaign_id' } as never,
    );
  if (error) console.error('[customerPoints] upsert failed', error, { customerId, campaignId, points });
}

export function setPoints(customerId: string, campaignId: string, points: number): void {
  if (!isUuid(customerId)) {
    console.warn('[customerPoints] setPoints rejected non-uuid customerId (legacy)', { customerId, campaignId });
    return;
  }
  ensureCacheLoaded();
  const id = rowId(customerId, campaignId);
  const idx = cache.findIndex(r => r.id === id);
  const next: CustomerCampaignPoints = {
    id,
    customerId,
    campaignId,
    points,
    updatedAt: new Date().toISOString(),
  };
  if (idx >= 0) cache[idx] = next;
  else cache.push(next);
  persistLegacyCache();
  void persistPointsAsync(customerId, campaignId, points);
}

export function clearAllPoints(): void {
  cache = [];
  db.writeSync<CustomerCampaignPoints[]>(TABLES.customerCampaignPoints, []);
}

/** One-shot helper kept for compatibility with bootstrap seeding. */
export function importFromCustomers(customers: Customer[]): void {
  const existing = loadLegacyCache();
  if (existing.length > 0) {
    cache = existing;
    return;
  }
  const rows: CustomerCampaignPoints[] = [];
  for (const c of customers) {
    const map = c.pointsByCampaign || {};
    for (const [campaignId, points] of Object.entries(map)) {
      if (typeof points === 'number') {
        rows.push({
          id: rowId(c.id, campaignId),
          customerId: c.id,
          campaignId,
          points,
          updatedAt: c.createdAt || new Date().toISOString(),
        });
      }
    }
  }
  if (rows.length > 0) {
    cache = rows;
    db.writeSync(TABLES.customerCampaignPoints, rows);
  }
}
