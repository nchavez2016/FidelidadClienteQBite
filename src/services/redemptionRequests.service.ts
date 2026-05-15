import { supabase } from '@/integrations/supabase/client';
import { RedemptionRequest, RedemptionRequestStatus } from '@/lib/types';

export interface CreateRequestInput {
  customerId: string;
  campaignId: string;
  rewardId: string;
  rewardName: string;
  requiredPoints: number;
}

// ─── Operational event types ─────────────────────────────────────────────────
export type RequestEventType = 'created' | 'approved' | 'rejected' | 'cancelled';

/**
 * Fire-and-forget helper that records a lifecycle event in
 * `public.redemption_request_events`.
 *
 * Errors are swallowed (with a console.warn) so a failed event insert
 * NEVER aborts the primary operation.
 */
async function logRequestEvent(
  requestId: string,
  eventType: RequestEventType,
  actorUserId?: string | null,
  notes?: string | null,
): Promise<void> {
  const tag = `[REQUEST_EVENT_${eventType.toUpperCase()}]`;
  try {
    const { error } = await supabase
      .from('redemption_request_events')
      .insert({
        request_id: requestId,
        event_type: eventType,
        actor_user_id: actorUserId ?? null,
        notes: notes ?? null,
      });

    if (error) {
      console.warn(`${tag} insert failed (non-critical):`, {
        requestId,
        eventType,
        error,
      });
    } else {
      console.info(tag, { requestId, eventType, actorUserId });
    }
  } catch (err) {
    console.warn(`${tag} unexpected error (non-critical):`, { requestId, err });
  }
}

// ─── Queries ─────────────────────────────────────────────────────────────────

export async function getPendingRequest(
  customerId: string,
  campaignId: string,
): Promise<RedemptionRequest | null> {
  console.info('[STAFF_REQUESTS_FETCH]', { customerId, campaignId });
  const { data, error } = await supabase
    .from('redemption_requests')
    .select('*')
    .eq('customer_id', customerId)
    .eq('campaign_id', campaignId)
    .eq('status', 'pending')
    .maybeSingle();

  if (error) {
    console.error('[redemptionRequests] getPendingRequest failed:', error);
    return null;
  }
  console.info(
    '[STAFF_REQUESTS_RESULT]',
    data ? { id: data.id, status: data.status } : 'no_pending_request',
  );
  if (!data) return null;
  return mapRowToRequest(data);
}

/**
 * @deprecated Use getPendingRequest(customerId, campaignId) instead.
 * Queries globally across all campaigns — only kept for backwards compatibility.
 * Must NOT be used in new code.
 */
export async function getPendingRequestForCustomer(
  customerId: string,
): Promise<RedemptionRequest | null> {
  const { data, error } = await supabase
    .from('redemption_requests')
    .select('*')
    .eq('customer_id', customerId)
    .eq('status', 'pending')
    .maybeSingle();

  if (error) {
    console.error('[redemptionRequests] getPendingRequestForCustomer failed:', error);
    return null;
  }
  if (!data) return null;
  return mapRowToRequest(data);
}

// ─── Mutations ────────────────────────────────────────────────────────────────

export async function createRedemptionRequest(
  input: CreateRequestInput,
): Promise<RedemptionRequest> {
  const { data, error } = await supabase
    .from('redemption_requests')
    .insert({
      customer_id: input.customerId,
      campaign_id: input.campaignId,
      reward_id: input.rewardId,
      reward_name_snapshot: input.rewardName,
      points_cost_snapshot: input.requiredPoints,
      status: 'pending',
    })
    .select()
    .single();

  if (error) {
    console.error('[redemptionRequests] createRedemptionRequest failed:', error);
    if (error.code === '23505') {
      // Unique violation: one pending per (customer_id, campaign_id)
      throw new Error('Ya tienes una solicitud pendiente en esta campaña');
    }
    throw new Error('Error al crear la solicitud de canje');
  }

  const req = mapRowToRequest(data);

  // Non-blocking event log — fires after the main insert succeeds.
  void logRequestEvent(req.id, 'created', input.customerId);

  return req;
}

// ─── Internal resolve helper ──────────────────────────────────────────────────

