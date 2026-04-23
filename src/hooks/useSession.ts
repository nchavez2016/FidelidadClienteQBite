/**
 * Unified session hook.
 *
 * Reads the cross-audience `Session` produced by the auth service and
 * exposes role-aware helpers. Existing `useStaffAuth` / `useCustomerSession`
 * keep working untouched; new code can adopt this hook to be agnostic to
 * which audience is signed in (handy for shared UI like headers).
 *
 * On Supabase swap, the only change here is replacing `getCurrentSession()`
 * with a `useSyncExternalStore` over `supabase.auth.onAuthStateChange`.
 */
import { useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getCurrentSession, clearSession } from '@/services';
import type { Session, Role } from '@/services/auth/types';

export function useSession(redirectTo?: string) {
  const navigate = useNavigate();
  const [session, setSession] = useState<Session | null>(() => getCurrentSession());

  const refresh = useCallback(() => setSession(getCurrentSession()), []);

  const logout = useCallback(() => {
    clearSession();
    setSession(null);
    if (redirectTo) navigate(redirectTo);
  }, [navigate, redirectTo]);

  const hasRole = useCallback(
    (...roles: Role[]) => Boolean(session && roles.includes(session.profile.role)),
    [session],
  );

  return { session, refresh, logout, hasRole };
}
