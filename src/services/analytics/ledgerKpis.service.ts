/**
 * Phase 4 — server-side KPIs sourced exclusively from `point_transactions`.
 *
 * Read-only aggregator for the Dashboard. Uses RLS-bound queries (admin/cashier
 * only). No new tables, no writes. Windows: today / 7d / 30d.
 */
import { supabase } from '@/integrations/supabase/client';

export type KpiWindow = 'today' | '7d' | '30d';

export interface LedgerKpis {
  issued: number;        // sum of positive deltas in earn/bonus
  redeemed: number;      // |sum of redeem deltas|
  reversals: number;     // count of reversal rows
  activeCustomers: number; // distinct customer_id with any tx in window
}

export interface TopCustomerRow { customer_id: string; points: number; tx_count: number; }
export interface TopCampaignRow { campaign_id: string; points: number; tx_count: number; }
export interface CashierActivityRow { actor_id: string; tx_count: number; issued: number; redeemed: number; }

function windowStart(w: KpiWindow): string {
  const d = new Date();
  if (w === 'today') {
    d.setHours(0, 0, 0, 0);
  } else if (w === '7d') {
    d.setDate(d.getDate() - 7);
  } else {
    d.setDate(d.getDate() - 30);
  }
  return d.toISOString();
}

interface LedgerRow {
  id: string;
  customer_id: string;
  campaign_id: string;
  kind: string;
  points_delta: number;
  actor_id: string | null;
  created_at: string;
}

async function fetchWindow(w: KpiWindow, branchId?: string): Promise<LedgerRow[]> {
  let q = supabase
    .from('point_transactions')
    .select('id, customer_id, campaign_id, kind, points_delta, actor_id, created_at')
    .gte('created_at', windowStart(w))
    .order('created_at', { ascending: false })
    .limit(5000);
  if (branchId) q = q.eq('branch_id', branchId);
  const { data, error } = await q;
  if (error) {
    console.error('[ledgerKpis] fetchWindow failed', error);
    return [];
  }
  return (data ?? []) as LedgerRow[];
}

export async function getLedgerKpis(w: KpiWindow, branchId?: string): Promise<LedgerKpis> {
  const rows = await fetchWindow(w, branchId);
  let issued = 0, redeemed = 0, reversals = 0;
  const customers = new Set<string>();
  for (const r of rows) {
    customers.add(r.customer_id);
    if (r.kind === 'earn' || r.kind === 'bonus') issued += Math.max(0, r.points_delta);
    else if (r.kind === 'redeem') redeemed += Math.abs(Math.min(0, r.points_delta));
    else if (r.kind === 'reversal') reversals += 1;
  }
  return { issued, redeemed, reversals, activeCustomers: customers.size };
}

function topBy<K extends string>(
  rows: LedgerRow[],
  keyFn: (r: LedgerRow) => K | null,
  pointsFn: (r: LedgerRow) => number,
  limit = 10,
): { key: K; points: number; tx_count: number }[] {
  const acc = new Map<K, { points: number; tx_count: number }>();
  for (const r of rows) {
    const k = keyFn(r);
    if (!k) continue;
    const cur = acc.get(k) ?? { points: 0, tx_count: 0 };
    cur.points += pointsFn(r);
    cur.tx_count += 1;
    acc.set(k, cur);
  }
  return Array.from(acc.entries())
    .map(([key, v]) => ({ key, ...v }))
    .sort((a, b) => b.points - a.points)
    .slice(0, limit);
}

export async function getTopCustomers(w: KpiWindow, branchId?: string, limit = 10): Promise<TopCustomerRow[]> {
  const rows = await fetchWindow(w, branchId);
  // Top by issued points only.
  const earns = rows.filter(r => r.kind === 'earn' || r.kind === 'bonus');
  return topBy(earns, r => r.customer_id, r => Math.max(0, r.points_delta), limit)
    .map(({ key, points, tx_count }) => ({ customer_id: key, points, tx_count }));
}

export async function getTopCampaigns(w: KpiWindow, branchId?: string, limit = 10): Promise<TopCampaignRow[]> {
  const rows = await fetchWindow(w, branchId);
  const earns = rows.filter(r => r.kind === 'earn' || r.kind === 'bonus');
  return topBy(earns, r => r.campaign_id, r => Math.max(0, r.points_delta), limit)
    .map(({ key, points, tx_count }) => ({ campaign_id: key, points, tx_count }));
}

export async function getActivityByCashier(w: KpiWindow, branchId?: string, limit = 20): Promise<CashierActivityRow[]> {
  const rows = await fetchWindow(w, branchId);
  const acc = new Map<string, CashierActivityRow>();
  for (const r of rows) {
    if (!r.actor_id) continue;
    const cur = acc.get(r.actor_id) ?? { actor_id: r.actor_id, tx_count: 0, issued: 0, redeemed: 0 };
    cur.tx_count += 1;
    if (r.kind === 'earn' || r.kind === 'bonus') cur.issued += Math.max(0, r.points_delta);
    else if (r.kind === 'redeem') cur.redeemed += Math.abs(Math.min(0, r.points_delta));
    acc.set(r.actor_id, cur);
  }
  return Array.from(acc.values()).sort((a, b) => b.tx_count - a.tx_count).slice(0, limit);
}