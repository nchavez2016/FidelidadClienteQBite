import { useEffect, type ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth, type AppRole } from '@/hooks/useAuth';

interface ProtectedRouteProps {
  children: ReactNode;
  /** If omitted, only authentication is required. */
  allowedRoles?: AppRole[];
  /** Where to send unauthenticated users (defaults to customer login). */
  redirectTo?: string;
}

export function ProtectedRoute({ children, allowedRoles, redirectTo = '/cliente/login' }: ProtectedRouteProps) {
  const { user, roles: userRoles, loading, rolesLoaded } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const allowed = !allowedRoles || allowedRoles.length === 0
    ? !!user
    : !!user && userRoles.some((r) => allowedRoles.includes(r));

  useEffect(() => {
    if (loading) return;
    if (!user) {
      console.info('[AUTHZ]', { route: location.pathname, roles: userRoles, allow: false, deny_reason: 'no_user' });
      navigate(redirectTo, { replace: true });
      return;
    }
    if (!rolesLoaded) return;
    if (allowedRoles && allowedRoles.length > 0 && !userRoles.some((r) => allowedRoles.includes(r))) {
      const fallback = userRoles.includes('admin') || userRoles.includes('cashier')
        ? '/staff/panel'
        : '/cliente/dashboard';
      console.warn('[AUTHZ]', { route: location.pathname, roles: userRoles, required: allowedRoles, allow: false, deny_reason: 'role_mismatch', fallback });
      navigate(fallback, { replace: true });
      return;
    }
    console.info('[AUTHZ]', { route: location.pathname, roles: userRoles, required: allowedRoles ?? null, allow: true });
  }, [user, userRoles, loading, rolesLoaded, allowedRoles, redirectTo, navigate, location.pathname]);

  if (loading || (user && !rolesLoaded)) {
    return (
      <div className="min-h-screen flex items-center justify-center text-muted-foreground">
        Cargando…
      </div>
    );
  }
  if (!user) return null;
  if (!allowed) return null;
  return <>{children}</>;
}