/**
 * Storage keys and shared identifier constants.
 * Kept separate so swapping the persistence layer (e.g. to Supabase)
 * does not require touching domain services.
 */
export const STORAGE_KEYS = {
  customers: 'gaviota_customers',
  staff: 'gaviota_staff',
  transactions: 'gaviota_transactions',
  campaigns: 'gaviota_campaigns',
  currentCustomer: 'gaviota_current_customer',
  currentStaff: 'gaviota_current_staff',
} as const;

export const LEGACY_CAMPAIGN_ID = 'campaign-1';
export const EXPRESS_ID = 'campaign-express';
export const MATRIZ_ID = 'campaign-matriz';

/** Anti-abuse window between point accumulations (ms). */
export const POINT_COOLDOWN_MS = 60_000;
/** Window allowed to reverse the last transaction (ms). */
export const REVERSAL_WINDOW_MS = 5 * 60_000;
