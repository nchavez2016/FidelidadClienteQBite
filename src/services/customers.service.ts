/**
 * Customers domain service.
 *
 * Pure data-access layer — no React, no UI. Now backed by `dbAdapter`
 * instead of touching localStorage directly. Passwords have been moved
 * to `credentials.service.ts`. Points have been moved to
 * `customerPoints.service.ts` (with a denormalized cache on the row to
 * preserve the current sync UI contract).
 *
 * TODO(Supabase):
 *   - Replace `db.*` calls with `supabase.from('customers')...`.
 *   - Apply RLS: customer can read self; staff scoped by branch; admin all.
 *   - Drop the `pointsByCampaign` cache once UI consumes points async.
 */
import { Customer, Gender } from '@/lib/types';
import { db, TABLES } from './dbAdapter';
import { supabase } from '@/integrations/supabase/client';
import { getActiveCampaigns } from './campaigns.service';
import {
  validateOrThrow,
  customerRegistrationSchema,
  customerLoginSchema,
} from './validation';
import {
  setCredential,
  verifyCredential,
  updateCredentialIdentifier,
  getCredentialPassword,
} from './credentials.service';
import {
  getPoints,
  getPointsByCustomer,
  applyLedgerBalance,
} from './customerPoints.service';
import { registerConsent, revokeConsent as revokeConsentRecord } from './consent.service';
import { logAudit } from './audit.service';

const PROFILES_TABLE = 'profiles';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isUuid = (v: string) => UUID_RE.test(v);

/** True when the id belongs to the legacy localStorage-only customer space. */
export function isLegacyCustomerId(id: string): boolean {
  return id.startsWith('cust-');
}

function warnLegacy(op: string, id: string): void {
  if (isLegacyCustomerId(id)) {
    console.warn(
      `[customers] @deprecated legacy customer used in "${op}"`,
      { id, hint: 'cust-xxx ids are local-only; migrate to Supabase Auth' },
    );
  }
}

interface ProfileRow {
  id: string;
  display_name: string;
  phone: string | null;
  gender: Gender | null;
  is_active: boolean;
  deleted_at: string | null;
  created_at: string;
  accepted_campaigns: string[] | null;
  revoked_from_phone: string | null;
  legacy_id: string | null;
}

function profileToCustomer(r: ProfileRow): Customer {
  return {
    id: r.id,
    phone: r.phone ?? '',
    name: r.display_name || (r.phone ?? ''),
    gender: (r.gender ?? null) as Gender | null,
    pointsByCampaign: {},
    acceptedCampaigns: r.accepted_campaigns ?? [],
    isActive: r.is_active,
    deletedAt: r.deleted_at ?? undefined,
    revokedFromPhone: r.revoked_from_phone ?? undefined,
    createdAt: r.created_at,
  };
}

let profilesHydrated = false;
let profilesInflight: Promise<void> | null = null;

/**
 * Hydrate the local customers cache from `public.profiles`. Merges
 * Supabase-backed profiles (uuid ids) on top of legacy localStorage rows
 * so the existing sync UI keeps reading from a single source.
 */
export async function hydrateCustomers(): Promise<void> {
  if (profilesInflight) return profilesInflight;
  profilesInflight = (async () => {
    try {
      // Scope strictly to customer-roled profiles. user_roles has no FK to
      // profiles, so we resolve customer ids first then fetch profiles.
      const { data: roleRows, error: roleErr } = await supabase
        .from('user_roles')
        .select('user_id')
        .eq('role', 'customer');
      if (roleErr) throw roleErr;
      const customerIds = Array.from(
        new Set(((roleRows ?? []) as { user_id: string }[]).map(r => r.user_id)),
      );
      let rows: ProfileRow[] = [];
      if (customerIds.length > 0) {
        const { data, error } = await supabase
          .from(PROFILES_TABLE)
          .select('*')
          .in('id', customerIds)
          .is('deleted_at', null);
        if (error) throw error;
        rows = (data as ProfileRow[] | null) ?? [];
      } else {
        // Cashier RLS may block user_roles reads. Fallback to profiles, which
        // for cashiers is already filtered to customer-roled profiles by
        // policy `profiles_select_staff`.
        const { data, error } = await supabase
          .from(PROFILES_TABLE)
          .select('*')
          .is('deleted_at', null);
        if (error) throw error;
        rows = (data as ProfileRow[] | null) ?? [];
      }
      const local = db.readSync<any>(TABLES.customers);
      const localById = new Map<string, any>();
      for (const c of local) localById.set(c.id, c);
      const next: any[] = [];
      // Preserve legacy local-only customers (cust-xxx) — they never lived in Supabase.
      for (const c of local) if (isLegacyCustomerId(c.id)) next.push(c);
      // Only include profiles that belong to the customer-roled set.
      for (const r of rows) {
        const prev = localById.get(r.id);
        const merged = { ...(prev ?? {}), ...profileToCustomer(r) };
        merged.pointsByCampaign = (prev as any)?.pointsByCampaign ?? {};
        next.push(merged);
      }
      db.writeSync(TABLES.customers, next);
      profilesHydrated = true;
    } catch (err) {
      console.error('[customers] hydrate failed', err);
    } finally {
      profilesInflight = null;
    }
  })();
  return profilesInflight;
}

