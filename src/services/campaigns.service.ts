/**
 * Campaigns domain service.
 * CRUD for campaigns/milestones plus reward eligibility helpers.
 */
import { Campaign, Milestone } from '@/lib/types';
import { storage } from './storage/localAdapter';
import { STORAGE_KEYS } from './storage/keys';

export function getCampaigns(): Campaign[] {
  return storage
    .get<Campaign[]>(STORAGE_KEYS.campaigns, [])
    .map((c: any) => ({ ...c, branch: c.branch || c.name }));
}

export function getActiveCampaigns(): Campaign[] {
  return getCampaigns().filter(c => c.status === 'active');
}

/**
 * Campañas operables por el staff (incluye pausadas).
 * Una campaña pausada NO es visible para el cliente, pero el staff
 * sí debe poder seguir consultándola, gestionarla y reanudarla.
 */
export function getOperableCampaigns(): Campaign[] {
  return getCampaigns().filter(c => c.status === 'active' || c.status === 'paused');
}

/** @deprecated use getActiveCampaigns(); returns the first active for compat. */
export function getActiveCampaign(): Campaign | undefined {
  return getActiveCampaigns()[0];
}

export function getCampaignById(id: string): Campaign | undefined {
  return getCampaigns().find(c => c.id === id);
}

export function saveCampaign(campaign: Campaign): void {
  const campaigns = getCampaigns();
  const idx = campaigns.findIndex(c => c.id === campaign.id);
  if (idx >= 0) campaigns[idx] = campaign;
  else campaigns.push(campaign);
  storage.set(STORAGE_KEYS.campaigns, campaigns);
}

export function setCampaignStatus(id: string, status: Campaign['status']): void {
  const campaigns = getCampaigns().map(c =>
    c.id === id ? { ...c, status } : c,
  );
  storage.set(STORAGE_KEYS.campaigns, campaigns);
}

/** Rewards available for a given campaign at N points. */
export function getAvailableRewards(points: number, campaignId?: string): Milestone[] {
  const campaign = campaignId ? getCampaignById(campaignId) : getActiveCampaign();
  if (!campaign) return [];
  return campaign.milestones
    .filter(m => m.requiredPoints <= points)
    .sort((a, b) => a.requiredPoints - b.requiredPoints);
}
