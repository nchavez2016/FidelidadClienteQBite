import { supabase } from '@/integrations/supabase/client';
import { RedemptionRequest, RedemptionRequestStatus } from '@/lib/types';

export interface CreateRequestInput {
  customerId: string;
  campaignId: string;
  rewardId: string;
  rewardName: string;
  requiredPoints: number;
}

export async function getPendingRequest(customerId: string, campaignId: string): Promise<RedemptionRequest | null> {
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
  console.info('[STAFF_REQUESTS_RESULT]', data ? { id: data.id, status: data.status } : 'no_pending_request');
  if (!data) return null;
  return mapRowToRequest(data);
}

export async function getPendingRequestForCustomer(customerId: string): Promise<RedemptionRequest | null> {
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

export async function createRedemptionRequest(input: CreateRequestInput): Promise<RedemptionRequest> {
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
    if (error.code === '23505') { // PostgreSQL unique violation
      throw new Error('Ya tienes una solicitud pendiente');
    }
    throw new Error('Error al crear la solicitud de canje');
  }
  return mapRowToRequest(data);
}

async function resolveRequest(
  id: string, 
  status: RedemptionRequestStatus, 
  resolvedByStaffId?: string, 
  notes?: string
): Promise<RedemptionRequest> {
  const updatePayload: any = { 
    status,
    resolved_at: new Date().toISOString()
  };
  if (resolvedByStaffId) {
    updatePayload.resolved_by = resolvedByStaffId;
  }
  if (notes) {
    updatePayload.notes = notes;
  }

  const { data, error } = await supabase
    .from('redemption_requests')
    .update(updatePayload)
    .eq('id', id)
    .eq('status', 'pending') // concurrency check
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

export async function cancelRedemptionRequestByCustomer(id: string): Promise<RedemptionRequest> {
  return resolveRequest(id, 'cancelled');
}

export async function rejectRedemptionRequest(id: string, staffId: string, notes?: string): Promise<RedemptionRequest> {
  return resolveRequest(id, 'rejected', staffId, notes);
}

export async function cancelRedemptionRequestByStaff(id: string, staffId: string, notes?: string): Promise<RedemptionRequest> {
  return resolveRequest(id, 'cancelled', staffId, notes);
}

export async function approveRedemptionRequest(id: string, staffId: string, notes?: string): Promise<void> {
  const { error } = await supabase.rpc('approve_redemption_request', {
    p_request_id: id,
    p_staff_id: staffId,
    p_notes: notes || '',
    p_branch_id: null // could be passed if needed
  });

  if (error) {
    console.error('[redemptionRequests] approveRedemptionRequest failed:', error);
    throw new Error('Error al aprobar la solicitud de canje');
  }
}

function mapRowToRequest(row: any): RedemptionRequest {
  return {
    id: row.id,
    customerId: row.customer_id,
    campaignId: row.campaign_id,
    rewardId: row.reward_id,
    rewardName: row.reward_name_snapshot,
    requiredPoints: row.points_cost_snapshot,
    status: row.status as RedemptionRequestStatus,
    resolvedByStaffId: row.resolved_by,
    resolvedAt: row.resolved_at,
    createdAt: row.created_at,
  };
}

export async function getHistoricalRequests(customerId: string, campaignId: string): Promise<RedemptionRequest[]> {
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
  return (data || []).map(mapRowToRequest);
}

export function logRequestCreated(): void {}
export function logRequestCancelled(): void {}
