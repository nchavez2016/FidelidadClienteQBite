/**
 * Customer session hook — Supabase-backed.
 *
 * The auth source of truth is `AuthContext`. This hook keeps the same
 * public shape as before (`{ customer, setCustomer, refresh, logout }`)
 * so existing pages keep working unchanged. The local Customer row is
 * resolved/materialized by the legacy bridge inside AuthContext, so
 * `getCurrentCustomer()` and other sync services find it immediately.
 */
import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { getCurrentCustomer, getCustomerById } from '@/services';
import type { Customer } from '@/lib/types';

export function useCustomerSession(redirectTo: string = '/cliente/login') {
  const navigate = useNavigate();
  const { user, loading, signOut } = useAuth();
  const [customer, setCustomer] = useState<Customer | null>(() => getCurrentCustomer());

  useEffect(() => {
    if (loading) return;
    if (!user) {
      setCustomer(null);
      navigate(redirectTo, { replace: true });
      return;
    }
    const fresh = getCurrentCustomer();
    setCustomer(fresh);
  }, [user, loading, navigate, redirectTo]);

  const refresh = useCallback(() => {
    const current = getCurrentCustomer();
    if (!current) {
      setCustomer(null);
      return;
    }
    setCustomer(getCustomerById(current.id) ?? current);
  }, []);

  const logout = useCallback(async () => {
    await signOut();
    setCustomer(null);
    navigate(redirectTo, { replace: true });
  }, [signOut, navigate, redirectTo]);

  return { customer, setCustomer, refresh, logout };
}
