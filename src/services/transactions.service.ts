/**
 * Phase 3.3 — Transactions service: thin read-only shim over the ledger.
 *
 * The legacy local mirror of transactions has been removed. All readers
 * now go through `ledgerHistory.service` (Supabase `point_transactions`).
 *
 * Mutation helpers (`addTransaction`, `markTransactionReversed`) have been
 * deleted — points changes live exclusively in the ledger RPCs
 * (earn/redeem/adjust/reverse) inside `pointsLedger.service`.
 */
import { Transaction } from '@/lib/types';
import { POINT_COOLDOWN_MS } from './storage/keys';
import { getLedgerCache, getLastReversibleFromCache } from './ledgerHistory.service';

export function getTransactions(): Transaction[] {
  return getLedgerCache();
}

/** List transactions; if `campaignId` is given filter to that campaign. */
export function getCustomerTransactions(
  customerId: string,
  campaignId?: string,
): Transaction[] {
  return getLedgerCache().filter(
    t => t.customerId === customerId && (!campaignId || t.campaignId === campaignId),
  );
}

/** Last point-affecting, non-reversed transaction for the customer/campaign. */
export function getLastCustomerTransaction(
  customerId: string,
  campaignId?: string,
): Transaction | undefined {
  return getLastReversibleFromCache(customerId, campaignId);
}

/** Anti-abuse rule per campaign: minimum spacing between accumulations. */
export function canAddPoint(customerId: string, campaignId?: string): boolean {
  const last = getCustomerTransactions(customerId, campaignId)
    .filter(t => t.type === 'accumulation' && !t.isReversed)
    .pop();
  if (!last) return true;
  return Date.now() - new Date(last.createdAt).getTime() > POINT_COOLDOWN_MS;
}