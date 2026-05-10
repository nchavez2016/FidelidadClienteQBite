/**
 * Branches domain service — Supabase-backed (Phase 4).
 *
 * Source of truth: `public.branches`. Branches are no longer derived from
 * campaigns. To keep the existing UI (which calls these getters synchronously)
 * intact, the service maintains an in-memory cache that is hydrated from
 * Supabase on bootstrap and after every successful mutation. Sync getters
 * read from the cache; mutations are async + optimistic.
 */
import { supabaseDriver } from './drivers/SupabaseDriver';

export interface Branch {
  id: string;
  name: string;
  /** First campaign that introduced this branch (legacy link). */
  legacyCampaignId?: string;
}

interface BranchRow {
  id: string;
  name: string;
  legacy_campaign_id: string | null;
  is_active: boolean;
  deleted_at: string | null;
  [k: string]: unknown;
}

const TABLE = 'branches';

let cache: Branch[] = [];
let hydrated = false;
let inflight: Promise<Branch[]> | null = null;

function fromRow(r: BranchRow): Branch {
  return {
    id: r.id,
    name: r.name,
    legacyCampaignId: r.legacy_campaign_id ?? undefined,
  };
}

function toInsert(b: Branch): Record<string, unknown> {
  return {
    id: b.id,
    name: b.name,
    legacy_campaign_id: b.legacyCampaignId ?? null,
  };
}

/** Hydrate cache from Supabase. Safe to call multiple times. */
export async function hydrateBranches(): Promise<Branch[]> {
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      const rows = await supabaseDriver.getAll<BranchRow>(TABLE);
      cache = rows.filter(r => r.deleted_at === null).map(fromRow);
      hydrated = true;
      return cache;
    } catch (err) {
      console.error('[branches] hydrate failed', err);
      return cache;
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

export function isBranchesHydrated(): boolean {
  return hydrated;
}

/** Sync read from cache (transitional — UI still expects sync). */
export function getBranches(): Branch[] {
  return cache;
}

export function getBranchById(id: string): Branch | undefined {
  return cache.find(b => b.id === id);
}

/** Resolve the branch that hosts a given campaign (legacy lookup). */
export function getBranchForCampaign(campaignId: string): Branch | undefined {
  return cache.find(b => b.legacyCampaignId === campaignId);
}

/** Async upsert — writes to Supabase, then refreshes cache. */
export async function saveBranchAsync(branch: Branch): Promise<void> {
  const existing = cache.find(b => b.id === branch.id);
  try {
    if (existing) {
      await supabaseDriver.update<BranchRow>(TABLE, branch.id, {
        name: branch.name,
        legacy_campaign_id: branch.legacyCampaignId ?? null,
      } as Partial<BranchRow>);
    } else {
      await supabaseDriver.insert<BranchRow>(TABLE, toInsert(branch) as BranchRow);
    }
    await hydrateBranches();
  } catch (err) {
    console.error('[branches] saveBranch failed', err);
    throw err;
  }
}

/**
 * Sync wrapper preserved for legacy call sites. Optimistically updates the
 * cache and persists to Supabase in the background.
 */
export function saveBranch(branch: Branch): void {
  const idx = cache.findIndex(b => b.id === branch.id);
  if (idx >= 0) cache[idx] = branch;
  else cache = [...cache, branch];
  void saveBranchAsync(branch).catch(() => {/* logged inside */});
}