export function isCustomersHydrated(): boolean {
  return profilesHydrated;
}

/**
 * Persist a profile patch to Supabase when the customer is auth-backed
 * (uuid id). Legacy `cust-xxx` ids stay local-only.
 */
async function persistProfilePatch(id: string, patch: Partial<ProfileRow>): Promise<void> {
  if (!isUuid(id)) return;
  const { error } = await supabase
    .from(PROFILES_TABLE)
    .update(patch as never)
    .eq('id', id);
  if (error) console.error('[customers] profile update failed', error, { id, patch });
}

function withDerivedFields(c: any): Customer {
  const base: Customer = {
    ...c,
    pointsByCampaign: c.pointsByCampaign || {},
    acceptedCampaigns: c.acceptedCampaigns || [],
    isActive: c.isActive !== false,
  };
  // Hydrate denormalized points cache from the normalized table.
  base.pointsByCampaign = getPointsByCustomer(c.id);
  return base;
}

export function getCustomers(): Customer[] {
  return db.readSync<any>(TABLES.customers).map(withDerivedFields);
}

/** Active customers only (excludes soft-deleted). */
export function getActiveCustomers(): Customer[] {
  return getCustomers().filter(c => c.isActive !== false);
}

export function getCustomerByPhone(phone: string): Customer | undefined {
  // Solo devuelve cuentas activas. Las cuentas dadas de baja liberaron el
  // teléfono (renombrado con sufijo), así que no compiten por el número.
  return getCustomers().find(c => c.phone === phone && c.isActive !== false);
}

/** Incluye cuentas dadas de baja (uso interno: auditoría / staff). */
export function findCustomersByOriginalPhone(phone: string): Customer[] {
  return getCustomers().filter(
    c => c.phone === phone || c.revokedFromPhone === phone,
  );
}

/** Historial de cuentas previas dadas de baja para un teléfono. */
export function getInactiveAccountsForPhone(phone: string): Customer[] {
  return getCustomers().filter(
    c => c.isActive === false && (c.revokedFromPhone === phone || c.phone === phone),
  );
}

export function getCustomerById(id: string): Customer | undefined {
  return getCustomers().find(c => c.id === id);
}

/**
 * Authoritative customer lookup by phone — queries Supabase `profiles`
 * directly (RLS scoped to staff/admin) and updates the local cache.
 * Falls back to the legacy localStorage cache only on network failure.
 *
 * Use from staff flows. Customer-side code should keep reading the local
 * session via `getCurrentCustomer()`.
 */
