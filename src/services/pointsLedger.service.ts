/**
 * Phase 6A — Points ledger service.
 *
 * Thin client wrapper over the Supabase RPCs that are now the only path
 * to mutate point balances:
 *   - earn_points
 *   - redeem_reward
 *   - reverse_transaction
 *   - adjust_points (admin)
 *
 * UI is NOT wired to this service yet. Existing services keep working
 * against the legacy cache. This module is the seam for the next phase.
 */
import { supabase } from '@/integrations/supabase/client';
import { createLogger } from '@/lib/logger';
import { applyLedgerBalance } from './customerPoints.service';
import { applyLedgerInsert, rehydrateLedgerHistory } from './ledgerHistory.service';
import { logAdminAction } from '@/services/security/adminAudit.service';
import type { RealtimeChannel } from '@supabase/supabase-js';

const log = createLogger('points-ledger');

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isUuid = (v: string | null | undefined): v is string =>
  typeof v === 'string' && UUID_RE.test(v);

function structuredLog(
  tag: '[LEDGER_EARN]' | '[LEDGER_REDEEM]' | '[LEDGER_ADJUST]' | '[LEDGER_REVERSE]',
  payload: Record<string, unknown>,
): void {
  // eslint-disable-next-line no-console
  console.info(tag, payload);
}

export type LedgerTxKind =
  | 'earn'
  | 'bonus'
  | 'redeem'
  | 'manual_adjustment'
  | 'reversal'
  | 'terms_acceptance';

export interface LedgerTransaction {
  id: string;
  customer_id: string;
  campaign_id: string;
  branch_id: string | null;
  kind: LedgerTxKind;
  points_delta: number;
  balance_after: number | null;
  reward_id: string | null;
  bonus_rule_id: string | null;
  bonus_multiplier: number | null;
  reverses_tx_id: string | null;
  idempotency_key: string | null;
  actor_id: string | null;
  actor_role: string | null;
  comment_category: string | null;
  comment_text: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  effective_at: string;
}

function newIdempotencyKey(prefix: string): string {
  // Prefer UUID; fall back to time+random when crypto.randomUUID is missing.
  const uuid =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  return `${prefix}-${uuid}`;
}

function reconcile(tx: LedgerTransaction | null | undefined): void {
  if (!tx) return;
  if (tx.balance_after != null) {
    applyLedgerBalance(tx.customer_id, tx.campaign_id, tx.balance_after);
  }
  // Mirror the new ledger row into the in-memory history cache so the
  // UI sees it immediately without waiting for a re-hydrate.
  applyLedgerInsert(tx);
}

export interface EarnPointsInput {
  customerId: string;
  campaignId: string;
  branchId?: string | null;
  idempotencyKey?: string;
  commentCategory?: string;
  commentText?: string;
  bonusRuleId?: string;
  bonusMultiplier?: number;
}

export async function earnPoints(input: EarnPointsInput): Promise<LedgerTransaction> {
  const key = input.idempotencyKey ?? newIdempotencyKey('earn');
  if (!isUuid(input.campaignId)) {
    // eslint-disable-next-line no-console
    console.error('[INVALID_CAMPAIGN_ID]', { campaignId: input.campaignId, op: 'earn_points' });
    throw new Error('invalid_campaign_id');
  }
  if (!isUuid(input.customerId)) {
    // eslint-disable-next-line no-console
    console.error('[INVALID_CAMPAIGN_ID]', { customerId: input.customerId, op: 'earn_points', reason: 'customer_id_not_uuid' });
    throw new Error('invalid_customer_id');
  }
  // Bonus rule id is metadata-only; if it's not a real UUID (legacy/local
  // bonus rule), drop it so the RPC's uuid column doesn't reject it.
  const safeBonusRuleId = isUuid(input.bonusRuleId) ? input.bonusRuleId : null;
  const { data, error } = await supabase.rpc('earn_points', {
    p_customer_id: input.customerId,
    p_campaign_id: input.campaignId,
    p_branch_id: input.branchId ?? null,
    p_idempotency_key: key,
    p_comment_category: input.commentCategory ?? null,
    p_comment_text: input.commentText ?? null,
    p_bonus_rule_id: safeBonusRuleId,
    p_bonus_multiplier: input.bonusMultiplier ?? null,
  } as never);
  if (error) {
    log.error('earnPoints failed', { error, ctx: input });
    throw error;
  }
  const tx = data as unknown as LedgerTransaction;
  structuredLog('[LEDGER_EARN]', {
    customer_id: tx.customer_id,
    campaign_id: tx.campaign_id,
    delta: tx.points_delta,
    tx_id: tx.id,
    idempotency_key: key,
    balance_after: tx.balance_after,
  });
  reconcile(tx);
  return tx;
}

