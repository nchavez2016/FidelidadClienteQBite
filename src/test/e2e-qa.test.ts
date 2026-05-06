/**
 * QA punta-a-punta — emula el flujo completo del programa de fidelidad
 * sobre los servicios reales (localStorage en jsdom).
 *
 * Cubre: registro, consentimiento LOPDP, login, dashboard de cliente,
 * configuración de campaña + reglas de bonus por horario, acumulación
 * con/sin cooldown, canje, reportes, baja por revocación y re-registro.
 */
// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

function freshLocalStorage() {
  const store: Record<string, string> = {};
  const ls = {
    getItem: (k: string) => (k in store ? store[k] : null),
    setItem: (k: string, v: string) => { store[k] = String(v); },
    removeItem: (k: string) => { delete store[k]; },
    clear: () => { for (const k of Object.keys(store)) delete store[k]; },
    key: (i: number) => Object.keys(store)[i] ?? null,
    get length() { return Object.keys(store).length; },
  };
  Object.defineProperty(globalThis, 'localStorage', { value: ls, configurable: true });
}

describe('QA E2E — programa de fidelidad', () => {
  beforeEach(async () => {
    freshLocalStorage();
    vi.resetModules();
    vi.useRealTimers();
  });

  afterEach(() => { vi.useRealTimers(); });

  it('flujo completo: registro → login → puntos → canje → reporte → baja → re-registro', async () => {
    const svc = await import('@/services');
    const {
      registerCustomer, loginCustomer, loginCustomerDetailed, getCurrentCustomer,
      getCustomerByPhone, getInactiveAccountsForPhone, getCustomerPoints,
      acceptCampaignTerms, revokeCustomerConsent, getCustomers,
      getActiveCampaigns, getCampaignById, saveCampaign, setCampaignStatus,
      addTransaction, getCustomerTransactions, getTransactions, canAddPoint,
      loginStaff, getCurrentStaff,
      getKpiSummary, getPeakHours, getGenderBreakdown, getFunnel,
      getConsentStatus, getAuditLogs,
      EXPRESS_ID,
    } = svc as any;

    // ---------- 1) Registro requiere consentimiento LOPDP ----------
    const blocked = registerCustomer('0997000111', 'Test User', 'pass1234', 'masculino', { consentAccepted: false });
    expect(blocked).toBeNull();

    const created = registerCustomer('0997000111', 'Test User', 'pass1234', 'masculino', { consentAccepted: true });
    expect(created).not.toBeNull();
    expect(created.isActive).toBe(true);

    const consent = getConsentStatus(created.id);
    expect(consent.hasActiveConsent).toBe(true);

    // ---------- 2) Login cliente ----------
    const loginOk = loginCustomer('0997000111', 'pass1234');
    expect(loginOk?.id).toBe(created.id);
    expect(getCurrentCustomer()?.id).toBe(created.id);

    // ---------- 3) Login staff (cajero Express) ----------
    const cashier = loginStaff('cajero', 'cajero123');
    expect(cashier).not.toBeNull();
    expect(cashier.role).toBe('cashier');
    expect(getCurrentStaff()?.id).toBe(cashier.id);

    // ---------- 4) Configuración de campaña + reglas de bonus por hora ----------
    const camp = getCampaignById(EXPRESS_ID);
    expect(camp).toBeDefined();
    expect(camp.bonusRules.length).toBeGreaterThan(0);

    // Modificar campaña: agregar regla custom 24/7 x2.
    const updated = {
      ...camp,
      bonusRules: [
        ...camp.bonusRules,
        { id: 'bonus-247', label: '24/7 doble', multiplier: 2, days: [0,1,2,3,4,5,6], startTime: '00:00', endTime: '23:59', active: true },
      ],
    };
    saveCampaign(updated);
    const reread = getCampaignById(EXPRESS_ID);
    expect(reread.bonusRules.find((r: any) => r.id === 'bonus-247')).toBeDefined();

    // Pausar y reactivar campaña.
    setCampaignStatus(EXPRESS_ID, 'paused');
    expect(getCampaignById(EXPRESS_ID).status).toBe('paused');
    setCampaignStatus(EXPRESS_ID, 'active');
    expect(getActiveCampaigns().some((c: any) => c.id === EXPRESS_ID)).toBe(true);

    // ---------- 5) Cliente acepta T&C y acumula puntos ----------
    acceptCampaignTerms(created.id, EXPRESS_ID);
    const cust1 = getCustomerByPhone('0997000111');
    expect(cust1.acceptedCampaigns).toContain(EXPRESS_ID);

    // Primera acumulación.
    expect(canAddPoint(created.id, EXPRESS_ID)).toBe(true);
    addTransaction({
      customerId: created.id, campaignId: EXPRESS_ID, type: 'accumulation',
      points: 1, balanceAfter: 1, staffId: cashier.id, staffName: cashier.name,
      commentCategory: 'positive', commentText: 'QA acumulación 1',
    });
    // Sincronizar la caché de puntos:
    svc.setCustomerPoints(created.id, EXPRESS_ID, 1);
    expect(getCustomerPoints(getCustomerByPhone('0997000111'), EXPRESS_ID)).toBe(1);

    // Cooldown bloquea de inmediato.
    expect(canAddPoint(created.id, EXPRESS_ID)).toBe(false);

    // Forzar paso del cooldown manipulando la fecha de la última tx.
    const txs = getTransactions();
    const last = txs[txs.length - 1];
    last.createdAt = new Date(Date.now() - 2 * 60_000).toISOString();
    svc.db.writeSync(svc.TABLES.transactions, txs);
    expect(canAddPoint(created.id, EXPRESS_ID)).toBe(true);

    // Acumular hasta llegar a 3 (primer hito Express = bebida cortesía).
    addTransaction({
      customerId: created.id, campaignId: EXPRESS_ID, type: 'accumulation',
      points: 1, balanceAfter: 2, staffId: cashier.id, staffName: cashier.name,
    });
    svc.setCustomerPoints(created.id, EXPRESS_ID, 2);
    addTransaction({
      customerId: created.id, campaignId: EXPRESS_ID, type: 'accumulation',
      points: 1, balanceAfter: 3, staffId: cashier.id, staffName: cashier.name,
    });
    svc.setCustomerPoints(created.id, EXPRESS_ID, 3);

    expect(getCustomerPoints(getCustomerByPhone('0997000111'), EXPRESS_ID)).toBe(3);

    // ---------- 6) Canje del primer hito (3 pts → bebida cortesía) ----------
    const milestone = reread.milestones.find((m: any) => m.requiredPoints === 3);
    expect(milestone).toBeDefined();
    addTransaction({
      customerId: created.id, campaignId: EXPRESS_ID, type: 'redemption',
      points: -3, balanceAfter: 0, rewardId: milestone.id, rewardName: milestone.rewardName,
      staffId: cashier.id, staffName: cashier.name,
    });
    svc.setCustomerPoints(created.id, EXPRESS_ID, 0);
    expect(getCustomerPoints(getCustomerByPhone('0997000111'), EXPRESS_ID)).toBe(0);

    // ---------- 7) Dashboard / reporte ----------
    const kpi = getKpiSummary({ branchCampaignId: EXPRESS_ID });
    expect(kpi.totalVisits).toBeGreaterThanOrEqual(3); // 3 acumulaciones de QA + seed
    expect(kpi.totalRedeemed).toBeGreaterThanOrEqual(1);

    const peaks = getPeakHours({ branchCampaignId: EXPRESS_ID });
    expect(peaks.length).toBeGreaterThan(0);

    const gender = getGenderBreakdown({ branchCampaignId: EXPRESS_ID });
    expect(gender.find((g: any) => g.gender === 'masculino').count).toBeGreaterThanOrEqual(1);

    const funnel = getFunnel(EXPRESS_ID);
    expect(funnel.length).toBeGreaterThan(0);

    // Historial cliente debe contener acumulación + canje.
    const history = getCustomerTransactions(created.id, EXPRESS_ID);
    expect(history.some((t: any) => t.type === 'redemption')).toBe(true);

    // ---------- 8) Revocación LOPDP (baja) ----------
    // Devolver puntos para verificar que se generan tx de consent_revocation.
    svc.setCustomerPoints(created.id, EXPRESS_ID, 5);
    const revoked = revokeCustomerConsent(created.id);
    expect(revoked).not.toBeNull();
    expect(revoked.totalPointsLost).toBe(5);

    // La cuenta queda inactiva, sesión cerrada, número liberado.
    expect(getCurrentCustomer()).toBeNull();
    expect(getCustomerByPhone('0997000111')).toBeUndefined();
    const dead = getInactiveAccountsForPhone('0997000111');
    expect(dead.length).toBe(1);
    expect(dead[0].isActive).toBe(false);

    // Audit log y consent revocation visibles.
    const audits = getAuditLogs();
    expect(audits.some((a: any) => a.action === 'customer_deactivated' && a.metadata?.reason === 'consent_revocation')).toBe(true);
    expect(getConsentStatus(created.id).hasActiveConsent).toBe(false);

    // Tx de consent_revocation registrada.
    const allTx = getTransactions();
    expect(allTx.some((t: any) => t.type === 'consent_revocation' && t.customerId === created.id)).toBe(true);

    // ---------- 9) Login luego de revocación → mensaje claro ----------
    const detailed = loginCustomerDetailed('0997000111', 'pass1234');
    expect(detailed.ok).toBe(false);
    expect(detailed.reason).toBe('account_revoked');

    // ---------- 10) Re-registro como cuenta NUEVA (mismo número) ----------
    const reborn = registerCustomer('0997000111', 'Test User Reborn', 'newpass1', 'masculino', { consentAccepted: true });
    expect(reborn).not.toBeNull();
    expect(reborn.id).not.toBe(created.id);
    expect(getCustomerPoints(reborn, EXPRESS_ID)).toBe(0);

    // El staff que busca este número debería ver 1 cuenta activa nueva + 1 baja previa.
    const phoneScan = {
      active: getCustomerByPhone('0997000111'),
      revokedHistory: getInactiveAccountsForPhone('0997000111'),
    };
    expect(phoneScan.active?.id).toBe(reborn.id);
    expect(phoneScan.revokedHistory.length).toBe(1);
  });
});
