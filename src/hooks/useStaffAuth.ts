/**
 * Staff auth hook — Supabase-backed.
 *
 * Public shape preserved (`{ staff, isAdmin, logout }`). The legacy
 * bridge inside AuthContext keeps `getCurrentStaff()` populated so the
 * existing services and components continue to work.
 */
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { getCurrentStaff } from '@/services';
import { syncLegacyStaffSession } from '@/services/auth/legacyBridge';
import { clearLegacySessions } from '@/services/auth/legacyBridge';
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
        // Customer (or roleless) navigated into staff area: hard reject.
        clearLegacySessions();
        setStaff(null);
        setRuntimeError(`Acceso denegado: rol no autorizado (${roles.join(',') || 'none'})`);
        navigate('/cliente/dashboard', { replace: true });
        return;
      }
      const current = getCurrentStaff() ?? syncLegacyStaffSession(user, roles);
      setStaff(current);
      setRuntimeError(current ? null : 'No se pudo crear/leer sessionStaff legacy para usuario con rol staff');
    } catch (error) {
      console.error('🚨 [useStaffAuth] crashed', error);
      setRuntimeError(error instanceof Error ? error.message : String(error));
    }
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
