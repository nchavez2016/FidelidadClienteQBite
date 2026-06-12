import { useState, useCallback } from 'react';
import {
  getCustomerById,
  getCustomerPoints, getAvailableRewards,
  getLastCustomerTransaction,
  getCustomerTransactions,
  REVERSAL_WINDOW_MS,
  evaluateBonus, getCampaignById,
  getInactiveAccountsForPhone,
} from '@/services';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { 
  getPendingRequest, 
  getHistoricalRequests,
  approveRedemptionRequest, 
  rejectRedemptionRequest 
} from '@/services/redemptionRequests.service';
import { searchCustomerByPhoneRemote } from '@/services/customers.service';
import { getBranchForCampaign } from '@/services/branches.service';
import {
  earnPoints as ledgerEarn,
  redeemReward as ledgerRedeem,
  reverseTransaction as ledgerReverse,
  listCustomerLedger,
} from '@/services/pointsLedger.service';
import { Customer, CommentCategory, Milestone, StaffUser, RedemptionRequest, Transaction } from '@/lib/types';
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
  const queryClient = useQueryClient();
  const refresh = useCallback(() => setTick(t => t + 1), []);

  const { data: pendingRequest, refetch: refetchPending } = useQuery({
    queryKey: ['pendingRequest', selectedCustomer?.id, currentCampaignId],
    queryFn: () => getPendingRequest(selectedCustomer!.id, currentCampaignId),
    enabled: !!selectedCustomer && !!currentCampaignId,
    refetchInterval: 3000, 
  });

  const { data: historicalRequests, refetch: refetchHistorical } = useQuery({
    queryKey: ['historicalRequests', selectedCustomer?.id, currentCampaignId],
    queryFn: () => getHistoricalRequests(selectedCustomer!.id, currentCampaignId),
    enabled: !!selectedCustomer && !!currentCampaignId,
    refetchInterval: 3000,
  });

  const { data: ledgerTx, refetch: refetchLedger } = useQuery({
    queryKey: ['ledgerTransactions', selectedCustomer?.id, currentCampaignId],
    queryFn: async () => {
      const rows = await listCustomerLedger(selectedCustomer!.id, { campaignId: currentCampaignId, limit: 10 });
      return rows.map(r => ({
        id: r.id,
        customerId: r.customer_id,
        campaignId: r.campaign_id,
        type: (r.kind === 'earn' || r.kind === 'bonus') ? 'accumulation' :
              (r.kind === 'redeem') ? 'redemption' :
              (r.kind === 'reversal') ? 'reversal' :
              (r.kind === 'terms_acceptance') ? 'terms_acceptance' :
              (r.kind === 'manual_adjustment') ? (r.points_delta >= 0 ? 'accumulation' : 'redemption') :
              'accumulation',
        ledgerKind: r.kind,
        points: r.points_delta,
        balanceAfter: r.balance_after || 0,
        rewardId: r.reward_id || undefined,
        rewardName: r.metadata?.reward_name as string || undefined,
        staffId: r.actor_id || '',
        staffName: r.actor_role === 'admin' ? 'Administrador' : 'Cajero',
        actorRole: (r.actor_role as Transaction['actorRole']) ?? null,
        commentCategory: r.comment_category as any || undefined,
        commentText: r.comment_text || undefined,
        reversedTransactionId: r.reverses_tx_id || undefined,
        bonusMultiplier: r.bonus_multiplier ?? undefined,
        createdAt: r.created_at,
      } as Transaction));
    },
    enabled: !!selectedCustomer && !!currentCampaignId,
    refetchInterval: 5000,
  });

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
      // Temporary log to confirm the rendered customer object shape matches expectations
      console.log('[CASHIER_SEARCH_MERGED]', {
        id: c.id,
        customer_id: c.id,
        phone: c.phone,
        display_name: c.name,
        points: c.pointsByCampaign
      });
      
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
    const branchId = staff.role === 'admin'
      ? (campaign?.branchId || staff.branchId || null)
      : (staff.branchId || campaign?.branchId || null);
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

  // Premio directo "Nivel Pro": otorga 2 puntos en una sola operación,
  // siempre disponible cuando hay cliente seleccionado. Registra trazabilidad
  // completa en el ledger (kind=bonus, multiplier=2) con un comentario que
  // identifica el incentivo manual del staff.
  const handleAddProPoints = useCallback(async () => {
    if (!selectedCustomer) return;
    if (!currentCampaignId) { toast.error('Selecciona una sucursal'); return; }
    if (!isUuid(selectedCustomer.id) || !isUuid(currentCampaignId)) {
      toast.error('Cliente o campaña legacy: no se puede premiar en el ledger.');
      return;
    }
    const campaign = getCampaignById(currentCampaignId);
    const branchId = staff.role === 'admin'
      ? (campaign?.branchId || staff.branchId || null)
      : (staff.branchId || campaign?.branchId || null);
    const baseComment = `Premio directo Nivel Pro · 2 puntos otorgados por ${staff.role === 'admin' ? 'admin' : 'cajero'}`;
    const finalCommentText = [commentText, baseComment].filter(Boolean).join(' · ');
    try {
      const tx = await ledgerEarn({
        customerId: selectedCustomer.id,
        campaignId: currentCampaignId,
        branchId,
        idempotencyKey: crypto.randomUUID(),
        commentCategory: commentCat || 'promotion',
        commentText: finalCommentText,
        bonusMultiplier: 2,
      });
      const earned = tx.points_delta;
      setFloatingAmount(earned);
      setFloatingMultiplier(2);
      setShowFloating(true);
      setCommentCat('');
      setCommentText('');
      toast.success(`⭐ Nivel Pro · sumamos ${earned} puntos directos`);
      setSelectedCustomer(getCustomerById(selectedCustomer.id) || null);
      refresh();
    } catch (err) {
      console.error('[useCustomerOperations] pro-earn failed', err);
      const msg = (err as { message?: string })?.message ?? '';
      if (msg.includes('cooldown_active')) {
        toast.error('Espera 1 minuto entre acumulaciones (anti-abuso)');
      } else {
        toast.error('No se pudo otorgar el premio directo. Intenta de nuevo.');
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
    const currentCampaign = getCampaignById(currentCampaignId);
    const branchId = staff.role === 'admin'
      ? (currentCampaign?.branchId || staff.branchId || null)
      : (staff.branchId || currentCampaign?.branchId || null);
    // Usa la solicitud pendiente ya cargada en el hook
    const fromRequest = pendingRequest && pendingRequest.rewardId === selectedReward.id ? pendingRequest : null;
    const traceComment = fromRequest
      ? `Canje aprobado desde solicitud del cliente · req:${fromRequest.id}${commentText ? ` · ${commentText}` : ''}`
      : commentText || undefined;
    try {
      if (fromRequest) {
        console.info('[APPROVE_START] Using RPC approve_redemption_request', { reqId: fromRequest.id, branchId });
        await approveRedemptionRequest(
          fromRequest.id, 
          staff.id, 
          commentText, 
          branchId || undefined,
          commentCat || undefined
        );
        console.info('[APPROVE_SUCCESS] invalidating queries');
        await queryClient.invalidateQueries({ queryKey: ['pendingRequest', selectedCustomer.id] });
        await queryClient.invalidateQueries({ queryKey: ['historicalRequests', selectedCustomer.id] });
        await queryClient.invalidateQueries({ queryKey: ['ledgerTransactions', selectedCustomer.id] });
        await Promise.all([
          refetchPending(),
          refetchHistorical(),
          refetchLedger()
        ]);
      } else {
        console.info('[REDEEM_START] Using direct ledgerRedeem', { rewardId: selectedReward.id, branchId });
        await ledgerRedeem({
          customerId: selectedCustomer.id,
          campaignId: currentCampaignId,
          rewardId: selectedReward.id,
          rewardName: selectedReward.rewardName,
          requiredPoints: selectedReward.requiredPoints,
          branchId,
          idempotencyKey: crypto.randomUUID(),
          commentCategory: commentCat || undefined,
          commentText: commentText || undefined,
        });
        console.info('[REDEEM_SUCCESS] ledgerRedeem finished');
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
  }, [selectedCustomer, selectedReward, staff, commentCat, commentText, refresh, currentCampaignId, pendingRequest]);

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
  const customerTransactions = ledgerTx || [];

  const approvePendingRequest = useCallback(() => {
    if (!selectedCustomer || !currentCampaignId) return;
    if (!pendingRequest) { toast.error('No hay solicitud pendiente'); return; }
    // Construye Milestone-like a partir de la solicitud para reusar el flujo
    const milestone: Milestone = {
      id: pendingRequest.rewardId,
      requiredPoints: pendingRequest.requiredPoints,
      rewardName: pendingRequest.rewardName,
      order: 0,
    };
    setSelectedReward(milestone);
    setShowRedeemDialog(true);
  }, [selectedCustomer, currentCampaignId, pendingRequest]);

  const rejectPendingRequest = useCallback(async () => {
    if (!selectedCustomer || !currentCampaignId) return;
    if (!pendingRequest) return;
    try {
      console.info('[REJECT_START] Calling rejectRedemptionRequest', { reqId: pendingRequest.id });
      const result = await rejectRedemptionRequest(pendingRequest.id, staff.id, 'Rechazado por el staff');
      console.info('[REJECT_SUCCESS] Result:', result);
      console.info('[REJECT_INVALIDATE] invalidating queries', { customerId: selectedCustomer.id });
      await queryClient.invalidateQueries({ queryKey: ['pendingRequest', selectedCustomer.id] });
      await queryClient.invalidateQueries({ queryKey: ['historicalRequests', selectedCustomer.id] });
      
      await Promise.all([
        refetchPending(),
        refetchHistorical()
      ]);
      toast.success('Solicitud del cliente rechazada');
      refresh();
    } catch (err) {
      console.error('[useCustomerOperations] reject pending failed', err);
      toast.error('No se pudo rechazar la solicitud');
    }
  }, [selectedCustomer, currentCampaignId, pendingRequest, staff, queryClient, refresh]);

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
    handleAddProPoints,
    refresh: async () => {
      refresh();
      await refetchPending();
      await refetchHistorical();
      await refetchLedger();
    }, 
    tick,
    rewards, customerTransactions, currentPoints,
    pendingRequest, historicalRequests, approvePendingRequest, rejectPendingRequest,
  };
}
