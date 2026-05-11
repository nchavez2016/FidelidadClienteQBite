import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Star, Clock, ShieldAlert, KeyRound } from 'lucide-react';
import { toast } from 'sonner';

import {
  getActiveCampaigns,
  getCustomerTransactions, resetCustomerPassword,
  acceptCampaignTerms, customerNeedsPasswordChange, getCustomerPoints, addTransaction,
  getPendingRequest, createRedemptionRequest, cancelRedemptionRequestByCustomer,
  logRequestCreated, logRequestCancelled,
  getConsentStatus, revokeCustomerConsent, getCustomerTotalPoints,
} from '@/lib/store';
import { useCustomerSession } from '@/hooks/useCustomerSession';

import ProgressRoute from '@/components/ProgressRoute';
import TransactionItem from '@/components/TransactionItem';

import HeroSection from '@/components/customer/HeroSection';
import NextMilestoneBanner from '@/components/customer/NextMilestoneBanner';
import RewardsCard from '@/components/customer/RewardsCard';
import TermsSection from '@/components/customer/TermsSection';
import PasswordChangeModal from '@/components/customer/PasswordChangeModal';
import StatsGrid from '@/components/customer/StatsGrid';
import BonusRuleBadge from '@/components/BonusRuleBadge';


export default function CustomerDashboard() {
  const navigate = useNavigate();
  const { customer, refresh: refreshCustomer, logout } = useCustomerSession('/cliente/login');
  const [, setTick] = useState(0);
  const [showHistory, setShowHistory] = useState(false);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [newPwd, setNewPwd] = useState('');
  const [confirmPwd, setConfirmPwd] = useState('');
  const [heroImgIdx, setHeroImgIdx] = useState(0);

  // Solo mostramos al cliente campañas activas que estén realmente configuradas
  // (con al menos un hito). Una campaña activa sin hitos es indistinguible de
  // "sin promoción" para el cliente y no debe aparecer en el switcher ni en el hero.
  const activeCampaigns = getActiveCampaigns().filter(
    c => Array.isArray(c.milestones) && c.milestones.length > 0,
  );

  // Default: la primera campaña con puntos del cliente, o la primera activa
  const defaultCampaignId = (() => {
    if (activeCampaigns.length === 0) return '';
    if (!customer) return activeCampaigns[0].id;
    const withPoints = activeCampaigns.find(c => getCustomerPoints(customer, c.id) > 0);
    return (withPoints || activeCampaigns[0]).id;
  })();
  const [selectedCampaignId, setSelectedCampaignId] = useState<string>(defaultCampaignId);

  // Si la campaña seleccionada deja de ser válida (p.ej. el admin la finalizó
  // o le quitó los hitos), reasignamos a otra activa o limpiamos la selección.
  useEffect(() => {
    const stillValid = activeCampaigns.some(c => c.id === selectedCampaignId);
    if (!stillValid) {
      setSelectedCampaignId(activeCampaigns[0]?.id ?? '');
    }
  }, [activeCampaigns, selectedCampaignId]);

  const selectedCampaign = activeCampaigns.find(c => c.id === selectedCampaignId);
  const currentPoints = customer && selectedCampaignId ? getCustomerPoints(customer, selectedCampaignId) : 0;
  const transactions = customer && selectedCampaignId
    ? getCustomerTransactions(customer.id, selectedCampaignId).slice(-20).reverse()
    : [];

  const milestones = selectedCampaign?.milestones
    ? [...selectedCampaign.milestones].sort((a, b) => a.requiredPoints - b.requiredPoints)
    : [];

  const maxPoints = milestones.length > 0 ? milestones[milestones.length - 1].requiredPoints : 0;
  const nextMilestone = milestones.find(m => m.requiredPoints > currentPoints);
  const pointsToNext = nextMilestone ? nextMilestone.requiredPoints - currentPoints : 0;
  const allCompleted = currentPoints >= maxPoints && maxPoints > 0;

  const needsPasswordChange = customer ? customerNeedsPasswordChange(customer) : false;
  const hasAcceptedTerms = !!(selectedCampaign && customer?.acceptedCampaigns?.includes(selectedCampaign.id));
  const showProgressFixture =
    typeof window !== 'undefined' &&
    new URLSearchParams(window.location.search).get('fixture') === 'progress';

  useEffect(() => { if (needsPasswordChange) setShowPasswordModal(true); }, [needsPasswordChange]);
  useEffect(() => {
    const interval = setInterval(() => setHeroImgIdx(prev => (prev + 1) % 3), 3500);
    return () => clearInterval(interval);
  }, []);

  // Polling para detectar resoluciones del cajero (aprobado/rechazado).
  useEffect(() => {
    const interval = setInterval(() => setTick(t => t + 1), 2500);
    const onStorage = () => setTick(t => t + 1);
    window.addEventListener('storage', onStorage);
    return () => {
      clearInterval(interval);
      window.removeEventListener('storage', onStorage);
    };
  }, []);

  const pendingRequest = customer && selectedCampaignId
    ? getPendingRequest(customer.id, selectedCampaignId)
    : undefined;

  const handleRequestReward = (m: import('@/lib/types').Milestone) => {
    if (!customer || !selectedCampaignId) return;
    if (currentPoints < m.requiredPoints) {
      toast.error('Aún no tienes suficientes puntos para este premio');
      return;
    }
    try {
      const req = createRedemptionRequest({
        customerId: customer.id,
        campaignId: selectedCampaignId,
        rewardId: m.id,
        rewardName: m.rewardName,
        requiredPoints: m.requiredPoints,
      });
      logRequestCreated(req, {
        customerId: customer.id,
        campaignId: selectedCampaignId,
        balanceAfter: currentPoints,
        staffId: customer.id,
        staffName: customer.name,
      });
      toast.success('Solicitud enviada. Acércate al cajero para confirmar 🎁');
      setTick(t => t + 1);
    } catch (e: any) {
      toast.error(e?.message || 'No se pudo crear la solicitud');
    }
  };

  const handleCancelRequest = (req: import('@/lib/types').RedemptionRequest) => {
    cancelRedemptionRequestByCustomer(req.id);
    if (customer && selectedCampaignId) {
      logRequestCancelled(
        req,
        {
          customerId: customer.id,
          campaignId: selectedCampaignId,
          balanceAfter: currentPoints,
          staffId: customer.id,
          staffName: customer.name,
        },
        'customer',
      );
    }
    toast.success('Solicitud cancelada');
    setTick(t => t + 1);
  };

  const handleLogout = () => { void logout(); };

  const handleRevokeConsent = () => {
    if (!customer) return;
    const totalPts = getCustomerTotalPoints(customer);
    const warning =
      `⚠️ ATENCIÓN — Esta acción es IRREVERSIBLE.\n\n` +
      `Si continúas:\n` +
      `  • Tu cuenta será DADA DE BAJA y dejará de funcionar.\n` +
      `  • Perderás TODOS tus puntos acumulados (${totalPts} pts en total) en todas las sucursales.\n` +
      `  • Perderás los beneficios y premios pendientes.\n` +
      `  • No podrás iniciar sesión nuevamente con esta cuenta.\n` +
      `  • Si te registras de nuevo en el futuro, será como un cliente NUEVO ` +
      `(sin los puntos ni beneficios anteriores).\n\n` +
      `¿Confirmas que deseas revocar tu consentimiento y dar de baja tu cuenta?`;
    if (!window.confirm(warning)) return;
    const result = revokeCustomerConsent(customer.id);
    if (!result) {
      toast.error('No se pudo revocar el consentimiento. Intenta de nuevo.');
      return;
    }
    toast.success(
      `Consentimiento revocado. Tu cuenta fue dada de baja${
        result.totalPointsLost > 0 ? ` y se anularon ${result.totalPointsLost} pt(s)` : ''
      }.`,
    );
    setTimeout(() => { void logout(); }, 1200);
  };

  const consentStatus = customer ? getConsentStatus(customer.id) : { hasActiveConsent: false };

  if (!customer) return null;

  const handleChangePassword = () => {
    if (newPwd.length < 4) { toast.error('La contraseña debe tener al menos 4 caracteres'); return; }
    if (newPwd === customer.phone) { toast.error('La contraseña no puede ser igual a tu número de teléfono'); return; }
    if (newPwd !== confirmPwd) { toast.error('Las contraseñas no coinciden'); return; }
    resetCustomerPassword(customer.id, newPwd);
    toast.success('¡Contraseña actualizada exitosamente! 🔐');
    setShowPasswordModal(false);
    setNewPwd('');
    setConfirmPwd('');
    setTick(t => t + 1);
    refreshCustomer();
  };

  const handleAcceptTerms = (checked: boolean) => {
    if (checked && selectedCampaign && !hasAcceptedTerms) {
      acceptCampaignTerms(customer.id, selectedCampaign.id);
      addTransaction({
        customerId: customer.id,
        campaignId: selectedCampaign.id,
        type: 'terms_acceptance',
        points: 0,
        balanceAfter: currentPoints,
        staffId: customer.id,
        staffName: customer.name,
        commentCategory: 'observation',
        commentText: `Aceptación de términos y condiciones de la campaña ${selectedCampaign.name}`,
      });
      toast.success('¡Gracias por aceptar los términos! ✅');
      setTick(t => t + 1);
      refreshCustomer();
    }
  };

  const cardShadow = '0 4px 20px -6px rgba(27,58,107,0.10)';

  // Estado vacío: no hay ninguna sucursal con campaña configurada.
  if (activeCampaigns.length === 0) {
    return (
      <div className="min-h-screen flex flex-col" style={{ background: '#f0f4f8' }}>
        <HeroSection
          customer={customer}
          campaign={undefined}
          points={0}
          heroImgIdx={heroImgIdx}
          onLogout={handleLogout}
          activeCampaigns={[]}
        />
        <div className="max-w-[560px] mx-auto px-5 mt-8 text-center">
          <div
            className="bg-white p-6"
            style={{ borderRadius: 16, border: '1px solid #e8edf3', boxShadow: cardShadow }}
          >
            <div className="text-4xl mb-2">🌊</div>
            <h2 className="font-heading font-bold text-base mb-1" style={{ color: '#1B3A6B' }}>
              No hay promociones activas
            </h2>
            <p className="font-body text-xs leading-relaxed" style={{ color: '#6b7a8c' }}>
              Por ahora ninguna sucursal tiene una campaña de premios configurada.
              Vuelve pronto para descubrir nuevas rutas de recompensas.
            </p>
          </div>
        </div>
        <PasswordChangeModal
          open={showPasswordModal}
          onOpenChange={setShowPasswordModal}
          needsPasswordChange={needsPasswordChange}
          newPwd={newPwd}
          confirmPwd={confirmPwd}
          onNewPwdChange={setNewPwd}
          onConfirmPwdChange={setConfirmPwd}
          onSubmit={handleChangePassword}
        />
      </div>
    );
  }

  return (
    <div className="min-h-screen" style={{ background: '#f0f4f8' }}>
      <HeroSection
        customer={customer}
        campaign={selectedCampaign}
        points={currentPoints}
        heroImgIdx={heroImgIdx}
        onLogout={handleLogout}
        nextMilestone={nextMilestone}
        pointsToNext={pointsToNext}
        activeCampaigns={activeCampaigns}
        selectedCampaignId={selectedCampaignId}
        onSelectCampaign={setSelectedCampaignId}
      />

      <NextMilestoneBanner allCompleted={allCompleted} nextMilestone={nextMilestone} pointsToNext={pointsToNext} />

      <div className="max-w-[720px] mx-auto flex flex-col px-3 pb-5 sm:px-4 sm:pb-6" style={{ marginTop: 12, gap: 10 }}>
        {needsPasswordChange && (
          <motion.div
            className="flex items-center gap-3 cursor-pointer"
            style={{ background: 'linear-gradient(135deg, #fef3cd 0%, #fff8e1 100%)', borderRadius: 12, border: '1px solid #f0d060', padding: '12px 16px' }}
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            onClick={() => setShowPasswordModal(true)}
          >
            <ShieldAlert className="w-5 h-5 shrink-0" style={{ color: '#b8860b' }} />
            <div className="flex-1">
              <p className="font-body font-semibold text-xs" style={{ color: '#8B6914' }}>⚠️ Tu contraseña es igual a tu número de teléfono</p>
              <p className="font-body text-[10px] mt-0.5" style={{ color: '#a07d1c' }}>Por seguridad, te recomendamos cambiarla. Toca aquí para actualizarla.</p>
            </div>
            <KeyRound className="w-4 h-4 shrink-0" style={{ color: '#b8860b' }} />
          </motion.div>
        )}

        <AnimatePresence mode="wait">
          <motion.div
            key={selectedCampaignId || 'none'}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.35, ease: 'easeOut' }}
            className="flex flex-col"
            style={{ gap: 10 }}
          >
            {/* Ruta de Premios */}
            <motion.div className="bg-white relative" style={{ borderRadius: 16, border: '1px solid #e8edf3', padding: 16, boxShadow: cardShadow }} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
              {selectedCampaign && (
                <span
                  className="absolute top-3 right-3 inline-flex items-center gap-1 text-[9px] font-body font-bold uppercase tracking-wider px-2 py-0.5 rounded-full"
                  style={{ background: 'rgba(34,197,94,0.12)', color: '#16a34a', border: '1px solid rgba(34,197,94,0.3)' }}
                >
                  <span className="w-1.5 h-1.5 rounded-full" style={{ background: '#16a34a' }} />
                  Activa
                </span>
              )}
              <div className="flex items-center gap-2 mb-1">
                <Star className="w-4 h-4 sm:w-5 sm:h-5" style={{ color: '#C9A84C' }} />
                <h2 className="font-heading font-bold text-sm sm:text-base" style={{ color: '#1B3A6B' }}>Tu Ruta de Premios</h2>
              </div>
              <p className="text-[10px] mb-3" style={{ color: '#8a96a6' }}>
                {currentPoints} / {maxPoints} puntos · {selectedCampaign?.branch || 'Sin sucursal'}
              </p>
              <div className="w-full" style={{ padding: '0 16px', boxSizing: 'border-box' }}>
                <ProgressRoute currentPoints={currentPoints} milestones={milestones} />
              </div>
              {showProgressFixture && (
                <div className="mt-3 grid gap-3 border-t pt-3">
                  {[0, 1, 2, 3].map(points => (
                    <div key={points} className="rounded-lg border border-dashed border-secondary/30 bg-secondary/5 p-2">
                      <p className="mb-1 text-[10px] font-bold text-secondary">Fixture: {points} pts</p>
                      <ProgressRoute currentPoints={points} milestones={milestones} animate={false} />
                    </div>
                  ))}
                </div>
              )}
            </motion.div>

            <StatsGrid currentPoints={currentPoints} pointsToNext={pointsToNext} maxPoints={maxPoints} nextMilestone={nextMilestone} />
            {selectedCampaign && <BonusRuleBadge campaign={selectedCampaign} variant="card" />}
            <RewardsCard
              milestones={milestones}
              currentPoints={currentPoints}
              nextMilestoneId={nextMilestone?.id}
              pendingRequest={pendingRequest}
              onRequest={handleRequestReward}
              onCancelRequest={handleCancelRequest}
            />

            {selectedCampaign && (
              <TermsSection campaign={selectedCampaign} hasAcceptedTerms={hasAcceptedTerms} onAcceptTerms={handleAcceptTerms} cardShadow={cardShadow} />
            )}
          </motion.div>
        </AnimatePresence>

        <motion.div className="grid gap-2" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}>
          <button
            onClick={() => setShowHistory(!showHistory)}
            className="flex items-center justify-center gap-2 font-body font-semibold text-white cursor-pointer w-full"
            style={{ background: 'linear-gradient(135deg, #1B3A6B 0%, #2E6DB4 100%)', borderRadius: 14, padding: '12px', fontSize: 11, border: 'none', boxShadow: '0 4px 12px -4px rgba(27,58,107,0.3)' }}
          >
            <Clock className="w-4 h-4" />
            {showHistory ? 'Ocultar' : 'Ver historial'}
          </button>
        </motion.div>

        {showHistory && (
          <motion.div className="bg-white" style={{ borderRadius: 16, border: '1px solid #e8edf3', padding: 16, boxShadow: cardShadow }} initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }}>
            <div className="flex items-center gap-2 mb-3">
              <Clock className="w-5 h-5 text-secondary" />
              <h2 className="font-heading font-bold text-sm sm:text-base" style={{ color: '#1B3A6B' }}>
                Actividad — {selectedCampaign?.branch || 'Sucursal'}
              </h2>
            </div>
            {transactions.length === 0
              ? <p className="text-sm text-muted-foreground text-center py-4 font-body">Aún no tienes movimientos en esta sucursal</p>
              : transactions.map(tx => <TransactionItem key={tx.id} tx={tx} />)
            }
          </motion.div>
        )}
      </div>

      <PasswordChangeModal
        open={showPasswordModal}
        onOpenChange={setShowPasswordModal}
        needsPasswordChange={needsPasswordChange}
        newPwd={newPwd}
        confirmPwd={confirmPwd}
        onNewPwdChange={setNewPwd}
        onConfirmPwdChange={setConfirmPwd}
        onSubmit={handleChangePassword}
      />

      {consentStatus.hasActiveConsent && (
        <div className="max-w-[720px] mx-auto px-3 sm:px-4 pb-6">
          <button
            onClick={handleRevokeConsent}
            className="w-full text-[11px] font-body text-muted-foreground underline hover:text-destructive py-2"
          >
            Revocar consentimiento de uso de mi número (LOPDP)
          </button>
        </div>
      )}
    </div>
  );
}
