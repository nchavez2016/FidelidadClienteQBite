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
  const { user, roles: userRoles, loading, rolesLoaded } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (loading) return;
    if (!user) {
      console.debug('[ProtectedRoute] no user → redirect', { redirectTo });
      navigate(redirectTo, { replace: true });
      return;
    }
    // Wait until roles are hydrated before deciding role-based redirects.
    if (!rolesLoaded) return;
    if (roles && roles.length > 0 && !userRoles.some((r) => roles.includes(r))) {
      const fallback = userRoles.includes('admin') || userRoles.includes('cashier')
        ? '/staff/panel'
        : '/cliente/dashboard';
      console.debug('[ProtectedRoute] role mismatch', { required: roles, userRoles, fallback });
      navigate(fallback, { replace: true });
    }
  }, [user, userRoles, loading, rolesLoaded, roles, redirectTo, navigate]);

  if (loading || (user && !rolesLoaded)) {
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