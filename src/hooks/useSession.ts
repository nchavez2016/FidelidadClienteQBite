/**
 * Unified session hook — bridges Supabase Auth into the legacy
 * `Session` shape so shared UI (headers, etc.) works for both
 * audiences without knowing which signed in.
 */
import { useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { getCurrentSession } from '@/services';
import type { Session, Role } from '@/services/auth/types';

export function useSession(redirectTo?: string) {
  const { user, roles, signOut } = useAuth();

  const session: Session | null = useMemo(() => {
    if (!user) return null;
    return getCurrentSession();
  }, [user, roles]);

  const navigate = useNavigate();

  const refresh = useCallback(() => {
    /* No-op: AuthContext is the source of truth. */
  }, []);

  const logout = useCallback(async () => {
    await signOut();
    if (redirectTo) navigate(redirectTo, { replace: true });
  }, [signOut, navigate, redirectTo]);

  const hasRole = useCallback(
    (...wanted: Role[]) => {
      if (roles.some((r) => wanted.includes(r as Role))) return true;
      return Boolean(session && wanted.includes(session.profile.role));
    },
    [roles, session],
  );

  return { session, refresh, logout, hasRole };
}
