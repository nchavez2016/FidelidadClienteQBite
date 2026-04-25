import { useState, useCallback } from 'react';
import {
  getCustomerByPhone, getCustomerById, addTransaction,
  setCustomerPoints, getCustomerPoints, canAddPoint, getAvailableRewards,
  getLastCustomerTransaction, markTransactionReversed,
  getCustomerTransactions,
  getPendingRequest, approveRedemptionRequest, cancelRedemptionRequestByStaff,
} from '@/lib/store';
import { Customer, CommentCategory, Milestone, StaffUser, RedemptionRequest } from '@/lib/types';
import { toast } from 'sonner';

export function useCustomerOperations(staff: StaffUser, currentCampaignId: string) {
  const [phoneSearch, setPhoneSearch] = useState('');
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [showFloating, setShowFloating] = useState(false);
  const [showRedeemDialog, setShowRedeemDialog] = useState(false);
  const [showReverseDialog, setShowReverseDialog] = useState(false);
  const [selectedReward, setSelectedReward] = useState<Milestone | null>(null);
  const [commentCat, setCommentCat] = useState<CommentCategory | ''>('');
  const [commentText, setCommentText] = useState('');
  const [tick, setTick] = useState(0);

  const refresh = useCallback(() => setTick(t => t + 1), []);

  // Polling para detectar nuevas solicitudes del cliente.
  // Usamos un interval ligero porque storage events no se disparan en la misma pestaña.
  // El consumidor (panel staff) ya re-renderiza con cada `tick`.
  // Se mantiene aquí para reusar en cualquier consumer.
  // (Se intencionalmente NO incluye en deps para evitar resets).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  // ↓ pollers

  const refreshCustomer = useCallback(() => {
    if (selectedCustomer) {
      setSelectedCustomer(getCustomerById(selectedCustomer.id) || null);
      refresh();
    }
  }, [selectedCustomer, refresh]);

  const searchCustomer = useCallback(() => {
    const c = getCustomerByPhone(phoneSearch);
    if (c) { setSelectedCustomer(c); toast.success(`Cliente encontrado: ${c.name}`); }
    else toast.error('Cliente no encontrado');
  }, [phoneSearch]);

  const handleAddPoint = useCallback(() => {
    if (!selectedCustomer) return;
    if (!currentCampaignId) { toast.error('Selecciona una sucursal'); return; }
    if (!canAddPoint(selectedCustomer.id, currentCampaignId)) {
      toast.error('Debes esperar al menos 1 minuto entre puntos (anti-abuso)');
      return;
    }
    const current = getCustomerPoints(selectedCustomer, currentCampaignId);
    const newPoints = current + 1;
    setCustomerPoints(selectedCustomer.id, currentCampaignId, newPoints);
    addTransaction({
      customerId: selectedCustomer.id,
      campaignId: currentCampaignId,
      type: 'accumulation',
      points: 1,
      balanceAfter: newPoints,
      staffId: staff.id,
      staffName: staff.name,
      commentCategory: commentCat || undefined,
      commentText: commentText || undefined,
    });
    setShowFloating(true);
    setCommentCat('');
    setCommentText('');
    toast.success('Listo, sumamos 1 punto 🎉');
    setSelectedCustomer(getCustomerById(selectedCustomer.id) || null);
    refresh();
  }, [selectedCustomer, staff, commentCat, commentText, refresh, currentCampaignId]);

  const handleRedeem = useCallback(() => {
    if (!selectedCustomer || !selectedReward) return;
    if (!currentCampaignId) { toast.error('Selecciona una sucursal'); return; }
    const current = getCustomerPoints(selectedCustomer, currentCampaignId);
    if (current < selectedReward.requiredPoints) {
      toast.error('El cliente no tiene puntos suficientes');
      return;
    }
    const remaining = current - selectedReward.requiredPoints;
    setCustomerPoints(selectedCustomer.id, currentCampaignId, remaining);
    addTransaction({
      customerId: selectedCustomer.id,
      campaignId: currentCampaignId,
      type: 'redemption',
      points: -selectedReward.requiredPoints,
      balanceAfter: remaining,
      rewardId: selectedReward.id,
      rewardName: selectedReward.rewardName,
      staffId: staff.id,
      staffName: staff.name,
      commentCategory: commentCat || undefined,
      commentText: commentText || undefined,
    });
    // Si el canje provino de una solicitud pendiente, marcarla como aprobada.
    const pending = getPendingRequest(selectedCustomer.id, currentCampaignId);
    if (pending && pending.rewardId === selectedReward.id) {
      approveRedemptionRequest(pending.id, staff.id, staff.name);
    }
    setShowRedeemDialog(false);
    setSelectedReward(null);
    setCommentCat('');
    setCommentText('');
    toast.success('Premio entregado 🎉');
    setSelectedCustomer(getCustomerById(selectedCustomer.id) || null);
    refresh();
  }, [selectedCustomer, selectedReward, staff, commentCat, commentText, refresh, currentCampaignId]);

  const handleReverse = useCallback(() => {
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
    if (Date.now() - new Date(lastTx.createdAt).getTime() > 300000) {
      toast.error('Solo puedes revertir dentro de los 5 minutos');
      return;
    }
    const reversePoints = -lastTx.points;
    const current = getCustomerPoints(selectedCustomer, currentCampaignId);
    const newPoints = current + reversePoints;
    setCustomerPoints(selectedCustomer.id, currentCampaignId, Math.max(0, newPoints));
    markTransactionReversed(lastTx.id);
    addTransaction({
      customerId: selectedCustomer.id,
      campaignId: currentCampaignId,
      type: 'reversal',
      points: reversePoints,
      balanceAfter: Math.max(0, newPoints),
      reversedTransactionId: lastTx.id,
      staffId: staff.id,
      staffName: staff.name,
      commentCategory: commentCat || undefined,
      commentText: commentText || undefined,
    });
    setShowReverseDialog(false);
    setCommentCat('');
    setCommentText('');
    toast.success('Movimiento revertido');
    setSelectedCustomer(getCustomerById(selectedCustomer.id) || null);
    refresh();
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
    toast.success('Solicitud del cliente rechazada');
    refresh();
  }, [selectedCustomer, currentCampaignId, staff, refresh]);

  return {
    phoneSearch, setPhoneSearch,
    selectedCustomer, setSelectedCustomer,
    showFloating, setShowFloating,
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