export interface RedeemRewardInput {
  customerId: string;
  campaignId: string;
  rewardId: string;
  rewardName: string;
  requiredPoints: number;
  branchId?: string | null;
  idempotencyKey?: string;
}

export async function redeemReward(input: RedeemRewardInput): Promise<LedgerTransaction> {
  const key = input.idempotencyKey ?? newIdempotencyKey('redeem');
  const { data, error } = await supabase.rpc('redeem_reward', {
    p_customer_id: input.customerId,
    p_campaign_id: input.campaignId,
    p_reward_id: input.rewardId,
    p_reward_name: input.rewardName,
    p_required_points: input.requiredPoints,
    p_branch_id: input.branchId ?? null,
    p_idempotency_key: key,
  } as never);
  if (error) {
    log.error('redeemReward failed', { error, ctx: input });
    throw error;
  }
  const tx = data as unknown as LedgerTransaction;
  structuredLog('[LEDGER_REDEEM]', {
    customer_id: tx.customer_id,
    campaign_id: tx.campaign_id,
    delta: tx.points_delta,
    tx_id: tx.id,
    idempotency_key: key,
    balance_after: tx.balance_after,
  });
  reconcile(tx);
  return tx;
}

export async function reverseTransaction(
  txId: string,
  reason?: string,
  idempotencyKey?: string,
): Promise<LedgerTransaction> {
  const key = idempotencyKey ?? newIdempotencyKey('reverse');
  const { data, error } = await supabase.rpc('reverse_transaction', {
    p_tx_id: txId,
    p_reason: reason ?? null,
  } as never);
  if (error) {
    log.error('reverseTransaction failed', { error, ctx: { txId } });
    throw error;
  }
  const tx = data as unknown as LedgerTransaction;
  structuredLog('[LEDGER_REVERSE]', {
    customer_id: tx.customer_id,
    campaign_id: tx.campaign_id,
    delta: tx.points_delta,
    tx_id: tx.id,
    reverses_tx_id: tx.reverses_tx_id,
    idempotency_key: key,
    balance_after: tx.balance_after,
  });
  reconcile(tx);
  return tx;
}

export async function adjustPoints(
  customerId: string,
  campaignId: string,
  delta: number,
  reason: string,
  idempotencyKey?: string,
): Promise<LedgerTransaction> {
  const key = idempotencyKey ?? newIdempotencyKey('adjust');
  const { data, error } = await supabase.rpc('adjust_points', {
    p_customer_id: customerId,
    p_campaign_id: campaignId,
    p_delta: delta,
    p_reason: reason,
  } as never);
  if (error) {
    log.error('adjustPoints failed', { error, ctx: { customerId, campaignId, delta } });
    throw error;
  }
  const tx = data as unknown as LedgerTransaction;
  structuredLog('[LEDGER_ADJUST]', {
    customer_id: tx.customer_id,
    campaign_id: tx.campaign_id,
    delta: tx.points_delta,
    tx_id: tx.id,
    idempotency_key: key,
    balance_after: tx.balance_after,
  });
  reconcile(tx);
  void logAdminAction({
    action: 'adjust_points',
    targetType: 'customer',
    targetId: tx.customer_id,
    metadata: {
      campaign_id: tx.campaign_id,
      delta: tx.points_delta,
      tx_id: tx.id,
      balance_after: tx.balance_after,
      reason,
    },
  });
  return tx;
}

/**
 * Phase 3.4 — Admin-only reset that zeroes a customer's balance for a
 * campaign by inserting a compensating `manual_adjustment` row.
 */
