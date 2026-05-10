/**
 * Staff auth hook — Supabase-backed.
 *
 * Public shape preserved (`{ staff, isAdmin, logout }`). The legacy
 * bridge inside AuthContext keeps `getCurrentStaff()` populated so the
 * existing services and components continue to work.
 */
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { getCurrentStaff } from '@/services';
import { syncLegacyStaffSession } from '@/services/auth/legacyBridge';
import type { StaffUser } from '@/lib/types';

export function useStaffAuth() {
  const navigate = useNavigate();
  const { user, roles, loading, rolesLoaded, signOut } = useAuth();
  const [staff, setStaff] = useState<StaffUser | null>(() => getCurrentStaff());
  const [runtimeError, setRuntimeError] = useState<string | null>(null);

  useEffect(() => {
    try {
      console.info('🚨 [useStaffAuth] state', { hasUser: !!user, roles, loading, rolesLoaded, legacyStaff: getCurrentStaff() });
      if (loading || (user && !rolesLoaded)) return;
      if (!user) {
        setStaff(null);
        navigate('/staff/login', { replace: true });
        return;
      }
      if (!roles.includes('admin') && !roles.includes('cashier')) {
        setRuntimeError(`Usuario autenticado sin rol staff. roles=${roles.join(',') || 'none'}`);
        setStaff(null);
        navigate('/cliente/dashboard', { replace: true });
        return;
      }
      const current = getCurrentStaff() ?? syncLegacyStaffSession(user, roles);
      console.info('🚨 [useStaffAuth] resolved staff', { current });
      setStaff(current);
      setRuntimeError(current ? null : 'No se pudo crear/leer sessionStaff legacy para usuario con rol staff');
    } catch (error) {
      console.error('🚨 [useStaffAuth] crashed', error);
      setRuntimeError(error instanceof Error ? error.message : String(error));
    }
  }, [user, roles, loading, rolesLoaded, navigate]);

  const isAdmin = (staff?.role === 'admin') || roles.includes('admin');

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