export async function searchCustomerByPhoneRemote(phone: string): Promise<Customer | null> {
  const trimmed = phone.trim();
  if (!trimmed) return null;
  try {
    const { data: profile, error } = await supabase
      .from(PROFILES_TABLE)
      .select('*')
      .eq('phone', trimmed)
      .is('deleted_at', null)
      .maybeSingle();

    if (error) {
      console.error('[customers] searchCustomerByPhoneRemote failed', error);
    } else if (profile) {
      const pRow = profile as ProfileRow;
      console.log('[CASHIER_SEARCH_PROFILE]', { id: pRow.id, phone: pRow.phone });

      const { data: pointsData, error: pointsErr } = await supabase
        .from('customer_points')
        .select('*')
        .eq('customer_id', pRow.id);

      if (pointsErr) {
        console.error('[customers] searchCustomerByPhoneRemote points failed', pointsErr);
      }

      console.log('[CASHIER_SEARCH_POINTS]', pointsData?.map(p => ({
        customer_id: p.customer_id,
        campaign_id: p.campaign_id,
        points: p.points
      })));

      const fresh = profileToCustomer(pRow);
      const pointsByCampaign: Record<string, number> = {};

      if (pointsData && pointsData.length > 0) {
        for (const pt of pointsData) {
          if (pt.customer_id === pRow.id) {
            pointsByCampaign[pt.campaign_id] = pt.points;
            // Seed the synchronous points cache so immediate callers get the correct balance
            applyLedgerBalance(pt.customer_id, pt.campaign_id, pt.points);
          }
        }
      }

      // Merge into local cache so subsequent sync getters see this row.
      const local = db.readSync<any>(TABLES.customers);
      const idx = local.findIndex((c: any) => c.id === fresh.id);
      const merged = { ...(idx >= 0 ? local[idx] : {}), ...fresh };
      // Overwrite local points with the fresh server truth
      merged.pointsByCampaign = pointsByCampaign;

      if (idx >= 0) local[idx] = merged; else local.push(merged);
      db.writeSync(TABLES.customers, local);

      // We don't use withDerivedFields here because it would blindly read the cache,
      // which we just seeded above. It's safer to explicitly attach the points we just built.
      return {
        ...withDerivedFields(merged),
        pointsByCampaign
      };
    }
  } catch (err) {
    console.error('[customers] searchCustomerByPhoneRemote crashed', err);
  }
  // Fallback: legacy local lookup (covers cust-xxx + offline scenarios).
  const legacy = getCustomerByPhone(trimmed);
  if (legacy) warnLegacy('searchCustomerByPhoneRemote:fallback', legacy.id);
  return legacy ?? null;
}

export interface RegisterCustomerOptions {
  /** LOPDP: must be true; the service blocks registration if false. */
  consentAccepted: boolean;
}

export function registerCustomer(
  phone: string,
  name: string,
  password: string,
  gender: Gender,
  options: RegisterCustomerOptions = { consentAccepted: false },
): Customer | null {
  // Phase 2.8 — legacy local-only registration is permanently disabled.
  // All new customers MUST go through Supabase Auth (CustomerRegister page
  // calls `useAuth().signUp`). This shim survives only so older imports
  // don't break the build.
  console.warn('[customers] registerCustomer is disabled (Phase 2.8). Use Supabase signUp.', { phone, name, gender, options });
  void password;
  return null;
}

/** Points for a customer in one specific campaign. */
export function getCustomerPoints(
  customer: Customer | undefined | null,
  campaignId: string,
): number {
  if (!customer) return 0;
  return getPoints(customer.id, campaignId);
}

/** Sum of points across every campaign (global totals). */
export function getCustomerTotalPoints(customer: Customer | undefined | null): number {
  if (!customer) return 0;
  return Object.values(getPointsByCustomer(customer.id)).reduce((s, n) => s + (n || 0), 0);
}

/**
 * @deprecated Phase 3.2 — direct point writes are forbidden. Use the ledger
 * RPCs (`earnPoints`, `redeemReward`, `adjustPoints`, `reverseTransaction`)
 * exported from `@/services/pointsLedger.service`.
 */
export function setCustomerPoints(id: string, campaignId: string, newPoints: number): void {
  console.warn(
    '[customers] @deprecated setCustomerPoints is a no-op. Use ledger RPCs.',
    { id, campaignId, newPoints },
  );
}

/** @deprecated Phase 3.2 — use ledger RPCs. */
export function updateCustomerPoints(id: string, newPoints: number): void {
  console.warn('[customers] @deprecated updateCustomerPoints is a no-op.', { id, newPoints });
}

export function resetCustomerPassword(id: string, newPassword: string): void {
  // TODO(Supabase Auth): supabase.auth.updateUser({ password }).
  const customer = getCustomerById(id);
  if (!customer) return;
  setCredential(id, 'phone', customer.phone, newPassword);
}

export function updateCustomerPhone(id: string, newPhone: string): boolean {
  if (getCustomerByPhone(newPhone)) return false;
  const list = db.readSync<any>(TABLES.customers).map((c: any) =>
    c.id === id ? { ...c, phone: newPhone } : c,
  );
  db.writeSync(TABLES.customers, list);
  updateCredentialIdentifier(id, newPhone);
  void persistProfilePatch(id, { phone: newPhone });
  return true;
}

export function loginCustomer(phone: string, password: string): Customer | null {
  try {
    validateOrThrow(customerLoginSchema, { phone, password });
  } catch {
    return null;
  }
  const userId = verifyCredential('phone', phone, password);
  if (!userId) return null;
  const c = getCustomerById(userId);
  if (!c) return null;
  if (c.isActive === false) return null; // soft-deleted/revocado: no puede iniciar sesión
  db.writeValueSync(TABLES.sessionCustomer, c);
  logAudit({ action: 'customer_login', actorId: c.id, actorRole: 'customer', targetUserId: c.id });
  return c;
}

