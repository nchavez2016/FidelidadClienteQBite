/**
 * Services barrel.
 *
 * Importing anything from `@/services` triggers the one-time bootstrap
 * (migrations + seeding) and exposes every domain service.
 *
 * UI code should prefer this entry point over reaching into individual
 * service files. The legacy `@/services` import path keeps working
 * via a thin re-export façade.
 */
import { bootstrapStore } from './bootstrap';

bootstrapStore();

export * from './customers.service';
export * from './transactions.service';
export * from './campaigns.service';
export * from './branches.service';
export * from './redemptionRequests.service';
export * from './bonusRules.service';
export * from './auth';
export * from './rules';
export * from './analytics';
export * from './consent.service';
export * from './audit.service';
export { db, TABLES } from './dbAdapter';
export * as Validation from './validation';
export {
  STORAGE_KEYS,
  EXPRESS_ID,
  MATRIZ_ID,
  LEGACY_CAMPAIGN_ID,
  POINT_COOLDOWN_MS,
  REVERSAL_WINDOW_MS,
} from './storage/keys';
