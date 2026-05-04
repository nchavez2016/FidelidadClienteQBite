/**
 * Redemption requests domain service.
 *
 * El cliente crea una solicitud (estado `pending`) eligiendo un premio
 * para el cual ya tiene puntos suficientes. Un cajero/admin debe
 * aprobarla (lo que dispara la transacción de canje real) o rechazarla.
 * El propio cliente puede cancelar mientras siga `pending`.
 *
 * Reglas:
 *  - Sólo puede existir UNA solicitud `pending` por (cliente, campaña).
 *  - Aprobar valida nuevamente que los puntos sigan siendo suficientes.
 */
import { RedemptionRequest } from '@/lib/types';
import { db, TABLES } from './dbAdapter';
import { addTransaction } from './transactions.service';

function load(): RedemptionRequest[] {
  return db.readSync<RedemptionRequest>(TABLES.redemptionRequests);
}

function save(list: RedemptionRequest[]): void {
  db.writeSync(TABLES.redemptionRequests, list);
}

export function getRedemptionRequests(): RedemptionRequest[] {
  return load();
}

export function getPendingRequest(
  customerId: string,
  campaignId: string,
): RedemptionRequest | undefined {
  return load().find(
    r =>
      r.customerId === customerId &&
      r.campaignId === campaignId &&
      r.status === 'pending',
  );
}

export function getPendingRequestForCustomer(
  customerId: string,
): RedemptionRequest | undefined {
  return load().find(r => r.customerId === customerId && r.status === 'pending');
}

export interface CreateRequestInput {
  customerId: string;
  campaignId: string;
  rewardId: string;
  rewardName: string;
  requiredPoints: number;
}

export function createRedemptionRequest(input: CreateRequestInput): RedemptionRequest {
  const list = load();
  // Asegura unicidad: si ya hay una pending para esa (cliente, campaña), recházala.
  const existing = list.find(
    r =>
      r.customerId === input.customerId &&
      r.campaignId === input.campaignId &&
      r.status === 'pending',
  );
  if (existing) {
    throw new Error('Ya tienes una solicitud pendiente en esta sucursal');
  }
  const req: RedemptionRequest = {
    id: `req-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    customerId: input.customerId,
    campaignId: input.campaignId,
    rewardId: input.rewardId,
    rewardName: input.rewardName,
    requiredPoints: input.requiredPoints,
    status: 'pending',
    createdAt: new Date().toISOString(),
  };
  save([...list, req]);
  return req;
}

function resolveRequest(
  id: string,
  patch: Partial<RedemptionRequest>,
): RedemptionRequest | undefined {
  const list = load();
  const idx = list.findIndex(r => r.id === id);
  if (idx < 0) return undefined;
  if (list[idx].status !== 'pending') return list[idx];
  const updated: RedemptionRequest = {
    ...list[idx],
    ...patch,
    resolvedAt: new Date().toISOString(),
  };
  list[idx] = updated;
  save(list);
  return updated;
}

export function cancelRedemptionRequestByCustomer(id: string): RedemptionRequest | undefined {
  return resolveRequest(id, { status: 'cancelled', resolvedBy: 'customer' });
}

export function cancelRedemptionRequestByStaff(
  id: string,
  staffId: string,
  staffName: string,
): RedemptionRequest | undefined {
  return resolveRequest(id, {
    status: 'cancelled',
    resolvedBy: 'staff',
    resolvedByStaffId: staffId,
    resolvedByStaffName: staffName,
  });
}

export function approveRedemptionRequest(
  id: string,
  staffId: string,
  staffName: string,
): RedemptionRequest | undefined {
  return resolveRequest(id, {
    status: 'approved',
    resolvedBy: 'staff',
    resolvedByStaffId: staffId,
    resolvedByStaffName: staffName,
  });
}

/**
 * Helpers de trazabilidad: registran movimientos de auditoría (0 pts)
 * para cada solicitud / cancelación. Centralizan el formato del
 * `commentText` para que cliente, cajero y reportes lean el mismo log.
 */
interface AuditCtx {
  customerId: string;
  campaignId: string;
  balanceAfter: number;
  staffId: string;
  staffName: string;
}

export function logRequestCreated(req: RedemptionRequest, ctx: AuditCtx): void {
  addTransaction({
    customerId: ctx.customerId,
    campaignId: ctx.campaignId,
    type: 'redemption_request',
    points: 0,
    balanceAfter: ctx.balanceAfter,
    rewardId: req.rewardId,
    rewardName: req.rewardName,
    staffId: ctx.staffId,
    staffName: ctx.staffName,
    commentCategory: 'observation',
    commentText: `Cliente solicitó canjear "${req.rewardName}" (${req.requiredPoints} pts) · req:${req.id}`,
  });
}

export function logRequestCancelled(
  req: RedemptionRequest,
  ctx: AuditCtx,
  cancelledBy: 'customer' | 'staff',
): void {
  const who = cancelledBy === 'customer' ? 'Cliente canceló' : 'Cajero rechazó';
  addTransaction({
    customerId: ctx.customerId,
    campaignId: ctx.campaignId,
    type: 'redemption_request_cancelled',
    points: 0,
    balanceAfter: ctx.balanceAfter,
    rewardId: req.rewardId,
    rewardName: req.rewardName,
    staffId: ctx.staffId,
    staffName: ctx.staffName,
    commentCategory: 'observation',
    commentText: `${who} la solicitud de "${req.rewardName}" · req:${req.id}`,
  });
}