/**
 * Resultado detallado de un intento de login. Permite a la UI distinguir
 * entre credenciales inválidas y cuentas dadas de baja por revocación.
 */
export type CustomerLoginResult =
  | { ok: true; customer: Customer }
  | { ok: false; reason: 'invalid_credentials' | 'account_revoked' | 'account_inactive' };

export function loginCustomerDetailed(phone: string, password: string): CustomerLoginResult {
  try {
    validateOrThrow(customerLoginSchema, { phone, password });
  } catch {
    return { ok: false, reason: 'invalid_credentials' };
  }
  // 1) ¿Existe alguna cuenta dada de baja con este número como teléfono original?
  const revoked = getInactiveAccountsForPhone(phone);
  // 2) Verificar credenciales contra cuentas activas.
  const userId = verifyCredential('phone', phone, password);
  if (!userId) {
    if (revoked.length > 0) {
      // No hay cuenta activa pero sí cuenta(s) revocada(s) con ese número.
      return { ok: false, reason: 'account_revoked' };
    }
    return { ok: false, reason: 'invalid_credentials' };
  }
  const c = getCustomerById(userId);
  if (!c) return { ok: false, reason: 'invalid_credentials' };
  if (c.isActive === false) return { ok: false, reason: 'account_revoked' };
  db.writeValueSync(TABLES.sessionCustomer, c);
  logAudit({ action: 'customer_login', actorId: c.id, actorRole: 'customer', targetUserId: c.id });
  return { ok: true, customer: c };
}

/**
 * @deprecated Phase 2.7 — read auth state from `useAuth()` instead.
 * Kept as a transitional shim so legacy sync consumers (customer pages,
 * `useCustomerSession`) keep working until they are migrated.
 */
/**
 * @deprecated Phase 2.8 — removed. Read identity via `useAuth()` and
 * resolve the Customer object via `useCustomerSession()` or
 * `getCustomerById(user.id)`. Always returns null + warns.
 */
export function getCurrentCustomer(): Customer | null {
  console.warn('[customers] getCurrentCustomer is a no-op (Phase 2.8). Use useAuth() / useCustomerSession().');
  return null;
}

export function logoutCustomer(): void {
  db.removeSync(TABLES.sessionCustomer);
}

export function resetAllCustomerPoints(): void {
  console.warn(
    '[customers] @deprecated resetAllCustomerPoints is a no-op. Use adjust_points RPC per customer.',
  );
}

/** Idempotent: append a campaignId to the accepted-terms list. */
export function acceptCampaignTerms(customerId: string, campaignId: string): void {
  let nextAccepted: string[] | null = null;
  const list = db.readSync<any>(TABLES.customers).map((c: any) => {
    if (c.id !== customerId) return c;
    const accepted = c.acceptedCampaigns || [];
    if (accepted.includes(campaignId)) return c;
    nextAccepted = [...accepted, campaignId];
    return { ...c, acceptedCampaigns: nextAccepted };
  });
  db.writeSync(TABLES.customers, list);
  if (nextAccepted && isUuid(customerId) && isUuid(campaignId)) {
    // Persist via SECURITY DEFINER RPC so the privileged-fields trigger
    // doesn't block the customer's own consent acceptance, AND so the
    // ledger gets a `terms_acceptance` audit row in the same call.
    void supabase
      .rpc('accept_campaign_terms', { p_campaign_id: campaignId })
      .then(({ error }) => {
        if (error) console.error('[customers] accept_campaign_terms RPC failed', error);
      });
  }
}

/** Soft-delete: only admins may call this. Throws if caller lacks privilege. */
export function deactivateCustomer(customerId: string, actor: { id: string; role: 'admin' | 'cashier' }): void {
  if (actor.role !== 'admin') throw new Error('Solo un administrador puede desactivar clientes');
  const deletedAt = new Date().toISOString();
  const list = db.readSync<any>(TABLES.customers).map((c: any) =>
    c.id === customerId
      ? { ...c, isActive: false, deletedAt }
      : c,
  );
  db.writeSync(TABLES.customers, list);
  void persistProfilePatch(customerId, { is_active: false, deleted_at: deletedAt });
  logAudit({
    action: 'customer_deactivated',
    actorId: actor.id,
    actorRole: 'admin',
    targetUserId: customerId,
  });
}

