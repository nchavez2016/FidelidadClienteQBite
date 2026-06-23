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
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { clearLegacySessions } from '@/services/auth/legacyBridge';
import { hydrateCampaigns } from '@/services/campaigns.service';
import { hydrateCustomerPoints, subscribeCustomerPointsRealtime } from '@/services/customerPoints.service';
import { hydrateLedgerHistory, rehydrateLedgerHistory } from '@/services/ledgerHistory.service';
import { subscribePointTransactionsRealtime } from '@/services/pointsLedger.service';
import { hydrateCustomers } from '@/services/customers.service';
import IdleWarningDialog from '@/components/security/IdleWarningDialog';
import { useIdleTimeout } from '@/hooks/useIdleTimeout';
import { isIdleTimeoutEnabled } from '@/services/security/sessionPolicy';

export type AppRole = 'admin' | 'cashier' | 'customer';

export interface AuthContextValue {
  user: User | null;
  session: Session | null;
  roles: AppRole[];
  /** True once roles have been fetched for the current user (or when signed out). */
  rolesLoaded: boolean;
  loading: boolean;
  /** True while background post-auth hydration is running after a reload. */
  isHydrating: boolean;
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
async function hydratePostAuth(audience?: 'customer' | 'staff'): Promise<void> {
  const jobs: Promise<unknown>[] = [
    hydrateCampaigns(),
    hydrateCustomerPoints(),
    hydrateLedgerHistory(),
  ];

  // Profiles are RLS-gated; only hydrate after the user has authenticated.
  // It is critical for customer/staff panels because their first render reads
  // from the synchronous cache; without this, the route opens blank for a frame.
  jobs.push(hydrateCustomers());

  const results = await Promise.allSettled(jobs);
  results.forEach((result, index) => {
    if (result.status === 'rejected') {
      console.error('[Auth] post-auth hydrate failed', { audience, index, reason: result.reason });
    }
  });

  // Phase 3.4 — start realtime listeners (idempotent, shared channels).
  try {
    subscribePointTransactionsRealtime();
    subscribeCustomerPointsRealtime();
  } catch (err) {
    console.error('[Auth] realtime subscribe failed', err);
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [rolesLoaded, setRolesLoaded] = useState(false);
  const [loading, setLoading] = useState(true);
  const [isHydrating, setIsHydrating] = useState(false);
  // Mantener el último user.id visto por el listener para distinguir
  // TOKEN_REFRESHED / USER_UPDATED del mismo usuario (no debe remount)
  // vs SIGNED_IN de un usuario distinto (sí re-hidratar roles).
  const lastUserIdRef = useRef<string | null>(null);
  // Tracks which user id we have ALREADY fetched roles for. Used to dedupe
  // the listener's deferred fetch when signIn()/getSession() already
  // resolved roles for the same user — otherwise rolesLoaded flips
  // false→true twice in a row and ProtectedRoute remounts the page
  // (visible as a "double reload / flash" right after login).
  const rolesLoadedForUserRef = useRef<string | null>(null);
  // True while signIn()/signUp() is mid-flight. Supabase fires
  // onAuthStateChange BEFORE signInWithPassword resolves, so the
  // listener sees lastUserIdRef=null and treats it as a brand-new
  // user → setRolesLoaded(false). Combined with the navigate() that
  // immediately follows signIn, ProtectedRoute briefly renders the
  // "Cargando…" screen between login page and dashboard. Suppress
  // the listener's reset while we're driving the sign-in ourselves.
  const signInInFlightRef = useRef(false);

  useEffect(() => {
    // 1. Subscribe FIRST so we never miss an event.
    const { data: subscription } = supabase.auth.onAuthStateChange((event, nextSession) => {
      console.debug('[Auth] onAuthStateChange', { event, hasSession: !!nextSession });
      setSession(nextSession);
      setUser(nextSession?.user ?? null);
      if (nextSession?.user) {
        const prevUserId = lastUserIdRef.current;
        const sameUser = prevUserId === nextSession.user.id;
        lastUserIdRef.current = nextSession.user.id;

        // Para el mismo usuario, un TOKEN_REFRESHED / USER_UPDATED no debe
        // disparar setRolesLoaded(false): eso desmonta StaffPanel y borra el
        // estado local (cliente seleccionado, búsqueda, comentarios…) cada
        // vez que la pestaña del navegador pierde y recupera el foco.
        // Supabase también puede emitir SIGNED_IN al reenfocar una pestaña con
        // la misma sesión; debe tratarse como continuidad, no como nuevo login.
        if (sameUser) {
          return;
        }

        // Si signIn()/signUp() está en curso, esa llamada se encargará de
        // hidratar roles y avisar a la UI. No reseteamos rolesLoaded aquí
        // para evitar un destello "Cargando…" entre login y dashboard.
        if (signInInFlightRef.current) {
          return;
        }

        setRolesLoaded(false);
        // Defer Supabase calls to avoid deadlocks inside the listener.
        setTimeout(() => {
          // Dedupe: if signIn()/getSession() already loaded roles for
          // this user between the listener firing and this microtask
          // running, skip the redundant round-trip + state churn.
          if (rolesLoadedForUserRef.current === nextSession.user.id) {
            setRolesLoaded(true);
            return;
          }
          fetchProfile(nextSession.user.id).catch((error) => console.error('🚨 [Auth] listener profile rejected', error));
          fetchRoles(nextSession.user.id).then((r) => {
            console.info('🚨 [Auth] roles fetched (listener)', r);
            setRoles(r);
            // CRITICAL: bridgeLegacy + post-auth hydration must run BEFORE
            // setRolesLoaded(true), otherwise ProtectedRoute opens the panel
            // while its sync caches are still empty and the user sees a flash.
            bridgeLegacy(nextSession.user, r);
            hydratePostAuth().finally(() => {
              rolesLoadedForUserRef.current = nextSession.user.id;
              setRolesLoaded(true);
            });
          }).catch((error) => {
            console.error('🚨 [Auth] listener roles rejected', error);
            setRoles([]);
            setRolesLoaded(true);
          });
        }, 0);
      } else {
        lastUserIdRef.current = null;
        rolesLoadedForUserRef.current = null;
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
        lastUserIdRef.current = data.session.user.id;
        fetchProfile(data.session.user.id).catch((error) => console.error('🚨 [Auth] init profile rejected', error));
        fetchRoles(data.session.user.id).then((r) => {
          console.info('🚨 [Auth] roles fetched (init)', r);
          setRoles(r);
          // Reload path: flip rolesLoaded/loading immediately so `/` and the
          // shell render without waiting on background hydration. Panels show
          // a skeleton while `isHydrating` is true (see CustomerDashboard /
          // StaffPanel). signIn/signUp branches still await hydratePostAuth
          // to avoid post-login flash.
          bridgeLegacy(data.session!.user, r);
          rolesLoadedForUserRef.current = data.session!.user.id;
          setRolesLoaded(true);
          setLoading(false);
          setIsHydrating(true);
          void hydratePostAuth()
            .catch((err) => console.error('Hydration error:', err))
            .finally(() => setIsHydrating(false));
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

  // Phase 4 — visibilitychange rehydrate (single-flight + 5s throttle inside).
  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === 'visible' && user) {
        void rehydrateLedgerHistory().catch(err =>
          console.warn('[Auth] visibility rehydrate failed', err),
        );
      }
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [user]);

  const signIn = useCallback<AuthContextValue['signIn']>(async (identifier, password, audience) => {
    const email = toEmail(identifier, audience);
    console.info('🚨 [Auth] login request', { audience, identifier, email });
    signInInFlightRef.current = true;
    try {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    console.info('🚨 [Auth] login response', { hasSession: !!data.session, uid: data.user?.id, error });
    if (data?.session && data.user) {
      // Set state synchronously so callers can navigate immediately
      // without racing the onAuthStateChange listener.
      lastUserIdRef.current = data.user.id;
      setSession(data.session);
      setUser(data.user);
      setRolesLoaded(false);
      await fetchProfile(data.user.id);
      const r = await fetchRoles(data.user.id);
      console.info('🚨 [Auth] signIn roles', { audience, r });
      setRoles(r);
      bridgeLegacy(data.user, r);
      await hydratePostAuth(audience);
      rolesLoadedForUserRef.current = data.user.id;
      setRolesLoaded(true);
    }
    return { error: error?.message ?? null };
    } finally {
      signInInFlightRef.current = false;
    }
  }, []);

  const signUp = useCallback<AuthContextValue['signUp']>(async (identifier, password, audience, metadata) => {
    const email = toEmail(identifier, audience);
    signInInFlightRef.current = true;
    try {
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
      await hydratePostAuth(audience);
      rolesLoadedForUserRef.current = data.user.id;
      setRolesLoaded(true);
    }
    return { error: error?.message ?? null };
    } finally {
      signInInFlightRef.current = false;
    }
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    clearLegacySessions();
    setSession(null);
    setUser(null);
    setRoles([]);
    setRolesLoaded(true);
    rolesLoadedForUserRef.current = null;
    lastUserIdRef.current = null;
  }, []);

  const hasRole = useCallback(
    (...wanted: AppRole[]) => roles.some((r) => wanted.includes(r)),
    [roles],
  );

  const value = useMemo<AuthContextValue>(
    () => ({ user, session, roles, rolesLoaded, loading, isHydrating, signIn, signUp, signOut, hasRole }),
    [user, session, roles, rolesLoaded, loading, isHydrating, signIn, signUp, signOut, hasRole],
  );

  // Phase 4.6 — idle-timeout warning. Auto-logout itself stays gated by
  // the IDLE_TIMEOUT_ENABLED feature flag inside the hook.
  const primaryRole: AppRole | null =
    roles.includes('admin') ? 'admin'
    : roles.includes('cashier') ? 'cashier'
    : roles.includes('customer') ? 'customer'
    : null;
  const idle = useIdleTimeout({
    // Solo activamos el hook (y por tanto el modal de aviso) cuando el
    // auto-logout por inactividad está habilitado por flag. Si no, el
    // modal aparecía periódicamente (~30 min en staff) y el usuario lo
    // percibía como "la pantalla se pone azul y se recarga sola".
    enabled: !!user && !!primaryRole && isIdleTimeoutEnabled(),
    role: primaryRole,
    onTimeout: () => { void signOut(); },
  });

  return (
    <AuthContext.Provider value={value}>
      {children}
      <IdleWarningDialog
        open={idle.warning}
        remainingSec={idle.remainingSec}
        onStay={idle.dismiss}
        onLogout={() => { void signOut(); }}
      />
    </AuthContext.Provider>
  );
}