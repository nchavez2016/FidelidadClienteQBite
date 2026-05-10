import { useEffect, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth, type AppRole } from '@/hooks/useAuth';

interface ProtectedRouteProps {
  children: ReactNode;
  /** If omitted, only authentication is required. */
  roles?: AppRole[];
  /** Where to send unauthenticated users (defaults to customer login). */
  redirectTo?: string;
}

export function ProtectedRoute({ children, roles, redirectTo = '/cliente/login' }: ProtectedRouteProps) {
  const { user, roles: userRoles, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (loading) return;
    if (!user) {
      navigate(redirectTo, { replace: true });
      return;
    }
    if (roles && roles.length > 0 && !userRoles.some((r) => roles.includes(r))) {
      // Role mismatch: send admins/cashiers to their panel, customers to dashboard.
      const fallback = userRoles.includes('admin') || userRoles.includes('cashier')
        ? '/staff/panel'
        : '/cliente/dashboard';
      navigate(fallback, { replace: true });
    }
  }, [user, userRoles, loading, roles, redirectTo, navigate]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-muted-foreground">
        Cargando…
      </div>
    );
  }
  if (!user) return null;
  if (roles && roles.length > 0 && !userRoles.some((r) => roles.includes(r))) return null;
  return <>{children}</>;
}