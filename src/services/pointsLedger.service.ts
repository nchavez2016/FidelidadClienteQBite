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

const log = createLogger('points-ledger');

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
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
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
  const { data, error } = await supabase.rpc('earn_points', {
    p_customer_id: input.customerId,
    p_campaign_id: input.campaignId,
    p_branch_id: input.branchId ?? null,
    p_idempotency_key: key,
    p_comment_category: input.commentCategory ?? null,
    p_comment_text: input.commentText ?? null,
    p_bonus_rule_id: input.bonusRuleId ?? null,
    p_bonus_multiplier: input.bonusMultiplier ?? null,
  } as never);
  if (error) {
    log.error('earnPoints failed', error, input);
    throw error;
  }
  log.debug('earnPoints ok', { id: (data as LedgerTransaction)?.id });
  return data as unknown as LedgerTransaction;
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
    log.error('redeemReward failed', error, input);
    throw error;
  }
  log.debug('redeemReward ok', { id: (data as LedgerTransaction)?.id });
  return data as unknown as LedgerTransaction;
}

export async function reverseTransaction(txId: string, reason?: string): Promise<LedgerTransaction> {
  const { data, error } = await supabase.rpc('reverse_transaction', {
    p_tx_id: txId,
    p_reason: reason ?? null,
  } as never);
  if (error) {
    log.error('reverseTransaction failed', error, { txId });
    throw error;
  }
  return data as unknown as LedgerTransaction;
}

export async function adjustPoints(
  customerId: string,
  campaignId: string,
  delta: number,
  reason: string,
): Promise<LedgerTransaction> {
  const { data, error } = await supabase.rpc('adjust_points', {
    p_customer_id: customerId,
    p_campaign_id: campaignId,
    p_delta: delta,
    p_reason: reason,
  } as never);
  if (error) {
    log.error('adjustPoints failed', error, { customerId, campaignId, delta });
    throw error;
  }
  return data as unknown as LedgerTransaction;
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
    log.error('listCustomerLedger failed', error, { customerId });
    throw error;
  }
  return (data ?? []) as unknown as LedgerTransaction[];
}