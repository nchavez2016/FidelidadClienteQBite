/**
 * Campaigns domain service — Supabase-backed (Phase 4).
 *
 * Source of truth: `public.campaigns` (with `milestones` and `bonus_rules`
 * stored as JSONB columns). The service maintains an in-memory cache so
 * existing sync call-sites in the UI keep working while we migrate.
 * Mutations are optimistic and persisted to Supabase in the background.
 */
import { Campaign, Milestone, BonusRule, CampaignStatus } from '@/lib/types';
import { supabase } from '@/integrations/supabase/client';
import { supabaseDriver } from './drivers/SupabaseDriver';
import {
  getBranches,
  getBranchForCampaign,
  saveBranchAsync,
  hydrateBranches,
} from './branches.service';

const TABLE = 'campaigns';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isUuid = (v: string) => UUID_RE.test(v);

function newUuid(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  // RFC4122-ish fallback (only used when WebCrypto is unavailable).
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Defensive migration: any milestone/bonus rule whose `id` is not a real UUID
 * (legacy `m-*`, `bonus-*`, etc.) gets a freshly minted UUID before persisting.
 * The DB stores these as JSONB; the redeem RPC requires real UUIDs.
 */
function normalizeMilestoneIds(milestones: Milestone[] | undefined): Milestone[] {
  return (milestones ?? []).map(m =>
    isUuid(m.id) ? m : { ...m, id: newUuid() },
  );
}
function normalizeBonusRuleIds(rules: BonusRule[] | undefined): BonusRule[] {
  return (rules ?? []).map(r => (isUuid(r.id) ? r : { ...r, id: newUuid() }));
}

interface CampaignRow {
  id: string;
  branch_id: string;
  name: string;
  status: CampaignStatus;
  start_date: string;
  end_date: string;
  terms_and_conditions: string;
  milestones: Milestone[] | null;
  bonus_rules: BonusRule[] | null;
  min_order_amount: number | null;
  points_description: string | null;
  legacy_id: string | null;
  deleted_at: string | null;
  created_at: string;
  [k: string]: unknown;
}

let cache: Campaign[] = [];
let hydrated = false;
let inflight: Promise<Campaign[]> | null = null;

function fromRow(r: CampaignRow): Campaign {
  const branch = getBranches().find(b => b.id === r.branch_id);
  return {
    id: r.id,
    name: r.name,
    branchId: r.branch_id,
    branch: branch?.name ?? r.name,
    startDate: r.start_date,
    endDate: r.end_date,
    status: r.status,
    milestones: Array.isArray(r.milestones) ? r.milestones : [],
    bonusRules: Array.isArray(r.bonus_rules) ? r.bonus_rules : [],
    termsAndConditions: r.terms_and_conditions,
    minOrderAmount: r.min_order_amount ?? undefined,
    pointsDescription: r.points_description ?? undefined,
    createdAt: r.created_at,
  };
}

/**
 * Resolve a `branch_id` for a Campaign whose UI model only carries the
 * branch *name*. If no row matches, create one and return its id.
 */
async function resolveBranchId(campaign: Campaign): Promise<string> {
  await hydrateBranches();
  const name = (campaign.branch || campaign.name).trim();
  const existing = getBranches().find(
    b => b.name.toLowerCase() === name.toLowerCase(),
  );
  if (existing) return existing.id;

  const id = crypto.randomUUID();
  await saveBranchAsync({ id, name, legacyCampaignId: campaign.id });
  return id;
}

/** Hydrate cache from Supabase. Safe to call multiple times. */
export async function hydrateCampaigns(): Promise<Campaign[]> {
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      await hydrateBranches();
      const rows = await supabaseDriver.getAll<CampaignRow>(TABLE);
      cache = rows.filter(r => r.deleted_at === null).map(fromRow);
      hydrated = true;
      return cache;
    } catch (err) {
      console.error('[campaigns] hydrate failed', err);
      return cache;
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

export function isCampaignsHydrated(): boolean {
  return hydrated;
}

// ===== Sync read API (cache-backed, preserved for legacy UI) =====

export function getCampaigns(): Campaign[] {
  return cache;
}

export function getActiveCampaigns(): Campaign[] {
  return cache.filter(c => c.status === 'active');
}

/**
 * Campañas operables por el staff (incluye pausadas).
 */
export function getOperableCampaigns(): Campaign[] {
  return cache.filter(c => c.status === 'active' || c.status === 'paused');
}

/** @deprecated use getActiveCampaigns(); returns the first active for compat. */
export function getActiveCampaign(): Campaign | undefined {
  return getActiveCampaigns()[0];
}

export function getCampaignById(id: string): Campaign | undefined {
  return cache.find(c => c.id === id);
}

/** Rewards available for a given campaign at N points. */
export function getAvailableRewards(points: number, campaignId?: string): Milestone[] {
  const campaign = campaignId ? getCampaignById(campaignId) : getActiveCampaign();
  if (!campaign) return [];
  return campaign.milestones
    .filter(m => m.requiredPoints <= points)
    .sort((a, b) => a.requiredPoints - b.requiredPoints);
}

// ===== Async write API =====

export async function saveCampaignAsync(campaign: Campaign): Promise<void> {
  const branchId = await resolveBranchId(campaign);
  // Ensure all milestone / bonus rule ids are real UUIDs before persisting,
  // so downstream RPCs (redeem_reward) never receive synthetic ids.
  const normalizedMilestones = normalizeMilestoneIds(campaign.milestones);
  const normalizedBonusRules = normalizeBonusRuleIds(campaign.bonusRules);
  campaign.milestones = normalizedMilestones; // mutate caller for continuity
  campaign.bonusRules = normalizedBonusRules;
  const basePayload = {
    branch_id: branchId,
    name: campaign.name,
    status: campaign.status,
    start_date: campaign.startDate,
    end_date: campaign.endDate,
    terms_and_conditions: campaign.termsAndConditions,
    milestones: normalizedMilestones,
    bonus_rules: normalizedBonusRules,
    min_order_amount:
      typeof campaign.minOrderAmount === 'number' ? campaign.minOrderAmount : null,
    points_description: campaign.pointsDescription?.trim() || null,
  };

  const legacyId = !isUuid(campaign.id) ? campaign.id : null;

  if (legacyId) {
    // New campaign with a frontend-generated legacy id — let Postgres
    // assign the real UUID, then remap the cache from legacy → real id.
    const payload = { ...basePayload, legacy_id: legacyId };
    const { data, error } = await supabase
      .from(TABLE)
      .insert(payload as never)
      .select('*')
      .single();
    if (error) {
      console.error('[campaigns] insert failed', error, payload);
      throw error;
    }
    const realId = (data as { id: string }).id;
    cache = cache.filter(c => c.id !== legacyId);
    campaign.id = realId; // mutate caller for continuity
    await hydrateCampaigns();
    return;
  }

  // Existing UUID — upsert normally.
  const payload = { id: campaign.id, ...basePayload };
  const { error } = await supabase.from(TABLE).upsert(payload as never);
  if (error) {
    console.error('[campaigns] upsert failed', error, payload);
    throw error;
  }
  await hydrateCampaigns();
}

export async function setCampaignStatusAsync(
  id: string,
  status: CampaignStatus,
): Promise<void> {
  try {
    await supabaseDriver.update<CampaignRow>(TABLE, id, {
      status,
    } as Partial<CampaignRow>);
    await hydrateCampaigns();
  } catch (err) {
    console.error('[campaigns] setStatus failed', err);
    throw err;
  }
}

// ===== Sync wrappers (transitional — fire-and-forget + optimistic cache) =====

export function saveCampaign(campaign: Campaign): void {
  const idx = cache.findIndex(c => c.id === campaign.id);
  if (idx >= 0) cache[idx] = campaign;
  else cache = [...cache, campaign];
  void saveCampaignAsync(campaign).catch(() => {/* logged */});
}

export function setCampaignStatus(id: string, status: CampaignStatus): void {
  cache = cache.map(c => (c.id === id ? { ...c, status } : c));
  void setCampaignStatusAsync(id, status).catch(() => {/* logged */});
}

// Silence unused-import lint when getBranchForCampaign isn't referenced here.
void getBranchForCampaign;
