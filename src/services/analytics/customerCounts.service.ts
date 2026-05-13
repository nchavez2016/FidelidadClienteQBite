/**
 * Authoritative customer counts sourced from profiles + user_roles.
 *
 * "Total customers" must NEVER be derived from customer_points or
 * point_transactions (those reflect ledger activity, not membership).
 */
import { supabase } from '@/integrations/supabase/client';

export interface CustomerCounts {
  total: number;       // profiles ∩ user_roles(role='customer'), not deleted
  active: number;      // total minus soft-deleted / inactive
}

export async function getCustomerCounts(): Promise<CustomerCounts> {
  // Pull customer user_ids from user_roles (RLS allows admin/own; cashier
  // path falls back via profiles_select_staff which already filters to
  // customer-roled profiles).
  const { data: roleRows, error: roleErr } = await supabase
    .from('user_roles')
    .select('user_id')
    .eq('role', 'customer');
  if (roleErr) {
    console.error('[customerCounts] user_roles fetch failed', roleErr);
  }
  const customerIds = Array.from(new Set((roleRows ?? []).map(r => r.user_id as string)));

  if (customerIds.length === 0) {
    // Cashier may not be allowed to read user_roles; fall back to profiles
    // (RLS already filters cashier to customer-roled profiles).
    const { data: profs, error } = await supabase
      .from('profiles')
      .select('id, is_active, deleted_at')
      .is('deleted_at', null);
    if (error) {
      console.error('[customerCounts] profiles fallback failed', error);
      return { total: 0, active: 0 };
    }
    const total = profs?.length ?? 0;
    const active = (profs ?? []).filter(p => p.is_active !== false).length;
    return { total, active };
  }

  const { data: profs, error } = await supabase
    .from('profiles')
    .select('id, is_active, deleted_at')
    .in('id', customerIds);
  if (error) {
    console.error('[customerCounts] profiles fetch failed', error);
    return { total: customerIds.length, active: customerIds.length };
  }
  const visible = (profs ?? []).filter(p => p.deleted_at == null);
  return {
    total: visible.length,
    active: visible.filter(p => p.is_active !== false).length,
  };
}
