import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getCurrentStaff, logoutStaff } from '@/lib/store';

export function useStaffAuth() {
  const navigate = useNavigate();
  const staff = getCurrentStaff();
  const isAdmin = staff?.role === 'admin';

  useEffect(() => {
    if (!staff) navigate('/staff/login');
  }, [staff, navigate]);

  const logout = () => {
    logoutStaff();
    navigate('/staff/login');
  };

  return { staff, isAdmin, logout };
}
