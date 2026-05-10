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
import type { StaffUser } from '@/lib/types';

export function useStaffAuth() {
  const navigate = useNavigate();
  const { user, roles, loading, signOut } = useAuth();
  const [staff, setStaff] = useState<StaffUser | null>(() => getCurrentStaff());

  useEffect(() => {
    if (loading) return;
    if (!user) {
      setStaff(null);
      navigate('/staff/login', { replace: true });
      return;
    }
    setStaff(getCurrentStaff());
  }, [user, loading, navigate]);

  const isAdmin = (staff?.role === 'admin') || roles.includes('admin');

  const logout = async () => {
    await signOut();
    setStaff(null);
    navigate('/staff/login', { replace: true });
  };

  return { staff, isAdmin, logout };
}
