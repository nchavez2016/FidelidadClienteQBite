/**
 * Customer session hook — 100% Supabase-backed (Phase 2.8).
 *
 * Auth identity comes exclusively from `useAuth()`. The Customer object
 * is read from the in-memory cache hydrated from `public.profiles`. If
 * the cache hasn't caught up yet, we fetch the profile directly from
 * Supabase. localStorage is NEVER consulted for identity.
 */
import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { appRoute } from '@/lib/navigation';
import { getCustomerById, hydrateCustomers } from '@/services';
import { supabase } from '@/integrations/supabase/client';
import type { Customer, Gender } from '@/lib/types';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function resolveCustomer(userId: string): Promise<Customer | null> {
  if (!UUID_RE.test(userId)) {
    console.warn('[useCustomerSession] non-uuid auth user id rejected', { userId });
    return null;
  }
  const cached = getCustomerById(userId);
  if (cached) return cached;
  // Not in cache yet → fetch own profile (RLS: customer_select_own).
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .maybeSingle();
  if (error || !data) {
    console.error('[useCustomerSession] profile fetch failed', error);
    return null;
  }
  const r = data as { id: string; display_name: string; phone: string | null; gender: Gender | null; is_active: boolean; deleted_at: string | null; created_at: string; accepted_campaigns: string[] | null };
  void hydrateCustomers();
  return {
    id: r.id,
    phone: r.phone ?? '',
    name: r.display_name || (r.phone ?? ''),
    gender: (r.gender ?? null) as Gender | null,
    pointsByCampaign: {},
    acceptedCampaigns: r.accepted_campaigns ?? [],
    isActive: r.is_active,
    createdAt: r.created_at,
  };
}

export function useCustomerSession(redirectTo: string = '/cliente/login') {
  const navigate = useNavigate();
  const { user, loading, rolesLoaded, signOut } = useAuth();
  const [customer, setCustomer] = useState<Customer | null>(() => {
    if (loading || !rolesLoaded || !user) return null;
    return getCustomerById(user.id) ?? null;
  });
  const cachedCustomer = !loading && rolesLoaded && user ? getCustomerById(user.id) ?? null : null;
  const currentCustomer = user && customer?.id === user.id ? customer : cachedCustomer;

  useEffect(() => {
    if (loading || !rolesLoaded) return;
    if (!user) {
      setCustomer(null);
      navigate(appRoute(redirectTo), { replace: true });
      return;
    }
    let cancelled = false;
    void resolveCustomer(user.id).then((c) => { if (!cancelled) setCustomer(c); });
    return () => { cancelled = true; };
  }, [user, loading, rolesLoaded, navigate, redirectTo]);

  const refresh = useCallback(() => {
    if (!user) { setCustomer(null); return; }
    void resolveCustomer(user.id).then(setCustomer);
  }, [user]);

  const logout = useCallback(async () => {
    await signOut();
    setCustomer(null);
    navigate(appRoute(redirectTo), { replace: true });
  }, [signOut, navigate, redirectTo]);

  return { customer: currentCustomer, setCustomer, refresh, logout };
}
