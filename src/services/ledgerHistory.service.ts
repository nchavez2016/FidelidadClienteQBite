/**
 * Phase 3.3 — Ledger history service.
 *
 * Source of truth for transaction history is `public.point_transactions`.
 * This service:
 *   - hydrates a local cache of recent ledger rows on demand,
 *   - exposes async listing/query helpers,
 *   - maps ledger rows into the legacy `Transaction` shape so existing
 *     UI (TransactionItem, ReportsTab, DashboardTab, OperationsTab,
 *     StaffShiftStats) keeps working without rewrites,
 *   - lets `pointsLedger.service.ts` push freshly-inserted rows into the
 *     cache so the UI sees them immediately.
 *
 * IMPORTANT: there is no localStorage mirror anymore. The only place
 * transactions live is Supabase.
 */
import { supabase } from '@/integrations/supabase/client';
import type { Transaction, TransactionType, CommentCategory } from '@/lib/types';
import type { LedgerTransaction, LedgerTxKind } from './pointsLedger.service';

const TABLE = 'point_transactions';
const DEFAULT_PAGE_SIZE = 500;

// ─── Staff display-name resolver (Phase 3.4) ──────────────────────
const staffNameById: Record<string, string> = {};
const inflightProfile: Record<string, Promise<void>> = {};

async function resolveActorNames(ids: Iterable<string>): Promise<void> {
  const missing = Array.from(new Set(Array.from(ids).filter(id => id && !(id in staffNameById) && !(id in inflightProfile))));
  if (missing.length === 0) return;
  const promise = (async () => {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, display_name')
      .in('id', missing);
    if (error) {
      console.warn('[ledgerHistory] resolveActorNames failed', error);
      return;
    }
    for (const row of (data ?? []) as Array<{ id: string; display_name: string | null }>) {
      staffNameById[row.id] = row.display_name?.trim() || 'Sistema';
    }
    for (const id of missing) if (!(id in staffNameById)) staffNameById[id] = 'Sistema';
  })();
  for (const id of missing) inflightProfile[id] = promise;
  try { await promise; } finally { for (const id of missing) delete inflightProfile[id]; }
}

export function getStaffNameMap(): Record<string, string> {
  return staffNameById;
}

interface LedgerRow {
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
  metadata: Record<string, unknown> | null;
  created_at: string;
  effective_at: string;
}

/** Visual mapping of ledger kinds to UI-friendly labels. */
export const LEDGER_KIND_LABELS: Record<LedgerTxKind, string> = {
  earn: 'Acumulación',
  bonus: 'Acumulación con bonus',
  redeem: 'Canje',
  manual_adjustment: 'Ajuste manual',
  reversal: 'Reverso',
  terms_acceptance: 'Aceptación de términos',
};

function ledgerKindToLegacyType(kind: LedgerTxKind, delta: number): TransactionType {
  switch (kind) {
    case 'earn':
    case 'bonus':
      return 'accumulation';
    case 'redeem':
      return 'redemption';
    case 'reversal':
      return 'reversal';
    case 'manual_adjustment':
      return delta >= 0 ? 'accumulation' : 'redemption';
    case 'terms_acceptance':
      return 'terms_acceptance';
    default:
      return 'accumulation';
  }
}

function asCommentCategory(v: string | null): CommentCategory | undefined {
  if (!v) return undefined;
  const allowed: CommentCategory[] = [
    'positive', 'complaint', 'observation', 'promotion', 'suggestion', 'other',
  ];
  return (allowed as string[]).includes(v) ? (v as CommentCategory) : undefined;
}

/**
 * Map a raw ledger row into the legacy Transaction shape.
 * `isReversed` is computed against the cache (any row with
 * `reverses_tx_id === row.id` flips this row).
 */
