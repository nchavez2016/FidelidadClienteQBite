/**
 * One-shot data migrations for the local persistence layer.
 *
 * Each migration is idempotent: it inspects existing values and
 * only writes when normalization is needed.
 */
import { storage } from './storage/localAdapter';
import { LEGACY_CAMPAIGN_ID, STORAGE_KEYS } from './storage/keys';

export function migrateCustomers(): void {
  const raw = storage.get<any[]>(STORAGE_KEYS.customers, []);
  if (raw.length === 0) return;
  let changed = false;
  const migrated = raw.map((c: any) => {
    const next = { ...c };
    if (next.pointsByCampaign === undefined) {
      next.pointsByCampaign = {};
      if (typeof c.points === 'number') {
        next.pointsByCampaign[LEGACY_CAMPAIGN_ID] = c.points;
      }
      changed = true;
    }
    if (!Array.isArray(next.acceptedCampaigns)) {
      next.acceptedCampaigns = c.acceptedCampaignId ? [c.acceptedCampaignId] : [];
      changed = true;
    }
    return next;
  });
  if (changed) storage.set(STORAGE_KEYS.customers, migrated);
}

export function migrateTransactions(): void {
  const raw = storage.get<any[]>(STORAGE_KEYS.transactions, []);
  if (raw.length === 0) return;
  let changed = false;
  const migrated = raw.map((t: any) => {
    if (!t.campaignId) {
      changed = true;
      return { ...t, campaignId: LEGACY_CAMPAIGN_ID };
    }
    return t;
  });
  if (changed) storage.set(STORAGE_KEYS.transactions, migrated);
}

export function migrateCampaigns(): void {
  const raw = storage.get<any[]>(STORAGE_KEYS.campaigns, []);
  if (raw.length === 0) return;
  let changed = false;
  const migrated = raw.map((c: any) => {
    if (!c.branch) {
      changed = true;
      return { ...c, branch: c.name || 'Sucursal Principal' };
    }
    return c;
  });
  if (changed) storage.set(STORAGE_KEYS.campaigns, migrated);
}

export function runAllMigrations(): void {
  migrateCustomers();
  migrateTransactions();
  migrateCampaigns();
}
