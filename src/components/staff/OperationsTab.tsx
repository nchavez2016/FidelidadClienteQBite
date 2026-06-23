import { useEffect, useRef, useState } from 'react';
import { Customer, CommentCategory, Milestone, Campaign, RedemptionRequest, Transaction } from '@/lib/types';
import { getCustomerTransactions, resetCustomerPassword, updateCustomerPhone, getCustomerById, getCustomerPoints, customerNeedsPasswordChange } from '@/services';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import ProgressRoute from '@/components/ProgressRoute';
import CommentInput from '@/components/CommentInput';
import TransactionItem from '@/components/TransactionItem';
import RegisterCustomerDialog from '@/components/staff/RegisterCustomerDialog';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, Plus, Undo2, Gift, Clock, UserPlus, KeyRound, Phone, ShieldCheck, ShieldAlert, MapPin, TimerReset, Hourglass, X, Check, Flame, AlertTriangle, Sparkles } from 'lucide-react';
import { evaluateBonus } from '@/services/bonusRules.service';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';
import ResetPointsDialog from './ResetPointsDialog';
import { getBranchAccent } from '@/lib/utils';

const IDLE_TIMEOUT_MS = 60_000; // 60s para limpiar pantalla
const IDLE_WARNING_MS = 50_000; // aviso visual a los 50s

interface OperationsTabProps {
  phoneSearch: string;
  setPhoneSearch: (v: string) => void;
  searchCustomer: () => void;
  selectedCustomer: Customer | null;
  setSelectedCustomer: (c: Customer | null) => void;
  handleAddPoint: () => void;
  handleAddProPoints?: () => void;
  rewards: Milestone[];
  setShowRedeemDialog: (v: boolean) => void;
  setShowReverseDialog: (v: boolean) => void;
  commentCat: CommentCategory | '';
  commentText: string;
  setCommentCat: (v: CommentCategory | '') => void;
  setCommentText: (v: string) => void;
  campaign: Campaign | undefined;
  currentPoints: number;
  activeCampaigns: Campaign[];
  currentCampaignId: string;
  pendingRequest?: RedemptionRequest;
  historicalRequests?: RedemptionRequest[];
  customerTransactions?: Transaction[];
  onApproveRequest?: () => void;
  onRejectRequest?: () => void;
  onRefresh?: () => void;
}