export function mapLedgerToTransaction(
  row: LedgerRow,
  ctx: { reversedIds: Set<string>; staffNameById?: Record<string, string> } = { reversedIds: new Set() },
): Transaction {
  const meta = row.metadata ?? {};
  const rewardName =
    typeof meta['reward_name'] === 'string' ? (meta['reward_name'] as string) : undefined;
  const bonusLabel =
    typeof meta['bonus_label'] === 'string' ? (meta['bonus_label'] as string) : undefined;
  const staffName =
    (row.actor_id && ctx.staffNameById?.[row.actor_id]) ||
    (row.actor_role ? row.actor_role.charAt(0).toUpperCase() + row.actor_role.slice(1) : 'Sistema');

  return {
    id: row.id,
    customerId: row.customer_id,
    campaignId: row.campaign_id,
    type: ledgerKindToLegacyType(row.kind, row.points_delta),
    points: row.points_delta,
    balanceAfter: row.balance_after ?? 0,
    rewardId: row.reward_id ?? undefined,
    rewardName,
    staffId: row.actor_id ?? 'system',
    staffName,
    commentCategory: asCommentCategory(row.comment_category),
    commentText: row.comment_text ?? undefined,
    reversedTransactionId: row.reverses_tx_id ?? undefined,
    isReversed: ctx.reversedIds.has(row.id),
    bonusMultiplier: row.bonus_multiplier ?? undefined,
    bonusRuleId: row.bonus_rule_id ?? undefined,
    bonusRuleLabel: bonusLabel,
    createdAt: row.created_at,
  };
}

// ─── In-memory cache ──────────────────────────────────────────────

let cache: LedgerRow[] = [];
let reversedIds = new Set<string>();
let hydrated = false;
let inflight: Promise<Transaction[]> | null = null;
const subscribers = new Set<() => void>();

function recomputeReversed(): void {
  reversedIds = new Set(
    cache
      .filter(r => r.kind === 'reversal' && r.reverses_tx_id)
      .map(r => r.reverses_tx_id as string),
  );
}

function notify(): void {
  for (const fn of subscribers) {
    try { fn(); } catch (err) { console.error('[ledgerHistory] subscriber failed', err); }
  }
}

/** Subscribe to cache changes (used by UI to re-render after a mutation). */
export function subscribeLedgerHistory(fn: () => void): () => void {
  subscribers.add(fn);
  return () => subscribers.delete(fn);
}

/** Snapshot of the cached ledger as legacy `Transaction[]`, ordered ASC by createdAt. */
export function getLedgerCache(): Transaction[] {
  // Sorted ascending so existing `.slice(-N).reverse()` patterns keep working.
  const sorted = [...cache].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
  );
  return sorted.map(r => mapLedgerToTransaction(r, { reversedIds, staffNameById }));
}

export function isLedgerHistoryHydrated(): boolean {
  return hydrated;
}

