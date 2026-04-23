/**
 * Customer session hook.
 *
 * Centralizes "who is logged in" + redirect on logout. Pages should
 * use this instead of calling `getCurrentCustomer()` directly so the
 * future Supabase Auth swap only touches this file.
 */
import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  getCurrentCustomer,
  getCustomerById,
  logoutCustomer,
} from '@/services';
import type { Customer } from '@/lib/types';

export function useCustomerSession(redirectTo: string = '/cliente/login') {
  const navigate = useNavigate();
  const [customer, setCustomer] = useState<Customer | null>(() => getCurrentCustomer());

  useEffect(() => {
    if (!customer) navigate(redirectTo);
  }, [customer, navigate, redirectTo]);

  const refresh = useCallback(() => {
    const current = getCurrentCustomer();
    if (!current) {
      setCustomer(null);
      return;
    }
    setCustomer(getCustomerById(current.id) ?? current);
  }, []);

  const logout = useCallback(() => {
    logoutCustomer();
    setCustomer(null);
    navigate(redirectTo);
  }, [navigate, redirectTo]);

  return { customer, setCustomer, refresh, logout };
}
