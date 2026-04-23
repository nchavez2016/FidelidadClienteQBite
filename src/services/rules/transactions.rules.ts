/**
 * Transaction business rules.
 *
 * Pure functions, no React, no storage writes. Each rule returns a
 * structured result so callers (services or UI) can react accordingly.
 *
 * Why centralize: today these constants and windows live in hooks/UI;
 * tomorrow they will be enforced server-side (Postgres functions / RLS /
 * edge functions). Keeping the logic here means the swap is a one-file
 * change and the UI never lies about what the backend allows.
 */
import {
  POINT_COOLDOWN_MS,
  REVERSAL_WINDOW_MS,
} from '../storage/keys';
import {
  getCustomerTransactions,
  getLastCustomerTransaction,
} from '../transactions.service';
import { getCustomerPoints } from '../customers.service';
import type { Customer, Milestone, Transaction } from '@/lib/types';

export type RuleResult =
  | { ok: true }
  | { ok: false; code: string; message: string };

const ok: RuleResult = { ok: true };
const fail = (code: string, message: string): RuleResult => ({ ok: false, code, message });

/** Anti-abuse: minimum spacing between accumulations per customer/campaign. */
export function canAccumulatePoint(customerId: string, campaignId: string): RuleResult {
  if (!campaignId) return fail('NO_CAMPAIGN', 'Selecciona una sucursal');
  const last = getCustomerTransactions(customerId, campaignId)
    .filter(t => t.type === 'accumulation' && !t.isReversed)
    .pop();
  if (!last) return ok;
  const elapsed = Date.now() - new Date(last.createdAt).getTime();
  if (elapsed <= POINT_COOLDOWN_MS) {
    return fail('COOLDOWN', 'Debes esperar al menos 1 minuto entre puntos (anti-abuso)');
  }
  return ok;
}

/** Customer must have enough points for the milestone in the given campaign. */
export function canRedeemReward(
  customer: Customer,
  reward: Milestone,
  campaignId: string,
): RuleResult {
  if (!campaignId) return fail('NO_CAMPAIGN', 'Selecciona una sucursal');
  const balance = getCustomerPoints(customer, campaignId);
  if (balance < reward.requiredPoints) {
    return fail('INSUFFICIENT_POINTS', 'Puntos insuficientes para este premio');
  }
  return ok;
}

/** Last transaction in the campaign must exist, not be reversed, and be < REVERSAL_WINDOW_MS old. */
export function canReverseLast(
  customerId: string,
  campaignId: string,
): { result: RuleResult; lastTx?: Transaction } {
  if (!campaignId) return { result: fail('NO_CAMPAIGN', 'Selecciona una sucursal') };
  const lastTx = getLastCustomerTransaction(customerId, campaignId);
  if (!lastTx || lastTx.isReversed) {
    return { result: fail('NO_REVERSIBLE_TX', 'No hay movimiento para revertir en esta sucursal') };
  }
  const elapsed = Date.now() - new Date(lastTx.createdAt).getTime();
  if (elapsed > REVERSAL_WINDOW_MS) {
    return { result: fail('WINDOW_EXPIRED', 'Solo puedes revertir dentro de los 5 minutos'), lastTx };
  }
  return { result: ok, lastTx };
}

/**
 * Duplicate-transaction guard: protects against double-clicks and replay.
 * A transaction is considered duplicate if an identical (customer + campaign +
 * type + points) row was created in the last `windowMs` milliseconds.
 */
export function isDuplicateTransaction(
  candidate: Pick<Transaction, 'customerId' | 'campaignId' | 'type' | 'points'>,
  windowMs = 2000,
): boolean {
  const recent = getCustomerTransactions(candidate.customerId, candidate.campaignId);
  const cutoff = Date.now() - windowMs;
  return recent.some(
    t =>
      t.type === candidate.type &&
      t.points === candidate.points &&
      new Date(t.createdAt).getTime() >= cutoff,
  );
}