export function reactivateCustomer(customerId: string, actor: { id: string; role: 'admin' | 'cashier' }): void {
  if (actor.role !== 'admin') throw new Error('Solo un administrador puede reactivar clientes');
  const list = db.readSync<any>(TABLES.customers).map((c: any) =>
    c.id === customerId
      ? { ...c, isActive: true, deletedAt: undefined }
      : c,
  );
  db.writeSync(TABLES.customers, list);
  void persistProfilePatch(customerId, { is_active: true, deleted_at: null });
  logAudit({
    action: 'customer_reactivated',
    actorId: actor.id,
    actorRole: 'admin',
    targetUserId: customerId,
  });
}

export function customerNeedsPasswordChange(customer: Customer): boolean {
  // TODO(Supabase Auth): replace with a `must_change_password` flag on the profile.
  return getCredentialPassword(customer.id) === customer.phone;
}

/**
 * Revocación de consentimiento LOPDP iniciada por el cliente.
 *
 * Flujo:
 *  1. Registra una transacción `consent_revocation` por cada campaña con
 *     puntos > 0 (deja traza histórica de los puntos perdidos).
 *  2. Pone los puntos en 0 en todas las campañas.
 *  3. Marca la cuenta como inactiva (soft-delete) y libera el número:
 *     guarda el original en `revokedFromPhone` y reescribe `phone` con un
 *     sufijo único para que el cliente pueda registrarse de nuevo.
 *  4. Inhabilita las credenciales (cambia identifier para que no haga match).
 *  5. Registra el record de consentimiento revocado y un audit_log.
 *  6. Cierra la sesión.
 */
export function revokeCustomerConsent(customerId: string): {
  pointsLostByCampaign: Record<string, number>;
  totalPointsLost: number;
} | null {
  const customer = getCustomerById(customerId);
  if (!customer || customer.isActive === false) return null;

  const pointsByCampaign = getPointsByCustomer(customerId);
  const totalPointsLost = Object.values(pointsByCampaign).reduce((s, n) => s + (n || 0), 0);

  // 1) Phase 3.3: the legacy local audit log is gone. Consent revocation
  // events are recorded via `logAudit()` below; per-campaign zeroing must
  // be performed via the admin `adjust_points` RPC (Phase 3.4) and will
  // appear naturally in `point_transactions` as `manual_adjustment` rows.

  // 2) Puntos a 0 en todas las campañas.
  // Phase 3.2: balances are now driven by the ledger. Zeroing on consent
  // revocation must go through `adjust_points` RPC (admin-only). This loop
  // is intentionally a no-op until the consent flow runs as admin.
  // TODO(Phase 3.3): call adjustPoints({ customerId, campaignId, delta: -current, reason: 'consent_revocation' })
  if (Object.keys(pointsByCampaign).length > 0) {
    console.warn(
      '[customers] consent revoke: ledger zeroing pending (use adjust_points RPC).',
      { customerId, campaigns: Object.keys(pointsByCampaign) },
    );
  }

  // 3) Liberar el teléfono y desactivar.
  const originalPhone = customer.phone;
  const releasedPhone = `revoked:${originalPhone}:${Date.now()}`;
  const list = db.readSync<any>(TABLES.customers).map((c: any) =>
    c.id === customerId
      ? {
          ...c,
          isActive: false,
          deletedAt: new Date().toISOString(),
          revokedFromPhone: originalPhone,
          phone: releasedPhone,
          pointsByCampaign: {},
        }
      : c,
  );
  db.writeSync(TABLES.customers, list);
  void persistProfilePatch(customerId, {
    is_active: false,
    deleted_at: new Date().toISOString(),
    revoked_from_phone: originalPhone,
    phone: releasedPhone,
  });

  // 4) Inhabilitar credenciales.
  updateCredentialIdentifier(customerId, releasedPhone);

  // 5) Record de consentimiento + audit.
  revokeConsentRecord(customerId);
  logAudit({
    action: 'customer_deactivated',
    actorId: customerId,
    actorRole: 'customer',
    targetUserId: customerId,
    metadata: {
      reason: 'consent_revocation',
      originalPhone,
      pointsLost: totalPointsLost,
      campaignsAffected: Object.keys(pointsByCampaign).length,
    },
  });

  // 6) Cerrar sesión local.
  db.removeSync(TABLES.sessionCustomer);

  return { pointsLostByCampaign: pointsByCampaign, totalPointsLost };
}