async function resolveRequest(
  id: string,
  status: RedemptionRequestStatus,
  resolvedByStaffId?: string,
  notes?: string,
): Promise<RedemptionRequest> {
  const updatePayload: Record<string, unknown> = {
    status,
    resolved_at: new Date().toISOString(),
  };
  if (resolvedByStaffId) updatePayload.resolved_by = resolvedByStaffId;
  if (notes) updatePayload.notes = notes;

  const { data, error } = await supabase
    .from('redemption_requests')
    .update(updatePayload)
    .eq('id', id)
    .eq('status', 'pending') // concurrency guard
    .select()
    .maybeSingle();

  if (error) {
    console.error('[redemptionRequests] resolveRequest failed:', error);
    throw new Error(`Error al actualizar estado a ${status}`);
  }
  if (!data) {
    throw new Error('La solicitud ya fue procesada o no existe');
  }
  return mapRowToRequest(data);
}

// ─── Public resolve functions ─────────────────────────────────────────────────

/** Customer cancels their own request. */
export async function cancelRedemptionRequestByCustomer(
  id: string,
  customerId?: string,
): Promise<RedemptionRequest> {
  const req = await resolveRequest(id, 'cancelled');
  void logRequestEvent(id, 'cancelled', customerId ?? null);
  return req;
}

/** Staff rejects a pending request. */
export async function rejectRedemptionRequest(
  id: string,
  staffId: string,
  notes?: string,
): Promise<RedemptionRequest> {
  const req = await resolveRequest(id, 'rejected', staffId, notes);
  void logRequestEvent(id, 'rejected', staffId, notes);
  return req;
}

/** Staff cancels a pending request (administrative cancel). */
export async function cancelRedemptionRequestByStaff(
  id: string,
  staffId: string,
  notes?: string,
): Promise<RedemptionRequest> {
  const req = await resolveRequest(id, 'cancelled', staffId, notes);
  void logRequestEvent(id, 'cancelled', staffId, notes);
  return req;
}

/**
 * Staff approves a pending request via the atomic RPC
 * `approve_redemption_request` which also handles the ledger debit.
 */
export async function approveRedemptionRequest(
  id: string,
  staffId: string,
  notes?: string,
  branchId?: string,
  commentCategory?: string,
): Promise<void> {
  const { error } = await supabase.rpc('approve_redemption_request', {
    p_request_id: id,
    p_staff_id: staffId,
    p_notes: notes || '',
    p_branch_id: branchId ?? null,
    p_comment_category: commentCategory ?? null,
  });

  if (error) {
    console.error('[redemptionRequests] approveRedemptionRequest failed:', error);
    throw new Error('Error al aprobar la solicitud de canje');
  }

  // Non-blocking event log — RPC already committed, so log afterwards.
  void logRequestEvent(id, 'approved', staffId, notes);
}

// ─── Mapper ───────────────────────────────────────────────────────────────────

function mapRowToRequest(row: Record<string, unknown>): RedemptionRequest {
  return {
    id: row.id as string,
    customerId: row.customer_id as string,
    campaignId: row.campaign_id as string,
    rewardId: row.reward_id as string,
    rewardName: row.reward_name_snapshot as string,
    requiredPoints: row.points_cost_snapshot as number,
    status: row.status as RedemptionRequestStatus,
    resolvedByStaffId: (row.resolved_by as string | null) ?? undefined,
    resolvedAt: (row.resolved_at as string | null) ?? undefined,
    createdAt: row.created_at as string,
  };
}

// ─── History ──────────────────────────────────────────────────────────────────

export async function getHistoricalRequests(
  customerId: string,
  campaignId: string,
): Promise<RedemptionRequest[]> {
  const { data, error } = await supabase
    .from('redemption_requests')
    .select('*')
    .eq('customer_id', customerId)
    .eq('campaign_id', campaignId)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('[redemptionRequests] getHistoricalRequests failed:', error);
    return [];
  }
  return (data ?? []).map(r => mapRowToRequest(r as Record<string, unknown>));
}

// ─── Legacy no-op stubs (backwards compat) ────────────────────────────────────
export function logRequestCreated(): void {}
export function logRequestCancelled(): void {}
