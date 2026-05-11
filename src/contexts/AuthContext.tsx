/**
 * Real Supabase Auth context.
 *
 * Single source of truth for "who is logged in". Listens to
 * `supabase.auth.onAuthStateChange` and resolves the user's roles from
 * `public.user_roles`. Legacy hooks (`useCustomerSession`, `useStaffAuth`)
 * remain functional during the migration but new code should consume this.
 */
import {
  createContext,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { clearLegacySessions } from '@/services/auth/legacyBridge';
import { hydrateCustomerPoints } from '@/services/customerPoints.service';
import { hydrateLedgerHistory } from '@/services/ledgerHistory.service';

export type AppRole = 'admin' | 'cashier' | 'customer';

export interface AuthContextValue {
  user: User | null;
  session: Session | null;
  roles: AppRole[];
  /** True once roles have been fetched for the current user (or when signed out). */
  rolesLoaded: boolean;
  loading: boolean;
  signIn: (
    identifier: string,
    password: string,
    audience: 'customer' | 'staff',
  ) => Promise<{ error: string | null }>;
  signUp: (
    identifier: string,
    password: string,
    audience: 'customer' | 'staff',
    metadata?: Record<string, unknown>,
  ) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  hasRole: (...roles: AppRole[]) => boolean;
}

export const AuthContext = createContext<AuthContextValue | undefined>(undefined);

/**
 * Customers identify by phone, staff by username. Supabase Auth requires an
 * email/password pair, so we map the legacy identifier to a synthetic email
 * inside an internal domain. This keeps UX identical while storing real
 * sessions in `auth.users`.
 *
 * NOTE: disable "Confirm email" in Supabase → Authentication → Providers →
 * Email, otherwise these synthetic addresses cannot complete signup.
 */
const CUSTOMER_DOMAIN = 'phone.gaviota.local';
const STAFF_DOMAIN = 'staff.gaviota.local';

function toEmail(identifier: string, audience: 'customer' | 'staff'): string {
  const cleaned = identifier.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
  return `${cleaned}@${audience === 'customer' ? CUSTOMER_DOMAIN : STAFF_DOMAIN}`;
}

async function fetchRoles(userId: string): Promise<AppRole[]> {
  try {
    console.info('🚨 [Auth] fetchRoles:start', { userId });
    const { data, error } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', userId);
    if (error) {
      console.error('🚨 [Auth] fetchRoles:error', error);
      return [];
    }
    const result = (data ?? []).map((r) => r.role as AppRole);
    console.info('🚨 [Auth] fetchRoles:done', { userId, roles: result });
    return result;
  } catch (error) {
    console.error('🚨 [Auth] fetchRoles:crashed', error);
    return [];
  }
}

async function fetchProfile(userId: string): Promise<void> {
  const { data, error } = await supabase.from('profiles').select('*').eq('id', userId).maybeSingle();
  if (error) console.error('🚨 [Auth] fetchProfile:error', error);
  else console.info('🚨 [Auth] fetchProfile:done', { profile: data });
}

function bridgeLegacy(_user: User, _roles: AppRole[]): void {
  // Phase 2.8 — defensive only: wipe any stale legacy session slots so
  // sync consumers can't read them. AuthContext is the sole identity.
  try {
    clearLegacySessions();
  } catch (error) {
    console.error('[Auth] clearLegacySessions crashed', error);
  }
}

/** Post-auth hydrations that require an authenticated session (RLS). */
function postAuthHydrate(): void {
  void hydrateCustomerPoints().catch((err) => console.error('[Auth] hydrateCustomerPoints failed', err));
  void hydrateLedgerHistory().catch((err) => console.error('[Auth] hydrateLedgerHistory failed', err));
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [rolesLoaded, setRolesLoaded] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // 1. Subscribe FIRST so we never miss an event.
    const { data: subscription } = supabase.auth.onAuthStateChange((event, nextSession) => {
      console.debug('[Auth] onAuthStateChange', { event, hasSession: !!nextSession });
      setSession(nextSession);
      setUser(nextSession?.user ?? null);
      if (nextSession?.user) {
        setRolesLoaded(false);
        // Defer Supabase calls to avoid deadlocks inside the listener.
        setTimeout(() => {
          fetchProfile(nextSession.user.id).catch((error) => console.error('🚨 [Auth] listener profile rejected', error));
          fetchRoles(nextSession.user.id).then((r) => {
            console.info('🚨 [Auth] roles fetched (listener)', r);
            setRoles(r);
            // CRITICAL: bridgeLegacy must run BEFORE setRolesLoaded(true)
            // so that ProtectedRoute / CustomerDashboard see a hydrated
            // sessionCustomer slot on the very same render that unblocks them.
            bridgeLegacy(nextSession.user, r);
            setRolesLoaded(true);
            postAuthHydrate();
          }).catch((error) => {
            console.error('🚨 [Auth] listener roles rejected', error);
            setRoles([]);
            setRolesLoaded(true);
          });
        }, 0);
      } else {
        setRoles([]);
        setRolesLoaded(true);
        clearLegacySessions();
      }
    });

    // 2. Then hydrate the existing session.
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setUser(data.session?.user ?? null);
      console.info('🚨 [Auth] getSession:done', { hasSession: !!data.session, uid: data.session?.user?.id });
      if (data.session?.user) {
        fetchProfile(data.session.user.id).catch((error) => console.error('🚨 [Auth] init profile rejected', error));
        fetchRoles(data.session.user.id).then((r) => {
          console.info('🚨 [Auth] roles fetched (init)', r);
          setRoles(r);
          // Hydrate legacy customer slot BEFORE flipping rolesLoaded so
          // sync consumers (getCurrentCustomer) find the row immediately.
          bridgeLegacy(data.session!.user, r);
          setRolesLoaded(true);
          postAuthHydrate();
          setLoading(false);
        }).catch((error) => {
          console.error('🚨 [Auth] init roles rejected', error);
          setRoles([]);
          setRolesLoaded(true);
          setLoading(false);
        });
      } else {
        clearLegacySessions();
        setRolesLoaded(true);
        setLoading(false);
      }
    });

    return () => subscription.subscription.unsubscribe();
  }, []);

  const signIn = useCallback<AuthContextValue['signIn']>(async (identifier, password, audience) => {
    const email = toEmail(identifier, audience);
    console.info('🚨 [Auth] login request', { audience, identifier, email });
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    console.info('🚨 [Auth] login response', { hasSession: !!data.session, uid: data.user?.id, error });
    if (data?.session && data.user) {
      // Set state synchronously so callers can navigate immediately
      // without racing the onAuthStateChange listener.
      setSession(data.session);
      setUser(data.user);
      setRolesLoaded(false);
      await fetchProfile(data.user.id);
      const r = await fetchRoles(data.user.id);
      console.info('🚨 [Auth] signIn roles', { audience, r });
      setRoles(r);
      bridgeLegacy(data.user, r);
      setRolesLoaded(true);
      postAuthHydrate();
    }
    return { error: error?.message ?? null };
  }, []);

  const signUp = useCallback<AuthContextValue['signUp']>(async (identifier, password, audience, metadata) => {
    const email = toEmail(identifier, audience);
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/`,
        data: { ...metadata, audience, identifier },
      },
    });
    if (data?.session && data.user) {
      setSession(data.session);
      setUser(data.user);
      setRolesLoaded(false);
      const r = await fetchRoles(data.user.id);
      setRoles(r);
      bridgeLegacy(data.user, r);
      setRolesLoaded(true);
      postAuthHydrate();
    }
    return { error: error?.message ?? null };
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    clearLegacySessions();
    setSession(null);
    setUser(null);
    setRoles([]);
    setRolesLoaded(true);
  }, []);

  const hasRole = useCallback(
    (...wanted: AppRole[]) => roles.some((r) => wanted.includes(r)),
    [roles],
  );

  const value = useMemo<AuthContextValue>(
    () => ({ user, session, roles, rolesLoaded, loading, signIn, signUp, signOut, hasRole }),
    [user, session, roles, rolesLoaded, loading, signIn, signUp, signOut, hasRole],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}