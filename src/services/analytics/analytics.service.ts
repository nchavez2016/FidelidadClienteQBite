/**
 * Analytics aggregation layer.
 *
 * Today: pure in-memory aggregations over local transactions/customers.
 * Tomorrow (Supabase): each function maps to a SQL view or RPC. The
 * shape of the returned objects is the analytics contract — UI components
 * (DashboardTab, ReportsTab, StaffShiftStats) consume them and stay
 * stable when the data source moves server-side.
 */
import { getTransactions } from '../transactions.service';
import { getCustomers } from '../customers.service';
import { getCampaignById } from '../campaigns.service';
import { getCustomerPoints, getCustomerTotalPoints } from '../customers.service';
import type { Customer, Transaction, CommentCategory } from '@/lib/types';

export interface AnalyticsFilter {
  branchCampaignId?: string;
  dateFrom?: string;
  dateTo?: string;
}

export interface KpiSummary {
  totalVisits: number;
  totalPoints: number;
  totalRedeemed: number;
  totalReversals: number;
  pendingPoints: number;
}

function withinFilter(t: Transaction, f: AnalyticsFilter): boolean {
  if (f.branchCampaignId && t.campaignId !== f.branchCampaignId) return false;
  if (f.dateFrom && new Date(t.createdAt) < new Date(f.dateFrom)) return false;
  if (f.dateTo && new Date(t.createdAt) > new Date(`${f.dateTo}T23:59:59`)) return false;
  return true;
}

export function getFilteredTransactions(filter: AnalyticsFilter): Transaction[] {
  return getTransactions().filter(t => withinFilter(t, filter));
}

export function getKpiSummary(filter: AnalyticsFilter): KpiSummary {
  const tx = getFilteredTransactions(filter);
  const customers = getCustomers();
  const accumulations = tx.filter(t => t.type === 'accumulation' && !t.isReversed);
  const redemptions = tx.filter(t => t.type === 'redemption');
  const reversals = tx.filter(t => t.type === 'reversal');
  const pointsOf = (c: Customer) =>
    filter.branchCampaignId
      ? getCustomerPoints(c, filter.branchCampaignId)
      : getCustomerTotalPoints(c);
  return {
    totalVisits: accumulations.length,
    totalPoints: accumulations.reduce((s, t) => s + t.points, 0),
    totalRedeemed: redemptions.length,
    totalReversals: reversals.length,
    pendingPoints: customers.reduce((s, c) => s + pointsOf(c), 0),
  };
}

/** Visit count for the symmetric previous period (used for trend arrows). */
export function getPreviousPeriodVisits(filter: AnalyticsFilter): number | null {
  if (!filter.dateFrom || !filter.dateTo) return null;
  const from = new Date(filter.dateFrom);
  const to = new Date(`${filter.dateTo}T23:59:59`);
  const rangeMs = to.getTime() - from.getTime();
  const prevFrom = new Date(from.getTime() - rangeMs);
  const prevTo = new Date(from.getTime() - 1);
  return getTransactions().filter(t => {
    if (filter.branchCampaignId && t.campaignId !== filter.branchCampaignId) return false;
    const d = new Date(t.createdAt);
    return t.type === 'accumulation' && !t.isReversed && d >= prevFrom && d <= prevTo;
  }).length;
}

export interface PeakHourBucket { hour: number; count: number }

export function getPeakHours(filter: AnalyticsFilter): PeakHourBucket[] {
  const buckets = Array.from({ length: 24 }, (_, i) => ({ hour: i, count: 0 }));
  for (const t of getFilteredTransactions(filter)) {
    if (t.type !== 'accumulation' || t.isReversed) continue;
    buckets[new Date(t.createdAt).getHours()].count++;
  }
  return buckets.filter(b => b.count > 0);
}

export interface GenderBreakdown {
  gender: 'masculino' | 'femenino' | 'otro';
  count: number;
  visits: number;
  canjes: number;
  pctCanje: string;
}

export function getGenderBreakdown(filter: AnalyticsFilter): GenderBreakdown[] {
  const customers = getCustomers();
  const tx = getFilteredTransactions(filter);
  const accumulations = tx.filter(t => t.type === 'accumulation' && !t.isReversed);
  const redemptions = tx.filter(t => t.type === 'redemption');
  return (['masculino', 'femenino', 'otro'] as const).map(g => {
    const ids = new Set(customers.filter(c => c.gender === g).map(c => c.id));
    const visits = accumulations.filter(t => ids.has(t.customerId)).length;
    const canjes = redemptions.filter(t => ids.has(t.customerId)).length;
    return {
      gender: g,
      count: customers.filter(c => c.gender === g).length,
      visits,
      canjes,
      pctCanje: visits > 0 ? ((canjes / visits) * 100).toFixed(1) : '0.0',
    };
  });
}

export function getCommentCounts(
  filter: AnalyticsFilter,
): Record<CommentCategory, number> {
  const tx = getFilteredTransactions(filter);
  const cats: CommentCategory[] = [
    'positive', 'complaint', 'observation', 'promotion', 'suggestion', 'other',
  ];
  return Object.fromEntries(
    cats.map(c => [c, tx.filter(t => t.commentCategory === c).length]),
  ) as Record<CommentCategory, number>;
}

/** Distribution of customers across milestone tiers for a campaign. */
export interface FunnelTier { label: string; count: number }

export function getFunnel(campaignId?: string): FunnelTier[] {
  const campaign = campaignId ? getCampaignById(campaignId) : undefined;
  if (!campaign) return [];
  const customers = getCustomers();
  const pointsOf = (c: Customer) =>
    campaignId ? getCustomerPoints(c, campaignId) : getCustomerTotalPoints(c);
  const milestones = [...campaign.milestones].sort(
    (a, b) => a.requiredPoints - b.requiredPoints,
  );
  const tiers: FunnelTier[] = [
    { label: 'Sin actividad (0 pts)', count: customers.filter(c => pointsOf(c) === 0).length },
  ];
  for (let i = 0; i < milestones.length; i++) {
    const min = i === 0 ? 1 : milestones[i - 1].requiredPoints;
    const max = milestones[i].requiredPoints;
    const label = `${min} – ${max - 1} pts`;
    tiers.push({
      label,
      count: customers.filter(c => {
        const p = pointsOf(c);
        return p >= min && p < max;
      }).length,
    });
  }
  const last = milestones[milestones.length - 1].requiredPoints;
  tiers.push({
    label: `≥ ${last} pts (completos)`,
    count: customers.filter(c => pointsOf(c) >= last).length,
  });
  return tiers;
}
