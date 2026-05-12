import { useState, useCallback } from 'react';
import {
  getCustomerById,
  getCustomerPoints, getAvailableRewards,
  getLastCustomerTransaction,
  getCustomerTransactions,
  getPendingRequest, approveRedemptionRequest, cancelRedemptionRequestByStaff,
  logRequestCancelled, REVERSAL_WINDOW_MS,
  evaluateBonus, getCampaignById,
  getInactiveAccountsForPhone,
} from '@/lib/store';
import { searchCustomerByPhoneRemote } from '@/services/customers.service';
import { getBranchForCampaign } from '@/services/branches.service';
import {
  earnPoints as ledgerEarn,
  redeemReward as ledgerRedeem,
  reverseTransaction as ledgerReverse,
} from '@/services/pointsLedger.service';
import { Customer, CommentCategory, Milestone, StaffUser, RedemptionRequest } from '@/lib/types';
import { toast } from 'sonner';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isUuid = (v: string) => UUID_RE.test(v);

export function useCustomerOperations(staff: StaffUser, currentCampaignId: string) {
  const [phoneSearch, setPhoneSearch] = useState('');
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [showFloating, setShowFloating] = useState(false);
  const [floatingAmount, setFloatingAmount] = useState(1);
  const [floatingMultiplier, setFloatingMultiplier] = useState(1);
  const [showRedeemDialog, setShowRedeemDialog] = useState(false);
  const [showReverseDialog, setShowReverseDialog] = useState(false);
  const [selectedReward, setSelectedReward] = useState<Milestone | null>(null);
  const [commentCat, setCommentCat] = useState<CommentCategory | ''>('');
  const [commentText, setCommentText] = useState('');
  const [tick, setTick] = useState(0);

  const refresh = useCallback(() => setTick(t => t + 1), []);

  const refreshCustomer = useCallback(() => {
    if (selectedCustomer) {
      setSelectedCustomer(getCustomerById(selectedCustomer.id) || null);
      refresh();
    }
  }, [selectedCustomer, refresh]);

  const searchCustomer = useCallback(async () => {
    const c = await searchCustomerByPhoneRemote(phoneSearch);
    const inactive = getInactiveAccountsForPhone(phoneSearch);
    if (c) {
      setSelectedCustomer(c);
      if (inactive.length > 0) {
        // Cuenta activa + historial de bajas previas con el mismo número.
        toast.warning(
          `Cliente encontrado: ${c.name}. Aviso: este número tuvo ${inactive.length} cuenta(s) ` +
          `previa(s) dada(s) de baja por revocación. Esta es una cuenta NUEVA, sin puntos heredados.`,
          { duration: 7000 },
        );
      } else {
        toast.success(`Cliente encontrado: ${c.name}`);
      }
      return;
    }
    if (inactive.length > 0) {
      const last = inactive[inactive.length - 1];
      toast.error(
        `No hay cuenta activa con este número. Existió la cuenta de "${last.name}" ` +
        `que fue dada de baja por revocación de consentimiento. Si el cliente desea ` +
        `participar, debe registrarse nuevamente como cliente nuevo (sin puntos previos).`,
        { duration: 9000 },
      );
      return;
    }
    toast.error('Cliente no encontrado');
  }, [phoneSearch]);

  const handleAddPoint = useCallback(async () => {
    if (!selectedCustomer) return;
    if (!currentCampaignId) { toast.error('Selecciona una sucursal'); return; }
    if (!isUuid(selectedCustomer.id) || !isUuid(currentCampaignId)) {
      toast.error('Cliente o campaña legacy: no se puede acumular en el ledger.');
      return;
    }
    // Phase 3.4 — cooldown is now enforced server-side in earn_points RPC.
    const campaign = getCampaignById(currentCampaignId);
    const bonus = evaluateBonus(campaign);
    const branchId = getBranchForCampaign(currentCampaignId)?.id ?? null;
    const baseComment = bonus.rule
      ? `Compra acreditada en horario promocional “${bonus.rule.label || 'Bonus activo'}” (${bonus.rule.startTime}–${bonus.rule.endTime}) · Bonus x${bonus.multiplier} · rule:${bonus.rule.id}`
      : `Compra registrada`;
    const finalCommentText = [commentText, baseComment].filter(Boolean).join(' · ');
    try {
      const tx = await ledgerEarn({
        customerId: selectedCustomer.id,
        campaignId: currentCampaignId,
        branchId,
        idempotencyKey: crypto.randomUUID(),
        commentCategory: commentCat || (bonus.rule ? 'promotion' : undefined),
        commentText: finalCommentText,
        bonusRuleId: bonus.rule?.id,
        bonusMultiplier: bonus.multiplier > 1 ? bonus.multiplier : undefined,
      });
      const earned = tx.points_delta;
      setFloatingAmount(earned);
      setFloatingMultiplier(bonus.multiplier);
      setShowFloating(true);
      setCommentCat('');
      setCommentText('');
      toast.success(
        bonus.multiplier > 1
          ? `🔥 Bonus x${bonus.multiplier} · sumamos ${earned} puntos`
          : 'Listo, sumamos 1 punto 🎉',
      );
      setSelectedCustomer(getCustomerById(selectedCustomer.id) || null);
      refresh();
    } catch (err) {
      console.error('[useCustomerOperations] earn failed', err);
      const msg = (err as { message?: string })?.message ?? '';
      if (msg.includes('cooldown_active')) {
        toast.error('Debes esperar al menos 1 minuto entre puntos (anti-abuso)');
      } else {
        toast.error('No se pudo acumular el punto. Intenta de nuevo.');
      }
    }
  }, [selectedCustomer, staff, commentCat, commentText, refresh, currentCampaignId]);

  const handleRedeem = useCallback(async () => {
    if (!selectedCustomer || !selectedReward) return;
    if (!currentCampaignId) { toast.error('Selecciona una sucursal'); return; }
    // Structured trace before any RPC call.
    // eslint-disable-next-line no-console
    console.info('[REDEEM_SELECTED_REWARD]', {
      customerId: selectedCustomer.id,
      campaignId: currentCampaignId,
      reward: selectedReward,
    });
    if (!isUuid(selectedCustomer.id) || !isUuid(currentCampaignId)) {
      toast.error('Cliente o campaña legacy: no se puede canjear en el ledger.');
      return;
    }
    if (!isUuid(selectedReward.id)) {
      // Legacy/local milestone id (e.g. "m-1778..."). The campaign needs to be
      // re-saved by an admin so its milestones get real UUIDs.
      // eslint-disable-next-line no-console
      console.error('[REDEEM_UUID_INVALID]', { rewardId: selectedReward.id, campaignId: currentCampaignId });
      toast.error('Premio no válido: pide a un administrador volver a guardar la campaña.');
      return;
    }
    // eslint-disable-next-line no-console
    console.info('[REDEEM_UUID_VALID]', { rewardId: selectedReward.id, campaignId: currentCampaignId });
    const current = getCustomerPoints(selectedCustomer, currentCampaignId);
    if (current < selectedReward.requiredPoints) {
      toast.error('El cliente no tiene puntos suficientes');
      return;
    }
    const branchId = getBranchForCampaign(currentCampaignId)?.id ?? null;
    // Detecta si el canje viene de una solicitud del cliente para enriquecer la traza.
    const pending = getPendingRequest(selectedCustomer.id, currentCampaignId);
    const fromRequest = pending && pending.rewardId === selectedReward.id ? pending : null;
    const traceComment = fromRequest
      ? `Canje aprobado desde solicitud del cliente · req:${fromRequest.id}${commentText ? ` · ${commentText}` : ''}`
      : commentText || undefined;
    try {
      const tx = await ledgerRedeem({
        customerId: selectedCustomer.id,
        campaignId: currentCampaignId,
        rewardId: selectedReward.id,
        rewardName: selectedReward.rewardName,
        requiredPoints: selectedReward.requiredPoints,
        branchId,
        idempotencyKey: crypto.randomUUID(),
      });
      if (fromRequest) {
        approveRedemptionRequest(fromRequest.id, staff.id, staff.name);
      }
      setShowRedeemDialog(false);
      setSelectedReward(null);
      setCommentCat('');
      setCommentText('');
      toast.success('Premio entregado 🎉');
      setSelectedCustomer(getCustomerById(selectedCustomer.id) || null);
      refresh();
    } catch (err) {
      console.error('[useCustomerOperations] redeem failed', err);
      toast.error('No se pudo registrar el canje.');
    }
  }, [selectedCustomer, selectedReward, staff, commentCat, commentText, refresh, currentCampaignId]);

  const handleReverse = useCallback(async () => {
    if (!selectedCustomer) return;
    if (!currentCampaignId) { toast.error('Selecciona una sucursal'); return; }
    if (commentCat === 'other' && !commentText.trim()) {
      toast.error('El comentario es requerido para "Otro"');
      return;
    }
    const lastTx = getLastCustomerTransaction(selectedCustomer.id, currentCampaignId);
    if (!lastTx || lastTx.isReversed) {
      toast.error('No hay movimiento para revertir en esta sucursal');
      return;
    }
    if (lastTx.type === 'reversal') {
      toast.error('No se puede revertir una reversión');
      return;
    }
    if (Date.now() - new Date(lastTx.createdAt).getTime() > REVERSAL_WINDOW_MS) {
      toast.error('Solo puedes revertir dentro de los 5 minutos');
      return;
    }
    // Phase 3.3: lastTx.id is now ALWAYS the real ledger tx_id (cache is
    // sourced from `point_transactions`). No legacy id mapping needed.
    if (!isUuid(selectedCustomer.id) || !isUuid(currentCampaignId) || !isUuid(lastTx.id)) {
      toast.error('Esta operación requiere ledger Supabase. Pendiente de migración.');
      return;
    }
    try {
      await ledgerReverse(lastTx.id, commentText || undefined, crypto.randomUUID());
      setShowReverseDialog(false);
      setCommentCat('');
      setCommentText('');
      toast.success('Movimiento revertido');
      setSelectedCustomer(getCustomerById(selectedCustomer.id) || null);
      refresh();
    } catch (err) {
      console.error('[useCustomerOperations] reverse failed', err);
      toast.error('No se pudo revertir el movimiento.');
    }
  }, [selectedCustomer, staff, commentCat, commentText, refresh, currentCampaignId]);

  const currentPoints = selectedCustomer ? getCustomerPoints(selectedCustomer, currentCampaignId) : 0;
  const rewards = selectedCustomer ? getAvailableRewards(currentPoints, currentCampaignId) : [];
  const customerTransactions = selectedCustomer
    ? getCustomerTransactions(selectedCustomer.id, currentCampaignId).slice(-5).reverse()
    : [];
  const pendingRequest: RedemptionRequest | undefined =
    selectedCustomer && currentCampaignId
      ? getPendingRequest(selectedCustomer.id, currentCampaignId)
      : undefined;

  const approvePendingRequest = useCallback(() => {
    if (!selectedCustomer || !currentCampaignId) return;
    const pending = getPendingRequest(selectedCustomer.id, currentCampaignId);
    if (!pending) { toast.error('No hay solicitud pendiente'); return; }
    // Construye Milestone-like a partir de la solicitud para reusar el flujo
    const milestone: Milestone = {
      id: pending.rewardId,
      requiredPoints: pending.requiredPoints,
      rewardName: pending.rewardName,
      order: 0,
    };
    setSelectedReward(milestone);
    setShowRedeemDialog(true);
  }, [selectedCustomer, currentCampaignId]);

  const rejectPendingRequest = useCallback(() => {
    if (!selectedCustomer || !currentCampaignId) return;
    const pending = getPendingRequest(selectedCustomer.id, currentCampaignId);
    if (!pending) return;
    cancelRedemptionRequestByStaff(pending.id, staff.id, staff.name);
    const balance = getCustomerPoints(selectedCustomer, currentCampaignId);
    logRequestCancelled(
      pending,
      {
        customerId: selectedCustomer.id,
        campaignId: currentCampaignId,
        balanceAfter: balance,
        staffId: staff.id,
        staffName: staff.name,
      },
      'staff',
    );
    toast.success('Solicitud del cliente rechazada');
    refresh();
  }, [selectedCustomer, currentCampaignId, staff, refresh]);

  return {
    phoneSearch, setPhoneSearch,
    selectedCustomer, setSelectedCustomer,
    showFloating, setShowFloating,
    floatingAmount, floatingMultiplier,
    showRedeemDialog, setShowRedeemDialog,
    showReverseDialog, setShowReverseDialog,
    selectedReward, setSelectedReward,
    commentCat, setCommentCat,
    commentText, setCommentText,
    searchCustomer, handleAddPoint, handleRedeem, handleReverse,
    refreshCustomer, refresh, tick,
    rewards, customerTransactions, currentPoints,
    pendingRequest, approvePendingRequest, rejectPendingRequest,
  };
}
