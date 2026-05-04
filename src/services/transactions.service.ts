/**
 * Transactions domain service.
 *
 * Holds the business rules for movement records: append-only log,
 * reversal flag, and the per-campaign anti-abuse window.
 */
import { Transaction } from '@/lib/types';
import { db, TABLES } from './dbAdapter';
import { POINT_COOLDOWN_MS } from './storage/keys';
import {
  validateOrThrow,
  transactionCreationSchema,
} from './validation';

export function getTransactions(): Transaction[] {
  return db.readSync<Transaction>(TABLES.transactions);
}

/** List transactions; if `campaignId` is given filter to that campaign. */
export function getCustomerTransactions(
  customerId: string,
  campaignId?: string,
): Transaction[] {
  return getTransactions().filter(
    t => t.customerId === customerId && (!campaignId || t.campaignId === campaignId),
  );
}

export function addTransaction(t: Omit<Transaction, 'id' | 'createdAt'>): Transaction {
  // Validate at the boundary; throws ValidationError on bad input so the
  // caller (UI/hook) can surface the toast — same contract Supabase RPCs
  // will provide once they're wired in.
  validateOrThrow(transactionCreationSchema, t);
  const transaction: Transaction = {
    ...t,
    id: `tx-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    createdAt: new Date().toISOString(),
  };
  db.writeSync(TABLES.transactions, [...getTransactions(), transaction]);
  return transaction;
}

export function markTransactionReversed(txId: string): void {
  const txs = getTransactions().map(t =>
    t.id === txId ? { ...t, isReversed: true } : t,
  );
  db.writeSync(TABLES.transactions, txs);
}

export function getLastCustomerTransaction(
  customerId: string,
  campaignId?: string,
): Transaction | undefined {
  const txs = getCustomerTransactions(customerId, campaignId).filter(
    t =>
      t.type !== 'terms_acceptance' &&
      t.type !== 'redemption_request' &&
      t.type !== 'redemption_request_cancelled',
  );
  return txs[txs.length - 1];
}

/** Anti-abuse rule per campaign: minimum spacing between accumulations. */
export function canAddPoint(customerId: string, campaignId?: string): boolean {
  const last = getCustomerTransactions(customerId, campaignId)
    .filter(t => t.type === 'accumulation' && !t.isReversed)
    .pop();
  if (!last) return true;
  return Date.now() - new Date(last.createdAt).getTime() > POINT_COOLDOWN_MS;
}
