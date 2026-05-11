/**
 * Phase 4.6 — admin audit trail (client-side wrapper).
 *
 * Wraps `public.log_admin_action(...)`. RLS rejects callers without
 * admin/cashier role; we swallow errors to never block the originating
 * mutation (audit failure must not cancel a successful business op).
 */
import { supabase } from '@/integrations/supabase/client';

export type AdminAction =
  | 'reset_points'
  | 'adjust_points'
  | 'staff_create'
  | 'staff_update'
  | 'staff_delete'
  | 'staff_set_active'
  | 'staff_change_password'
  | 'customer_deactivate'
  | 'customer_reactivate'
  | 'export_csv';

export interface LogAdminActionInput {
  action: AdminAction | string;
  targetType?: string;
  targetId?: string;
  metadata?: Record<string, unknown>;
}

export async function logAdminAction(input: LogAdminActionInput): Promise<string | null> {
  try {
    const { data, error } = await supabase.rpc('log_admin_action', {
      p_action: input.action,
      p_target_type: input.targetType ?? null,
      p_target_id: input.targetId ?? null,
      p_metadata: (input.metadata ?? {}) as never,
    } as never);
    if (error) {
      console.warn('[adminAudit] log_admin_action failed', error, input);
      return null;
    }
    return (data as string | null) ?? null;
  } catch (err) {
    console.warn('[adminAudit] log_admin_action crashed', err, input);
    return null;
  }
}

export interface AdminAuditEntry {
  id: string;
  actor_id: string;
  actor_role: 'admin' | 'cashier';
  action: string;
  target_type: string | null;
  target_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

export async function listAdminAuditLog(opts: {
  action?: string;
  limit?: number;
} = {}): Promise<AdminAuditEntry[]> {
  let q = supabase
    .from('admin_audit_log')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(opts.limit ?? 100);
  if (opts.action) q = q.eq('action', opts.action);
  const { data, error } = await q;
  if (error) {
    console.error('[adminAudit] list failed', error);
    return [];
  }
  return (data as AdminAuditEntry[] | null) ?? [];
}