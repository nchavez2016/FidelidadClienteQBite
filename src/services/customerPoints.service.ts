/**
 * Normalized points store: one row per (customer, campaign).
 *
 * Source of truth replacing the embedded `customer.pointsByCampaign`.
 * The embedded field is still synchronized as a denormalized cache so the
 * existing UI (which reads `customer.pointsByCampaign[id]`) keeps working
 * untouched during the transition.
 *
 * TODO(Supabase): map to `public.customer_campaign_points` (PK = (customer_id, campaign_id))
 * and drop the cache write below. RLS: customer reads own rows; staff reads
 * rows for campaigns they operate.
 */
import { db, TABLES } from './dbAdapter';
import type { Customer, CustomerCampaignPoints } from '@/lib/types';

function rowId(customerId: string, campaignId: string): string {
  return `${customerId}:${campaignId}`;
}

function allRows(): CustomerCampaignPoints[] {
  return db.readSync<CustomerCampaignPoints>(TABLES.customerCampaignPoints);
}

export function getPointsRow(customerId: string, campaignId: string): CustomerCampaignPoints | undefined {
  return allRows().find(r => r.id === rowId(customerId, campaignId));
}

export function getPoints(customerId: string, campaignId: string): number {
  return getPointsRow(customerId, campaignId)?.points ?? 0;
}

export function getPointsByCustomer(customerId: string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const r of allRows()) if (r.customerId === customerId) out[r.campaignId] = r.points;
  return out;
}

export function setPoints(customerId: string, campaignId: string, points: number): void {
  const list = allRows();
  const id = rowId(customerId, campaignId);
  const idx = list.findIndex(r => r.id === id);
  const next: CustomerCampaignPoints = {
    id,
    customerId,
    campaignId,
    points,
    updatedAt: new Date().toISOString(),
  };
  if (idx >= 0) list[idx] = next;
  else list.push(next);
  db.writeSync(TABLES.customerCampaignPoints, list);
}

export function clearAllPoints(): void {
  db.writeSync<CustomerCampaignPoints[]>(TABLES.customerCampaignPoints, []);
}

/** One-shot migration helper: hydrate from legacy embedded `pointsByCampaign`. */
export function importFromCustomers(customers: Customer[]): void {
  const existing = allRows();
  if (existing.length > 0) return; // already migrated
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
  if (rows.length > 0) db.writeSync(TABLES.customerCampaignPoints, rows);
}