export default function OperationsTab({
  phoneSearch, setPhoneSearch, searchCustomer, selectedCustomer, setSelectedCustomer,
  handleAddPoint, rewards, setShowRedeemDialog, setShowReverseDialog,
  handleAddProPoints,
  commentCat, commentText, setCommentCat, setCommentText, campaign,
  currentPoints, activeCampaigns, currentCampaignId,
  pendingRequest, historicalRequests, customerTransactions, onApproveRequest, onRejectRequest, onRefresh,
}: OperationsTabProps) {
  console.log('[OPERATIONS_TAB_RENDER]', {
    hasCustomer: !!selectedCustomer,
    hasPendingRequest: !!pendingRequest,
    requestId: pendingRequest?.id,
    requestStatus: pendingRequest?.status
  });
  const [showRegisterDialog, setShowRegisterDialog] = useState(false);
  const bonus = evaluateBonus(campaign);
  const isCampaignPaused = !!campaign && campaign.status !== 'active';
  const [showResetDialog, setShowResetDialog] = useState(false);
  const [showResetPointsDialog, setShowResetPointsDialog] = useState(false);
  const { hasRole } = useAuth();
  const isAdmin = hasRole('admin');
  const [newPassword, setNewPassword] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [idleWarning, setIdleWarning] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const idleTimerRef = useRef<number | null>(null);
  const warningTimerRef = useRef<number | null>(null);
  const [showOperationalTimeline, setShowOperationalTimeline] = useState(false);
  const [showFinancialLedger, setShowFinancialLedger] = useState(false);

  const custTx = customerTransactions || [];

  // Acento de marca según la sucursal de la campaña activa
  const opsAccent = getBranchAccent(campaign?.branch);
  const opsCardStyle: React.CSSProperties = opsAccent
    ? {
        border: `1.5px solid ${opsAccent.borderStrong}`,
        background: opsAccent.bg,
        boxShadow: `0 6px 22px -10px ${opsAccent.borderStrong}55`,
      }
    : {};
  const opsInnerCardStyle: React.CSSProperties = opsAccent
    ? {
        background: opsAccent.bgStrong,
        border: `1px solid ${opsAccent.borderStrong}`,
      }
    : { background: 'rgba(197,160,89,0.06)', border: '1px solid rgba(197,160,89,0.2)' };
  const opsInnerLabelColor = opsAccent?.color ?? '#8B6914';

  // Limpiar cliente y enfocar buscador (memoizable manualmente vía ref-stable callback)
  const clearAndFocus = () => {
    setSelectedCustomer(null);
    setPhoneSearch('');
    setCommentCat('');
    setCommentText('');
    setIdleWarning(false);
    setTimeout(() => searchInputRef.current?.focus(), 50);
  };

  const resetIdleTimer = () => {
    if (idleTimerRef.current) window.clearTimeout(idleTimerRef.current);
    if (warningTimerRef.current) window.clearTimeout(warningTimerRef.current);
    setIdleWarning(false);
    if (!selectedCustomer || document.visibilityState !== 'visible') return;
    warningTimerRef.current = window.setTimeout(() => setIdleWarning(true), IDLE_WARNING_MS);
    idleTimerRef.current = window.setTimeout(() => {
      toast.info('Pantalla limpiada por inactividad. Listo para el siguiente cliente.', { duration: 4000 });
      clearAndFocus();
    }, IDLE_TIMEOUT_MS);
  };

  // Inicia/reinicia el timer cuando hay cliente seleccionado o cambia su id
  useEffect(() => {
    resetIdleTimer();
    return () => {
      if (idleTimerRef.current) window.clearTimeout(idleTimerRef.current);
      if (warningTimerRef.current) window.clearTimeout(warningTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCustomer?.id, currentPoints]);

  // Reinicia el timer ante actividad real del usuario en la pantalla
  useEffect(() => {
    if (!selectedCustomer) return;
    const handler = () => resetIdleTimer();
    const handleVisibility = () => {
      if (document.visibilityState === 'hidden') {
        if (idleTimerRef.current) window.clearTimeout(idleTimerRef.current);
        if (warningTimerRef.current) window.clearTimeout(warningTimerRef.current);
        setIdleWarning(false);
        return;
      }
      resetIdleTimer();
    };
    window.addEventListener('mousemove', handler);
    window.addEventListener('keydown', handler);
    window.addEventListener('touchstart', handler);
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      window.removeEventListener('mousemove', handler);
      window.removeEventListener('keydown', handler);
      window.removeEventListener('touchstart', handler);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCustomer?.id]);

  // Nota: El polling de solicitudes pendientes ahora lo maneja React Query
  // en useCustomerOperations con refetchInterval, eliminando la necesidad
  // de intervals manuales y listeners de storage aquí.

  const handleResetPassword = () => {
    if (!selectedCustomer || !newPassword.trim() || newPassword.length < 4) {
      toast.error('La clave debe tener al menos 4 caracteres');
      return;
    }
    resetCustomerPassword(selectedCustomer.id, newPassword.trim());
    toast.success('Clave restablecida exitosamente 🔑');
    setNewPassword('');
  };

  const handleUpdatePhone = () => {
    if (!selectedCustomer || !newPhone.trim() || newPhone.length < 10) {
      toast.error('Ingresa un número válido (mínimo 10 dígitos)');
      return;
    }
    const ok = updateCustomerPhone(selectedCustomer.id, newPhone.trim());
    if (!ok) {
      toast.error('Este número ya está registrado para otro cliente');
      return;
    }
    toast.success('Número actualizado exitosamente 📱');
    setSelectedCustomer(getCustomerById(selectedCustomer.id) || null);
    setPhoneSearch(newPhone.trim());
    setNewPhone('');
  };

  return (
    <div className="space-y-4 mt-4">
      <Card style={opsCardStyle}>
        <CardContent className="pt-4 space-y-2">
          <div className="flex gap-2">
            <Input
              ref={searchInputRef}
              placeholder="Buscar por teléfono..."
              value={phoneSearch}
              onChange={e => setPhoneSearch(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && searchCustomer()}
              className="flex-1"
              disabled={!!selectedCustomer}
            />
            {selectedCustomer ? (
              <Button onClick={clearAndFocus} variant="outline" className="gap-2 border-secondary/40 text-secondary hover:bg-secondary/5">
                <TimerReset className="w-4 h-4" />Nuevo cliente
              </Button>
            ) : (
              <Button onClick={searchCustomer} className="gap-2 text-white font-semibold" style={{ background: 'linear-gradient(135deg, #C5A059, #D4B06A)', border: '1px solid rgba(197,160,89,0.5)' }}>
                <Search className="w-4 h-4" />Buscar
              </Button>
            )}
          </div>
          <Button
            onClick={() => handleAddProPoints?.()}
            disabled={!selectedCustomer || !handleAddProPoints || isCampaignPaused}
            className="w-full gap-2 text-white font-semibold text-xs sm:text-sm"
            style={{
              background: 'linear-gradient(135deg, #1B3A6B 0%, #C5A059 100%)',
              border: '1px solid rgba(197,160,89,0.5)',
              boxShadow: '0 4px 14px -4px rgba(27,58,107,0.45)',
            }}
            title={selectedCustomer ? 'Premio directo Nivel Pro: otorga 2 puntos al cliente' : 'Selecciona un cliente para premiar'}
          >
            <Sparkles className="w-4 h-4 shrink-0" />
            <span className="hidden sm:inline truncate">Premiar Cliente + 2 pts</span>
            <span className="inline sm:hidden truncate">+2 pts</span>
          </Button>

        </CardContent>
      </Card>

      <RegisterCustomerDialog
        open={showRegisterDialog}
        onOpenChange={setShowRegisterDialog}
        onCreated={(phone) => {
          setPhoneSearch(phone);
          searchCustomer();
        }}
      />

      {selectedCustomer && idleWarning && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center gap-2 px-3 py-2 rounded-lg"
          style={{ background: 'rgba(245,158,11,0.12)', border: '1px solid rgba(245,158,11,0.4)' }}
        >
          <TimerReset className="w-4 h-4" style={{ color: '#d97706' }} />
          <span className="text-xs font-body" style={{ color: '#92590b' }}>
            La pantalla se limpiará en unos segundos por inactividad. Mueve el mouse o presiona una tecla para continuar.
          </span>
        </motion.div>
      )}

      {selectedCustomer && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
          <Card className="shadow-brand" style={opsCardStyle}>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div
                    className="shrink-0 w-12 h-12 rounded-full flex items-center justify-center font-heading font-bold text-base text-white"
                    style={{
                      background: 'linear-gradient(135deg, #001F3F 0%, #2E6DB4 100%)',
                      boxShadow: '0 4px 12px rgba(0,31,63,0.3), inset 0 1px 0 rgba(255,255,255,0.15)',
                    }}
                    aria-label={`Avatar de ${selectedCustomer.name}`}
                  >
                    {(() => {
                      const parts = selectedCustomer.name.trim().split(/\s+/);
                      const initials = (parts[0]?.[0] || '') + (parts[1]?.[0] || parts[0]?.[1] || '');
                      return initials.toUpperCase();
                    })()}
                  </div>
                  <div className="min-w-0">
                    <CardTitle className="text-xl truncate">{selectedCustomer.name}</CardTitle>
                    <p className="text-sm text-muted-foreground truncate">{selectedCustomer.phone}</p>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <span className="text-4xl font-heading font-bold leading-none" style={{ color: '#C5A059' }}>{currentPoints}</span>
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground mt-1">pts acumulados</p>
                </div>
              </div>

              {/* Puntos por sucursal (solo campañas activas) */}
              {(() => {
                const liveCampaigns = activeCampaigns.filter(c => c.status === 'active');
                if (liveCampaigns.length <= 1) return null;
                return (
                <div className="mt-3 rounded-lg p-2.5" style={opsInnerCardStyle}>
                  <p className="text-[10px] uppercase tracking-wider font-semibold mb-1.5 flex items-center gap-1" style={{ color: opsInnerLabelColor }}>
                    <MapPin className="w-3 h-3" /> Puntos por sucursal
                  </p>
                  <div className="grid grid-cols-2 gap-1.5">
                    {liveCampaigns.map(c => {
                      const pts = getCustomerPoints(selectedCustomer, c.id);
                      const isCurrent = c.id === currentCampaignId;
                      const accent = getBranchAccent(c.branch);
                      const bg = accent
                        ? (isCurrent ? accent.bgStrong : accent.bg)
                        : (isCurrent ? 'rgba(197,160,89,0.15)' : '#fff');
                      const border = accent
                        ? `1px solid ${isCurrent ? accent.borderStrong : accent.border}`
                        : (isCurrent ? '1px solid #C5A059' : '1px solid #eee');
                      const textColor = accent?.color ?? '#1B3A6B';
                      return (
                        <div key={c.id} className="flex items-center justify-between text-xs px-2 py-1 rounded" style={{ background: bg, border }}>
                          <span className="truncate flex items-center gap-1.5" style={{ color: textColor }}>
                            {accent && (
                              <span
                                aria-hidden
                                className="inline-block w-1.5 h-1.5 rounded-full"
                                style={{ background: accent.borderStrong }}
                              />
                            )}
                            {c.branch}
                          </span>
                          <strong style={{ color: isCurrent ? (accent?.borderStrong ?? '#C9A84C') : '#666' }}>{pts}</strong>
                        </div>
                      );
                    })}
                  </div>
                </div>
                );
              })()}

              <div className="flex flex-wrap gap-2 mt-2">
                {(() => {
                  const accepted = campaign && selectedCustomer.acceptedCampaigns?.includes(campaign.id);
                  return (
                    <span
                      className="inline-flex items-center gap-1 text-[10px] font-body font-semibold px-2.5 py-1 rounded-full"
                      style={{
                        background: accepted ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.08)',
                        color: accepted ? '#16a34a' : '#dc2626',
                        border: `1px solid ${accepted ? 'rgba(34,197,94,0.2)' : 'rgba(239,68,68,0.15)'}`,
                      }}
                    >
                      {accepted ? <ShieldCheck className="w-3 h-3" /> : <ShieldAlert className="w-3 h-3" />}
                      {accepted ? 'T&C Aceptados' : 'T&C Pendientes'}
                    </span>
                  );
                })()}
                {customerNeedsPasswordChange(selectedCustomer) && (
                  <span
                    className="inline-flex items-center gap-1 text-[10px] font-body font-semibold px-2.5 py-1 rounded-full"
                    style={{
                      background: 'rgba(245,158,11,0.1)',
                      color: '#d97706',
                      border: '1px solid rgba(245,158,11,0.2)',
                    }}
                  >
                    <KeyRound className="w-3 h-3" />
                    Clave insegura
                  </span>
                )}
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <ProgressRoute currentPoints={currentPoints} milestones={campaign?.milestones} />

              {campaign?.termsAndConditions && (
                <details className="group bg-muted/50 border border-border rounded-lg">
                  <summary className="cursor-pointer list-none select-none px-3 py-2 flex items-center justify-between gap-2">
                    <span className="text-xs font-bold text-foreground flex items-center gap-1.5">
                      📋 Términos y Condiciones — {campaign.branch}
                    </span>
                    <span className="text-[10px] uppercase tracking-wider text-muted-foreground group-open:hidden">Ver</span>
                    <span className="text-[10px] uppercase tracking-wider text-muted-foreground hidden group-open:inline">Ocultar</span>
                  </summary>
                  <div className="px-3 pb-3 pt-1 border-t border-border/60">
                    <p className="text-xs text-muted-foreground whitespace-pre-line leading-relaxed max-h-48 overflow-y-auto">
                      {campaign.termsAndConditions}
                    </p>
                  </div>
                </details>
              )}

              <CommentInput category={commentCat} text={commentText} onCategoryChange={setCommentCat} onTextChange={setCommentText} />

              {isCampaignPaused && (
                <div
                  className="rounded-lg p-3 flex items-start gap-2"
                  style={{
                    background: 'rgba(251,191,36,0.08)',
                    border: '1px solid rgba(251,191,36,0.45)',
                  }}
                >
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" style={{ color: '#b45309' }} />
                  <div className="text-xs leading-snug" style={{ color: '#92400e' }}>
                    <strong>Campaña en pausa.</strong> No se pueden acumular ni canjear puntos en
                    <span className="font-semibold"> {campaign?.branch}</span> mientras esté pausada.
                    Cambia de sucursal o reactiva la campaña desde la pestaña Campañas.
                  </div>
                </div>
              )}

              {pendingRequest && (
                <motion.div
                  initial={{ opacity: 0, y: -8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="rounded-lg p-3 flex flex-col gap-2"
                  style={{
                    background: 'linear-gradient(135deg, rgba(46,109,180,0.10) 0%, rgba(197,160,89,0.10) 100%)',
                    border: '1.5px solid #2E6DB4',
                    boxShadow: '0 4px 16px -6px rgba(46,109,180,0.35)',
                  }}
                >
                  <div className="flex items-start gap-2">
                    <Hourglass className="w-5 h-5 shrink-0 mt-0.5" style={{ color: '#2E6DB4' }} />
                    <div className="flex-1 min-w-0">
                      <p className="text-[11px] font-bold uppercase tracking-wider" style={{ color: '#1B3A6B' }}>
                        El cliente solicitó un canje
                      </p>
                      <p className="text-sm font-semibold mt-0.5" style={{ color: '#1B3A6B' }}>
                        🎁 {pendingRequest.rewardName}
                        <span className="ml-2 text-xs font-normal" style={{ color: '#2E6DB4' }}>
                          ({pendingRequest.requiredPoints} pts)
                        </span>
                      </p>
                      <p className="text-[10px] mt-0.5 text-muted-foreground">
                        Confirma para entregar el premio o rechaza si el cliente quiere cambiarlo.
                      </p>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <Button
                      size="sm"
                      onClick={onApproveRequest}
                      className="gap-1.5 text-white"
                      style={{ background: 'linear-gradient(135deg, #16a34a 0%, #15803d 100%)' }}
                    >
                      <Check className="w-4 h-4" />
                      Confirmar canje
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={onRejectRequest}
                      className="gap-1.5 border-destructive/40 text-destructive hover:bg-destructive/5"
                    >
                      <X className="w-4 h-4" />
                      Rechazar
                    </Button>
                  </div>
                </motion.div>
              )}

              <div className="grid grid-cols-3 gap-2">
                <Button
                  onClick={() => {
                    if (isCampaignPaused) {
                      toast.error('La campaña está pausada. No se pueden acumular puntos.');
                      return;
                    }
                    handleAddPoint();
                  }}
                  disabled={isCampaignPaused}
                  className="bg-success hover:bg-success/90 text-success-foreground gap-1 h-auto py-3 flex-col disabled:opacity-40 disabled:cursor-not-allowed"
                  title={isCampaignPaused ? 'Campaña pausada — no disponible' : undefined}
                >
                  <Plus className="w-5 h-5" />
                  <span className="text-[10px] leading-tight text-center">
                    {bonus.multiplier > 1 ? (
                      <span className="inline-flex items-center gap-0.5"><Flame className="w-3 h-3" />+{bonus.multiplier} Pts (x{bonus.multiplier})</span>
                    ) : '+1 Punto'}
                    <br />{campaign?.branch ? `(${campaign.branch})` : ''}
                  </span>
                </Button>
                <Button
                  onClick={() => {
                    if (isCampaignPaused) {
                      toast.error('La campaña está pausada. No se pueden confirmar canjes.');
                      return;
                    }
                    if (pendingRequest && onApproveRequest) { onApproveRequest(); return; }
                    toast.info('El canje sólo se habilita cuando el cliente solicita un premio desde su pantalla.');
                  }}
                  disabled={!pendingRequest || isCampaignPaused}
                  className="bg-accent hover:bg-accent/90 text-accent-foreground gap-1 h-auto py-3 flex-col disabled:opacity-40 disabled:cursor-not-allowed"
                  title={isCampaignPaused ? 'Campaña pausada — no disponible' : (pendingRequest ? 'Confirmar el canje solicitado por el cliente' : 'Esperando que el cliente seleccione un premio en su pantalla')}
                >
                  <Gift className="w-5 h-5" />
                  <span className="text-xs">{pendingRequest ? 'Canjear pedido' : 'Canjear'}</span>
                </Button>
                <Button
                  variant="outline"
                  onClick={() => setShowReverseDialog(true)}
                  className="gap-1 h-auto py-3 flex-col border-destructive/30 text-destructive hover:bg-destructive/5"
                >
                  <Undo2 className="w-5 h-5" />
                  <span className="text-xs">Revertir</span>
                </Button>
              </div>

              <div className="flex gap-2">
                <Button variant="outline" size="sm" className="flex-1 gap-1.5 text-secondary border-secondary/30 hover:bg-secondary/5" onClick={() => { setNewPassword(''); setNewPhone(selectedCustomer.phone); setShowResetDialog(true); }}>
                  <KeyRound className="w-3.5 h-3.5" />
                  <span className="text-xs">Gestionar cuenta</span>
                </Button>
                {isAdmin && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1 gap-1.5 text-destructive border-destructive/30 hover:bg-destructive/5"
                    onClick={() => setShowResetPointsDialog(true)}
                  >
                    <AlertTriangle className="w-3.5 h-3.5" />
                    <span className="text-xs">Resetear puntos</span>
                  </Button>
                )}
              </div>

              <div className="border-t pt-3 space-y-4">
                {/* ── Timeline Operacional (Solicitudes) ─────────── */}
                <div className="space-y-2">
                  <p className="text-sm font-semibold text-foreground flex items-center gap-2">
                    <Hourglass className="w-4 h-4 text-accent" />
                    Timeline de Solicitudes
                  </p>

                  {/* Botón ancho azul */}
                  <button
                    type="button"
                    onClick={() => setShowOperationalTimeline(v => !v)}
                    className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold text-white transition-all active:scale-[0.98]"
                    style={{ background: 'linear-gradient(135deg, #1e4d8c 0%, #2563eb 100%)' }}
                  >
                    <Clock className="w-4 h-4" />
                    {showOperationalTimeline ? 'Ocultar historial' : 'Ver historial'}
                  </button>

                  <AnimatePresence initial={false}>
                    {showOperationalTimeline && (
                      <motion.div
                        key="ops-timeline"
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2, ease: 'easeInOut' }}
                        className="overflow-hidden space-y-2"
                      >
                        {!historicalRequests || historicalRequests.length === 0 ? (
                          <p className="text-[10px] text-muted-foreground text-center py-3 bg-muted/20 rounded-lg border border-dashed border-border/50 italic">
                            Sin solicitudes históricas
                          </p>
                        ) : (() => {
                          const STATUS_CFG: Record<string, { label: string; color: string; Icon: any }> = {
                            pending:   { label: 'SOLICITADO', color: '#2E6DB4', Icon: Hourglass },
                            approved:  { label: 'APROBADO',   color: '#16a34a', Icon: Check },
                            rejected:  { label: 'RECHAZADO',  color: '#dc2626', Icon: X },
                            cancelled: { label: 'CANCELADO',  color: '#6b7280', Icon: Undo2 },
                          };
                          const fmt = (iso: string) =>
                            new Date(iso).toLocaleDateString('es-EC', {
                              day: '2-digit', month: 'short',
                              hour: '2-digit', minute: '2-digit',
                            });

                          // Build a flat list of events sorted newest-first
                          const allEvents: { key: string; rewardName: string; date: string; cfgKey: string }[] = [];
                          historicalRequests.forEach(req => {
                            // Event: created
                            allEvents.push({ key: `${req.id}:created`, rewardName: req.rewardName, date: req.createdAt, cfgKey: 'pending' });
                            // Event: resolution (if resolved)
                            if (req.status !== 'pending' && req.resolvedAt) {
                              allEvents.push({ key: `${req.id}:${req.status}`, rewardName: req.rewardName, date: req.resolvedAt, cfgKey: req.status });
                            }
                          });
                          allEvents.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

                          return allEvents.slice(0, 15).map(ev => {
                            const { label, color, Icon } = STATUS_CFG[ev.cfgKey] ?? STATUS_CFG.pending;
                            return (
                              <div
                                key={ev.key}
                                className="flex items-center justify-between p-2.5 rounded-xl bg-card border border-border/40 shadow-sm hover:border-border/70 transition-colors"
                              >
                                <div className="flex items-center gap-2.5 min-w-0">
                                  <div className="w-7 h-7 rounded-full flex items-center justify-center shrink-0" style={{ background: `${color}15` }}>
                                    <Icon className="w-3.5 h-3.5" style={{ color }} />
                                  </div>
                                  <div className="min-w-0">
                                    <p className="font-bold text-xs text-foreground truncate">{ev.rewardName}</p>
                                    <p className="text-[10px] text-muted-foreground">{fmt(ev.date)}</p>
                                  </div>
                                </div>
                                <span className="shrink-0 font-black text-[8px] tracking-wide px-2 py-0.5 rounded-md" style={{ background: `${color}15`, color }}>
                                  {label}
                                </span>
                              </div>
                            );
                          });
                        })()}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                {/* ── Historial Financiero (Ledger) ─────────────── */}
                <div className="space-y-2">
                  <p className="text-sm font-semibold text-foreground flex items-center gap-2">
                    <Clock className="w-4 h-4 text-secondary" />
                    Historial Financiero
                  </p>

                  {/* Botón ancho azul */}
                  <button
                    type="button"
                    onClick={() => setShowFinancialLedger(v => !v)}
                    className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold text-white transition-all active:scale-[0.98]"
                    style={{ background: 'linear-gradient(135deg, #1e4d8c 0%, #2563eb 100%)' }}
                  >
                    <Clock className="w-4 h-4" />
                    {showFinancialLedger ? 'Ocultar movimientos' : 'Ver movimientos'}
                  </button>

                  <AnimatePresence initial={false}>
                    {showFinancialLedger && (
                      <motion.div
                        key="fin-ledger"
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2, ease: 'easeInOut' }}
                        className="overflow-hidden space-y-1.5"
                      >
                        {custTx.length === 0 ? (
                          <p className="text-[10px] text-muted-foreground text-center py-3 bg-muted/20 rounded-lg border border-dashed border-border/50 italic">
                            Sin movimientos aún
                          </p>
                        ) : (
                          custTx.map(tx => <TransactionItem key={tx.id} tx={tx} compact />)
                        )}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      )}

      <Dialog open={showResetDialog} onOpenChange={setShowResetDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 font-heading">
              <KeyRound className="w-5 h-5 text-secondary" />
              Gestionar cuenta del cliente
            </DialogTitle>
          </DialogHeader>
          {selectedCustomer && (
            <div className="space-y-5">
              <p className="text-sm text-muted-foreground">Cliente: <span className="font-semibold text-foreground">{selectedCustomer.name}</span></p>

              <div className="space-y-2 border border-border rounded-lg p-3">
                <Label className="text-xs font-semibold flex items-center gap-1.5">
                  <KeyRound className="w-3.5 h-3.5 text-accent" />
                  Restablecer clave
                </Label>
                <div className="flex gap-2">
                  <Input
                    type="text"
                    placeholder="Nueva clave (mín. 4 caracteres)"
                    value={newPassword}
                    onChange={e => setNewPassword(e.target.value)}
                    className="flex-1"
                    maxLength={20}
                  />
                  <Button size="sm" onClick={handleResetPassword} className="bg-accent hover:bg-accent/90 text-accent-foreground">
                    Cambiar
                  </Button>
                </div>
              </div>

              <div className="space-y-2 border border-border rounded-lg p-3">
                <Label className="text-xs font-semibold flex items-center gap-1.5">
                  <Phone className="w-3.5 h-3.5 text-secondary" />
                  Actualizar número telefónico
                </Label>
                <div className="flex gap-2">
                  <Input
                    type="tel"
                    placeholder="Nuevo número"
                    value={newPhone}
                    onChange={e => setNewPhone(e.target.value)}
                    className="flex-1"
                    maxLength={15}
                  />
                  <Button size="sm" variant="outline" onClick={handleUpdatePhone} className="border-secondary/30 text-secondary hover:bg-secondary/5">
                    Actualizar
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">Número actual: {selectedCustomer.phone}</p>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <ResetPointsDialog
        open={showResetPointsDialog}
        onOpenChange={setShowResetPointsDialog}
        customer={selectedCustomer}
        defaultCampaignId={currentCampaignId}
        onDone={() => onRefresh?.()}
      />
    </div>
  );
}
