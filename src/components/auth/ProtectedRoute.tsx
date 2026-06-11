import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth, type AppRole } from '@/hooks/useAuth';
import { appRoute } from '@/lib/navigation';

interface ProtectedRouteProps {
  children: ReactNode;
  /** If omitted, only authentication is required. */
  allowedRoles?: AppRole[];
  /** Where to send unauthenticated users (defaults to customer login). */
  redirectTo?: string;
}

/**
 * Synchronous, render-time authorization gate.
 *
 * Hard rules:
 *  - Children NEVER render until BOTH `loading === false` AND
 *    `rolesLoaded === true`. While either is pending, render the
 *    loading screen — never `children`, never `null`.
 *  - Decisions use `<Navigate replace />` (no useEffect, no async
 *    redirect). This guarantees zero frames of protected UI for an
 *    unauthorized user.
 *  - Source of truth = `AuthContext.roles`. Legacy storage
 *    (`sessionStaff`, `getCurrentStaff`) is NEVER consulted here.
 */
export function ProtectedRoute({ children, allowedRoles, redirectTo = '/cliente/login' }: ProtectedRouteProps) {
  const { user, roles, loading, rolesLoaded } = useAuth();
  const location = useLocation();
  const requiredRoles = allowedRoles ?? null;

  // Phase 1 — auth not fully resolved → loading screen, no decisions.
  const authLoaded = !loading;
  if (!authLoaded || (user && !rolesLoaded)) {
    console.debug('[AUTHZ_ROUTE]', {
      pathname: location.pathname,
      roles: rolesLoaded ? roles : null,
      requiredRoles,
      authLoaded,
      rolesLoaded,
      allowed: 'pending',
    });
    return (
      <div className="min-h-screen flex items-center justify-center text-muted-foreground">
        Cargando…
      </div>
    );
  }

  // Phase 2 — no session → redirect to login synchronously.
  if (!user) {
    console.warn('[AUTHZ_DENY]', { route: location.pathname, roles: null, required: requiredRoles, reason: 'no_user' });
    return <Navigate to={appRoute(redirectTo)} replace state={{ from: location.pathname }} />;
  }

  // Phase 3 — role check. roles is guaranteed loaded here.
  const requires = requiredRoles && requiredRoles.length > 0;
  const allowed = !requires || roles.some((r) => requiredRoles!.includes(r));

  if (!allowed) {
    const fallback = roles.includes('admin') || roles.includes('cashier')
      ? '/staff/panel'
      : roles.includes('customer')
        ? '/cliente/dashboard'
        : redirectTo;
    console.warn('[AUTHZ_DENY]', {
      route: location.pathname,
      roles,
      required: requiredRoles,
      reason: 'role_mismatch',
      fallback,
    });
    return <Navigate to={appRoute(fallback)} replace />;
  }

  console.debug('[AUTHZ_ROUTE]', {
    pathname: location.pathname,
    roles,
    requiredRoles,
    authLoaded: true,
    rolesLoaded: true,
    allowed: true,
  });
  return <>{children}</>;
}