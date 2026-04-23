/**
 * Branches domain service.
 *
 * Branches are physical locations (e.g. "Express", "Matriz"). They were
 * previously coupled to campaigns via `Campaign.branch` (string) and to
 * staff via `branchCampaignId`. This module gives them a first-class entity
 * so a single branch can host multiple campaigns over time.
 *
 * Backwards compatibility: branches are derived from existing campaigns
 * when no branch records exist. Once Supabase is wired in, this service
 * is replaced by a `branches` table; the relationships below become FKs:
 *   - campaigns.branch_id  → branches.id
 *   - staff_profiles.branch_id → branches.id
 *   - transactions.branch_id (denormalized for analytics)
 */
import { storage } from './storage/localAdapter';
import { getCampaigns } from './campaigns.service';

export interface Branch {
  id: string;
  name: string;
  /** First campaign that introduced this branch (legacy link). */
  legacyCampaignId?: string;
}

const BRANCHES_KEY = 'gaviota_branches';

function deriveFromCampaigns(): Branch[] {
  const campaigns = getCampaigns();
  const seen = new Map<string, Branch>();
  for (const c of campaigns) {
    const name = c.branch || c.name;
    const id = `branch-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
    if (!seen.has(id)) seen.set(id, { id, name, legacyCampaignId: c.id });
  }
  return Array.from(seen.values());
}

export function getBranches(): Branch[] {
  const stored = storage.get<Branch[]>(BRANCHES_KEY, []);
  if (stored.length > 0) return stored;
  const derived = deriveFromCampaigns();
  if (derived.length > 0) storage.set(BRANCHES_KEY, derived);
  return derived;
}

export function getBranchById(id: string): Branch | undefined {
  return getBranches().find(b => b.id === id);
}

/** Resolve the branch that hosts a given campaign (legacy lookup). */
export function getBranchForCampaign(campaignId: string): Branch | undefined {
  return getBranches().find(b => b.legacyCampaignId === campaignId);
}

export function saveBranch(branch: Branch): void {
  const all = getBranches();
  const idx = all.findIndex(b => b.id === branch.id);
  if (idx >= 0) all[idx] = branch;
  else all.push(branch);
  storage.set(BRANCHES_KEY, all);
}
