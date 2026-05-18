/**
 * Staff auth hook — Supabase-backed.
 *
 * Single source of truth: AuthContext (Supabase session + user_roles).
 * No localStorage, no legacy `sessionStaff`/`getCurrentStaff()`.
 */
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { clearLegacySessions } from '@/services/auth/legacyBridge';
import { supabase } from '@/integrations/supabase/client';
import type { StaffUser } from '@/lib/types';

export function useStaffAuth() {
  const navigate = useNavigate();
  const { user, roles, loading, rolesLoaded, signOut } = useAuth();
  // Derive auth purely from AuthContext roles. Never trust legacy storage
  // as the source of truth for "is this user staff?".
  const isStaffRole = useMemo(
    () => roles.includes('admin') || roles.includes('cashier'),
    [roles],
  );
  const [staff, setStaff] = useState<StaffUser | null>(null);
  const [runtimeError, setRuntimeError] = useState<string | null>(null);

  useEffect(() => {
    const syncStaff = async () => {
      try {
        console.info('[AUTHZ] useStaffAuth', { hasUser: !!user, roles, isStaffRole, loading, rolesLoaded });
        if (loading || (user && !rolesLoaded)) return;
        if (!user) {
          setStaff(null);
          clearLegacySessions();
          navigate('/staff/login', { replace: true });
          return;
        }
        if (!isStaffRole) {
          // Customer (o sin role) navegó al área staff: rechazo duro.
          clearLegacySessions();
          setStaff(null);
          setRuntimeError(`Acceso denegado: rol no autorizado (${roles.join(',') || 'none'})`);
          navigate('/cliente/dashboard', { replace: true });
          return;
        }

        // Fetch additional profile info (like branch_id) from the public.profiles table.
        const { data: profile, error: profileError } = await supabase
          .from('profiles')
          .select('branch_id')
          .eq('id', user.id)
          .single();

        if (profileError) {
          console.warn('[AUTHZ] Could not fetch staff profile', profileError);
        }

        // Construir el objeto staff puramente desde AuthContext + user_metadata + profiles.
        // Sin localStorage. Multirol-friendly: no asumimos que sea solo staff.
        const meta = (user.user_metadata ?? {}) as Record<string, unknown>;
        const username =
          (meta.staff_username as string | undefined) ??
          (meta.identifier as string | undefined) ??
          (user.email?.split('@')[0] ?? user.id);
        const role: 'admin' | 'cashier' = roles.includes('admin') ? 'admin' : 'cashier';
        
        setStaff({
          id: user.id,
          username,
          name: (meta.display_name as string | undefined) ?? username,
          role,
          active: true,
          branchId: profile?.branch_id ?? undefined,
        });
        setRuntimeError(null);
      } catch (error) {
        console.error('🚨 [useStaffAuth] crashed', error);
        setRuntimeError(error instanceof Error ? error.message : String(error));
      }
    };

    syncStaff();
  }, [user, roles, isStaffRole, loading, rolesLoaded, navigate]);

  const isAdmin = roles.includes('admin');

  const logout = async () => {
    try {
      await signOut();
      setStaff(null);
      navigate('/staff/login', { replace: true });
    } catch (error) {
      console.error('🚨 [useStaffAuth] logout failed', error);
      setRuntimeError(error instanceof Error ? error.message : String(error));
    }
  };

  return { staff, isAdmin, logout, runtimeError };
}