/** One-shot hydration. Subsequent calls return the cached snapshot. */
export async function hydrateLedgerHistory(): Promise<Transaction[]> {
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      const { data, error } = await supabase
        .from(TABLE)
        .select('*')
        .order('created_at', { ascending: false })
        .limit(DEFAULT_PAGE_SIZE);
      if (error) throw error;
      cache = ((data as LedgerRow[] | null) ?? []).slice();
      recomputeReversed();
      await resolveActorNames(cache.map(r => r.actor_id).filter((v): v is string => !!v));
      hydrated = true;
      notify();
      return getLedgerCache();
    } catch (err) {
      console.error('[ledgerHistory] hydrate failed', err);
      return getLedgerCache();
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

/** Insert a freshly-created ledger row into the cache (called by RPC wrappers). */
export function applyLedgerInsert(tx: LedgerTransaction): void {
  const row: LedgerRow = {
    id: tx.id,
    customer_id: tx.customer_id,
    campaign_id: tx.campaign_id,
    branch_id: tx.branch_id,
    kind: tx.kind,
    points_delta: tx.points_delta,
    balance_after: tx.balance_after,
    reward_id: tx.reward_id,
    bonus_rule_id: tx.bonus_rule_id,
    bonus_multiplier: tx.bonus_multiplier,
    reverses_tx_id: tx.reverses_tx_id,
    idempotency_key: tx.idempotency_key,
    actor_id: tx.actor_id,
    actor_role: tx.actor_role,
    comment_category: tx.comment_category,
    comment_text: tx.comment_text,
    metadata: tx.metadata,
    created_at: tx.created_at,
    effective_at: tx.effective_at,
  };
  // Replace if already present (idempotency replay).
  const idx = cache.findIndex(r => r.id === row.id);
  if (idx >= 0) cache[idx] = row;
  else cache.push(row);
  recomputeReversed();
  if (row.actor_id && !(row.actor_id in staffNameById)) {
    void resolveActorNames([row.actor_id]).then(() => notify());
  }
  notify();
}

// ─── Async query API (always reads Supabase, RLS scoped) ──────────

export async function listCustomerTransactions(
  customerId: string,
  opts: { campaignId?: string; limit?: number } = {},
): Promise<Transaction[]> {
  let q = supabase
    .from(TABLE)
    .select('*')
    .eq('customer_id', customerId)
    .order('created_at', { ascending: false })
    .limit(opts.limit ?? 100);
  if (opts.campaignId) q = q.eq('campaign_id', opts.campaignId);
  const { data, error } = await q;
  if (error) {
    console.error('[ledgerHistory] listCustomerTransactions failed', error);
    return [];
  }
  const rows = (data as LedgerRow[] | null) ?? [];
  const reversed = new Set(
    rows.filter(r => r.kind === 'reversal' && r.reverses_tx_id).map(r => r.reverses_tx_id as string),
  );
  return rows.map(r => mapLedgerToTransaction(r, { reversedIds: reversed }));
}

export async function listCampaignTransactions(
  campaignId: string,
  opts: { limit?: number } = {},
): Promise<Transaction[]> {
  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .eq('campaign_id', campaignId)
    .order('created_at', { ascending: false })
    .limit(opts.limit ?? 200);
  if (error) {
    console.error('[ledgerHistory] listCampaignTransactions failed', error);
    return [];
  }
  const rows = (data as LedgerRow[] | null) ?? [];
  const reversed = new Set(
    rows.filter(r => r.kind === 'reversal' && r.reverses_tx_id).map(r => r.reverses_tx_id as string),
  );
  return rows.map(r => mapLedgerToTransaction(r, { reversedIds: reversed }));
}

export async function listRecentTransactions(limit = 100): Promise<Transaction[]> {
  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) {
    console.error('[ledgerHistory] listRecentTransactions failed', error);
    return [];
  }
  const rows = (data as LedgerRow[] | null) ?? [];
  const reversed = new Set(
    rows.filter(r => r.kind === 'reversal' && r.reverses_tx_id).map(r => r.reverses_tx_id as string),
  );
  return rows.map(r => mapLedgerToTransaction(r, { reversedIds: reversed }));
}

export async function getTransactionById(txId: string): Promise<Transaction | null> {
  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .eq('id', txId)
    .maybeSingle();
  if (error) {
    console.error('[ledgerHistory] getTransactionById failed', error);
    return null;
  }
  if (!data) return null;
  return mapLedgerToTransaction(data as LedgerRow, { reversedIds: new Set() });
}

/** Last reversible transaction for (customer, campaign) using the cache. */
export function getLastReversibleFromCache(
  customerId: string,
  campaignId?: string,
): Transaction | undefined {
  const candidates = cache
    .filter(r => r.customer_id === customerId)
    .filter(r => !campaignId || r.campaign_id === campaignId)
    .filter(r => r.kind === 'earn' || r.kind === 'bonus' || r.kind === 'redeem' || r.kind === 'manual_adjustment')
    .filter(r => !reversedIds.has(r.id))
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  const row = candidates[0];
  if (!row) return undefined;
  return mapLedgerToTransaction(row, { reversedIds });
}