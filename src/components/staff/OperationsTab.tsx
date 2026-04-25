import { useEffect, useRef, useState } from 'react';
import { Customer, CommentCategory, Milestone, Campaign, RedemptionRequest } from '@/lib/types';
import { getCustomerTransactions, resetCustomerPassword, updateCustomerPhone, getCustomerById, getCustomerPoints } from '@/lib/store';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import ProgressRoute from '@/components/ProgressRoute';
import CommentInput from '@/components/CommentInput';
import TransactionItem from '@/components/TransactionItem';
import RegisterCustomerDialog from '@/components/staff/RegisterCustomerDialog';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { motion } from 'framer-motion';
import { Search, Plus, Undo2, Gift, Clock, UserPlus, KeyRound, Phone, ShieldCheck, ShieldAlert, MapPin, TimerReset, Hourglass, X, Check } from 'lucide-react';
import { toast } from 'sonner';

const IDLE_TIMEOUT_MS = 60_000; // 60s para limpiar pantalla
const IDLE_WARNING_MS = 50_000; // aviso visual a los 50s

interface OperationsTabProps {
  phoneSearch: string;
  setPhoneSearch: (v: string) => void;
  searchCustomer: () => void;
  selectedCustomer: Customer | null;
  setSelectedCustomer: (c: Customer | null) => void;
  handleAddPoint: () => void;
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
  onApproveRequest?: () => void;
  onRejectRequest?: () => void;
  onRefresh?: () => void;
}

export default function OperationsTab({
  phoneSearch, setPhoneSearch, searchCustomer, selectedCustomer, setSelectedCustomer,
  handleAddPoint, rewards, setShowRedeemDialog, setShowReverseDialog,
  commentCat, commentText, setCommentCat, setCommentText, campaign,
  currentPoints, activeCampaigns, currentCampaignId,
  pendingRequest, onApproveRequest, onRejectRequest, onRefresh,
}: OperationsTabProps) {
  const [showRegisterDialog, setShowRegisterDialog] = useState(false);
  const [showResetDialog, setShowResetDialog] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [idleWarning, setIdleWarning] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const idleTimerRef = useRef<number | null>(null);
  const warningTimerRef = useRef<number | null>(null);

  const custTx = selectedCustomer
    ? getCustomerTransactions(selectedCustomer.id, currentCampaignId).slice(-5).reverse()
    : [];

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
    if (!selectedCustomer) return;
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
    window.addEventListener('mousemove', handler);
    window.addEventListener('keydown', handler);
    window.addEventListener('touchstart', handler);
    return () => {
      window.removeEventListener('mousemove', handler);
      window.removeEventListener('keydown', handler);
      window.removeEventListener('touchstart', handler);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCustomer?.id]);

  // Poll para detectar nuevas solicitudes de canje creadas por el cliente
  // (otra pestaña / dispositivo). Storage events sólo viajan entre pestañas,
  // así que combinamos ambos.
  useEffect(() => {
    if (!onRefresh) return;
    const interval = setInterval(onRefresh, 2500);
    const onStorage = () => onRefresh();
    window.addEventListener('storage', onStorage);
    return () => {
      clearInterval(interval);
      window.removeEventListener('storage', onStorage);
    };
  }, [onRefresh]);

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
      <Card>
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
          <Button variant="outline" onClick={() => setShowRegisterDialog(true)} className="w-full gap-2 border-secondary/30 text-secondary hover:bg-secondary/5">
            <UserPlus className="w-4 h-4" />
            Registrar nuevo cliente
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
          <Card className="shadow-brand">
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

              {/* Puntos por sucursal */}
              {activeCampaigns.length > 1 && (
                <div className="mt-3 rounded-lg p-2.5" style={{ background: 'rgba(197,160,89,0.06)', border: '1px solid rgba(197,160,89,0.2)' }}>
                  <p className="text-[10px] uppercase tracking-wider font-semibold mb-1.5 flex items-center gap-1" style={{ color: '#8B6914' }}>
                    <MapPin className="w-3 h-3" /> Puntos por sucursal
                  </p>
                  <div className="grid grid-cols-2 gap-1.5">
                    {activeCampaigns.map(c => {
                      const pts = getCustomerPoints(selectedCustomer, c.id);
                      const isCurrent = c.id === currentCampaignId;
                      return (
                        <div key={c.id} className="flex items-center justify-between text-xs px-2 py-1 rounded" style={{
                          background: isCurrent ? 'rgba(197,160,89,0.15)' : '#fff',
                          border: isCurrent ? '1px solid #C5A059' : '1px solid #eee',
                        }}>
                          <span className="truncate" style={{ color: '#1B3A6B' }}>{c.branch}</span>
                          <strong style={{ color: isCurrent ? '#C9A84C' : '#666' }}>{pts}</strong>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

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
                {selectedCustomer.password === selectedCustomer.phone && (
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
                <div className="bg-muted/50 border border-border rounded-lg p-3">
                  <p className="text-xs font-bold text-foreground flex items-center gap-1.5 mb-1">📋 Términos y Condiciones — {campaign.branch}</p>
                  <p className="text-xs text-muted-foreground whitespace-pre-line leading-relaxed">{campaign.termsAndConditions}</p>
                </div>
              )}

              <CommentInput category={commentCat} text={commentText} onCategoryChange={setCommentCat} onTextChange={setCommentText} />

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
                <Button onClick={handleAddPoint} className="bg-success hover:bg-success/90 text-success-foreground gap-1 h-auto py-3 flex-col">
                  <Plus className="w-5 h-5" />
                  <span className="text-[10px] leading-tight text-center">+1 Punto<br/>{campaign?.branch ? `(${campaign.branch})` : ''}</span>
                </Button>
                <Button
                  onClick={() => {
                    if (pendingRequest && onApproveRequest) { onApproveRequest(); return; }
                    if (rewards.length > 0) setShowRedeemDialog(true);
                    else toast.error('No hay premios disponibles');
                  }}
                  className="bg-accent hover:bg-accent/90 text-accent-foreground gap-1 h-auto py-3 flex-col"
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
              </div>

              <div className="border-t pt-3">
                <p className="text-sm font-semibold text-foreground mb-2 flex items-center gap-1.5">
                  <Clock className="w-4 h-4 text-secondary" />
                  Últimos movimientos — {campaign?.branch || 'Sucursal'}
                </p>
                {custTx.length === 0
                  ? <p className="text-xs text-muted-foreground text-center py-2">Sin movimientos aún</p>
                  : custTx.map(tx => <TransactionItem key={tx.id} tx={tx} compact />)
                }
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
    </div>
  );
}