export async function resetCustomerPoints(
  customerId: string,
  campaignId: string,
  reason = 'admin_reset',
): Promise<{ tx_id: string | null; new_balance: number }> {
  const { data, error } = await supabase.rpc('reset_customer_points', {
    p_customer_id: customerId,
    p_campaign_id: campaignId,
    p_reason: reason,
  } as never);
  if (error) {
    log.error('resetCustomerPoints failed', { error, ctx: { customerId, campaignId } });
    throw error;
  }
  const row = Array.isArray(data) ? (data[0] as { tx_id: string | null; new_balance: number }) : (data as { tx_id: string | null; new_balance: number });
  structuredLog('[LEDGER_ADJUST]', {
    customer_id: customerId,
    campaign_id: campaignId,
    op: 'reset',
    tx_id: row?.tx_id ?? null,
    balance_after: row?.new_balance ?? 0,
  });
  if (row?.new_balance != null) {
    applyLedgerBalance(customerId, campaignId, row.new_balance);
  }
  return row ?? { tx_id: null, new_balance: 0 };
}

/**
 * Phase 3.4 — Realtime subscription for `point_transactions`. New ledger
 * rows are pushed into the history cache so every connected device sees
 * them without polling.
 */
let ledgerChannel: RealtimeChannel | null = null;

export function subscribePointTransactionsRealtime(onInsert?: (tx: LedgerTransaction) => void): () => void {
  if (ledgerChannel) return () => { /* shared channel */ };

  // ─── Phase 4 — debounced exponential-backoff reconnect ────────
  const BACKOFF_MS = [1000, 2000, 4000, 8000, 16000, 30000];
  let attempt = 0;
  let reconnectTimer: number | null = null;

  const scheduleReconnect = () => {
    if (reconnectTimer != null) return;        // debounce
    const delay = BACKOFF_MS[Math.min(attempt, BACKOFF_MS.length - 1)];
    attempt++;
    console.warn('[REALTIME_RECONNECT]', { channel: 'point_transactions', attempt, delayMs: delay });
    reconnectTimer = window.setTimeout(() => {
      reconnectTimer = null;
      try {
        if (ledgerChannel) supabase.removeChannel(ledgerChannel);
      } catch (err) { console.warn('[ledger] removeChannel failed', err); }
      ledgerChannel = null;
      // Single-flight rehydrate skips network if recent enough.
      console.info('[REALTIME_RESYNC]', { channel: 'point_transactions' });
      void rehydrateLedgerHistory().catch(err => console.warn('[ledger] rehydrate failed', err));
      open();
    }, delay);
  };

  const open = () => {
    ledgerChannel = supabase
      .channel('point_transactions_changes')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'point_transactions' },
        (payload) => {
          const tx = payload.new as unknown as LedgerTransaction;
          if (!tx?.id) return;
          applyLedgerInsert(tx);
          try { onInsert?.(tx); } catch (err) { console.error('[ledger] rt cb', err); }
        },
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          if (attempt > 0) console.info('[REALTIME_RECOVERED]', { channel: 'point_transactions', afterAttempts: attempt });
          attempt = 0; // reset backoff on success
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          scheduleReconnect();
        }
      });
  };

  open();

  return () => {
    if (reconnectTimer != null) { window.clearTimeout(reconnectTimer); reconnectTimer = null; }
    if (ledgerChannel) {
      supabase.removeChannel(ledgerChannel);
      ledgerChannel = null;
    }
  };
}

/** Read recent ledger entries for a customer (RLS scoped). */
export async function listCustomerLedger(
  customerId: string,
  opts: { campaignId?: string; limit?: number } = {},
): Promise<LedgerTransaction[]> {
  let q = supabase
    .from('point_transactions')
    .select('*')
    .eq('customer_id', customerId)
    .order('created_at', { ascending: false })
    .limit(opts.limit ?? 50);
  if (opts.campaignId) q = q.eq('campaign_id', opts.campaignId);
  const { data, error } = await q;
  if (error) {
    log.error('listCustomerLedger failed', { error, ctx: { customerId } });
    throw error;
  }
  return (data ?? []) as unknown as LedgerTransaction[];
}