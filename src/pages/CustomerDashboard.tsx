import { useCallback, useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Clock, Instagram, KeyRound, MessageCircle, Music2, ShieldAlert, Star, type LucideIcon } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import type { Milestone, RedemptionRequest, Transaction } from "@/lib/types";
import {
  getActiveCampaigns,
  resetCustomerPassword,
  acceptCampaignTerms,
  customerNeedsPasswordChange,
  getCustomerPoints,
  getCustomerTotalPoints,
  getConsentStatus,
  revokeCustomerConsent,
} from "@/services";
import { hydrateCampaigns, isCampaignsHydrated } from "@/services/campaigns.service";
import { listCustomerLedger } from "@/services/pointsLedger.service";
import {
  cancelRedemptionRequestByCustomer,
  createRedemptionRequest,
  getHistoricalRequests,
  getPendingRequest,
} from "@/services/redemptionRequests.service";
import { useCustomerSession } from "@/hooks/useCustomerSession";

import ProgressRoute from "@/components/ProgressRoute";
import TransactionItem from "@/components/TransactionItem";
import HeroSection from "@/components/customer/HeroSection";
import NextMilestoneBanner from "@/components/customer/NextMilestoneBanner";
import RewardsCard from "@/components/customer/RewardsCard";
import TermsSection from "@/components/customer/TermsSection";
import PasswordChangeModal from "@/components/customer/PasswordChangeModal";
import StatsGrid from "@/components/customer/StatsGrid";
import BonusRuleBadge from "@/components/BonusRuleBadge";

type SocialLink = {
  name: string;
  href: string;
  handle: string;
  icon: LucideIcon;
};

const socialLinks: SocialLink[] = [
  {
    name: "Instagram",
    href: "https://instagram.com/cevicheriagaviotaazul",
    handle: "@cevicheriagaviotaazul",
    icon: Instagram,
  },
  {
    name: "TikTok",
    href: "https://tiktok.com/@cevicheriagaviotaazul",
    handle: "@cevicheriagaviotaazul",
    icon: Music2,
  },
  {
    name: "WhatsApp",
    href: "https://wa.me/593990000000",
    handle: "Escríbenos",
    icon: MessageCircle,
  },
];

function SocialFooter() {
  return (
    <footer className="w-full py-6 px-4">
      <div className="max-w-md mx-auto flex items-center justify-center gap-6">
        {socialLinks.map((link) => {
          const Icon = link.icon;
          return (
            <a
              key={link.name}
              href={link.href}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`${link.name} ${link.handle}`}
              className="flex flex-col items-center gap-1 text-xs opacity-80 hover:opacity-100 transition-opacity"
            >
              <Icon className="w-5 h-5" />
              <span>{link.name}</span>
            </a>
          );
        })}
      </div>
    </footer>
  );
}

const mapLedgerToTransaction = (row: Awaited<ReturnType<typeof listCustomerLedger>>[number]): Transaction => ({
  id: row.id,
  customerId: row.customer_id,
  campaignId: row.campaign_id,
  type:
    row.kind === "redeem"
      ? "redemption"
      : row.kind === "reversal"
        ? "reversal"
        : "accumulation",
  ledgerKind: row.kind,
  points: row.points_delta,
  balanceAfter: row.balance_after ?? 0,
  rewardId: row.reward_id ?? undefined,
  rewardName: (row.metadata?.reward_name as string | undefined) ?? undefined,
  staffId: row.actor_id ?? "",
  staffName: row.actor_role === "admin" ? "Administrador" : row.actor_role === "customer" ? "Cliente" : "Cajero",
  actorRole: (row.actor_role as Transaction["actorRole"]) ?? null,
  commentCategory: (row.comment_category as Transaction["commentCategory"]) ?? undefined,
  commentText: row.comment_text ?? undefined,
  reversedTransactionId: row.reverses_tx_id ?? undefined,
  createdAt: row.created_at,
});

const mapRequestToTransaction = (request: RedemptionRequest): Transaction => ({
  id: `request-${request.id}`,
  customerId: request.customerId,
  campaignId: request.campaignId,
  type:
    request.status === "approved"
      ? "redemption_request_approved"
      : request.status === "rejected"
        ? "redemption_request_rejected"
        : request.status === "cancelled"
          ? "redemption_request_cancelled"
          : "redemption_request",
  points: 0,
  balanceAfter: 0,
  rewardId: request.rewardId,
  rewardName: request.rewardName,
  staffId: request.resolvedByStaffId ?? "",
  staffName: request.resolvedByStaffName ?? (request.resolvedByStaffId ? "Staff" : "Cliente"),
  actorRole: request.status === "pending" || request.resolvedBy === "customer" ? "customer" : "cashier",
  createdAt: request.resolvedAt ?? request.createdAt,
});

export default function CustomerDashboard() {
  const { customer, refresh: refreshCustomer, logout } = useCustomerSession("/cliente/login");
  const [, setTick] = useState(0);
  const [showHistory, setShowHistory] = useState(false);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [newPwd, setNewPwd] = useState("");
  const [confirmPwd, setConfirmPwd] = useState("");
  const [heroImgIdx, setHeroImgIdx] = useState(0);
  const [campaignsReady, setCampaignsReady] = useState<boolean>(isCampaignsHydrated());

  useEffect(() => {
    if (campaignsReady) return;
    let alive = true;
    void hydrateCampaigns().then(() => {
      if (alive) setCampaignsReady(true);
    });
    return () => {
      alive = false;
    };
  }, [campaignsReady]);

  // Solo mostramos al cliente campañas activas que estén realmente configuradas
  // (con al menos un hito). Una campaña activa sin hitos es indistinguible de
  // "sin promoción" para el cliente y no debe aparecer en el switcher ni en el hero.
  const activeCampaigns = getActiveCampaigns().filter((c) => Array.isArray(c.milestones) && c.milestones.length > 0);

  // Default: la primera campaña con puntos del cliente, o la primera activa
  const defaultCampaignId = (() => {
    if (activeCampaigns.length === 0) return "";
    if (!customer) return activeCampaigns[0].id;
    const withPoints = activeCampaigns.find((c) => getCustomerPoints(customer, c.id) > 0);
    return (withPoints || activeCampaigns[0]).id;
  })();
  const [selectedCampaignId, setSelectedCampaignId] = useState<string>(defaultCampaignId);

  // Si la campaña seleccionada deja de ser válida (p.ej. el admin la finalizó
  // o le quitó los hitos), reasignamos a otra activa o limpiamos la selección.
  useEffect(() => {
    const stillValid = activeCampaigns.some((c) => c.id === selectedCampaignId);
    if (!stillValid) {
      setSelectedCampaignId(activeCampaigns[0]?.id ?? "");
    }
  }, [activeCampaigns, selectedCampaignId]);

  const selectedCampaign = activeCampaigns.find((c) => c.id === selectedCampaignId);
  const currentPoints = customer && selectedCampaignId ? getCustomerPoints(customer, selectedCampaignId) : 0;
  const queryClient = useQueryClient();
  const activityEnabled = !!customer?.id && !!selectedCampaignId;

  const { data: pendingRequest = null } = useQuery({
    queryKey: ["pendingRequest", customer?.id, selectedCampaignId],
    queryFn: () => getPendingRequest(customer!.id, selectedCampaignId),
    enabled: activityEnabled,
    refetchInterval: 3000,
  });

  const { data: historicalRequests = [] } = useQuery({
    queryKey: ["historicalRequests", customer?.id, selectedCampaignId],
    queryFn: () => getHistoricalRequests(customer!.id, selectedCampaignId),
    enabled: activityEnabled,
    refetchInterval: 3000,
  });

  const { data: ledgerTransactions = [] } = useQuery({
    queryKey: ["ledgerTransactions", customer?.id, selectedCampaignId],
    queryFn: async () => {
      const rows = await listCustomerLedger(customer!.id, { campaignId: selectedCampaignId, limit: 20 });
      return rows.map(mapLedgerToTransaction);
    },
    enabled: activityEnabled,
    refetchInterval: 5000,
  });

  const invalidateActivity = useCallback(async () => {
    if (!customer?.id) return;
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["pendingRequest", customer.id] }),
      queryClient.invalidateQueries({ queryKey: ["historicalRequests", customer.id] }),
      queryClient.invalidateQueries({ queryKey: ["ledgerTransactions", customer.id] }),
    ]);
  }, [customer?.id, queryClient]);

  const requestReward = useCallback(
    async (milestone: Milestone, points: number) => {
      if (!customer?.id || !selectedCampaignId) return;
      if (points < milestone.requiredPoints) {
        toast.error("Aún no tienes puntos suficientes para este premio");
        return;
      }
      try {
        await createRedemptionRequest({
          customerId: customer.id,
          campaignId: selectedCampaignId,
          rewardId: milestone.id,
          rewardName: milestone.rewardName,
          requiredPoints: milestone.requiredPoints,
        });
        await invalidateActivity();
        toast.success("Solicitud enviada al cajero");
      } catch (err) {
        toast.error((err as Error).message || "No se pudo solicitar el canje");
      }
    },
    [customer?.id, invalidateActivity, selectedCampaignId],
  );

  const cancelRequest = useCallback(
    async (request: RedemptionRequest) => {
      if (!customer?.id) return;
      try {
        await cancelRedemptionRequestByCustomer(request.id, customer.id);
        await invalidateActivity();
        toast.success("Solicitud cancelada");
      } catch (err) {
        toast.error((err as Error).message || "No se pudo cancelar la solicitud");
      }
    },
    [customer?.id, invalidateActivity],
  );

  const displayTransactions = useMemo(() => {
    const requestTransactions = historicalRequests.map(mapRequestToTransaction);
    return [...ledgerTransactions, ...requestTransactions]
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 20);
  }, [historicalRequests, ledgerTransactions]);

  const milestones = selectedCampaign?.milestones
    ? [...selectedCampaign.milestones].sort((a, b) => a.requiredPoints - b.requiredPoints)
    : [];

  const maxPoints = milestones.length > 0 ? milestones[milestones.length - 1].requiredPoints : 0;
  const nextMilestone = milestones.find((m) => m.requiredPoints > currentPoints);
  const pointsToNext = nextMilestone ? nextMilestone.requiredPoints - currentPoints : 0;
  const allCompleted = currentPoints >= maxPoints && maxPoints > 0;

  const needsPasswordChange = customer ? customerNeedsPasswordChange(customer) : false;
  const hasAcceptedTerms = !!(selectedCampaign && customer?.acceptedCampaigns?.includes(selectedCampaign.id));
  const showProgressFixture =
    typeof window !== "undefined" && new URLSearchParams(window.location.search).get("fixture") === "progress";

  useEffect(() => {
    if (needsPasswordChange) setShowPasswordModal(true);
  }, [needsPasswordChange]);
  useEffect(() => {
    const interval = setInterval(() => setHeroImgIdx((prev) => (prev + 1) % 3), 3500);
    return () => clearInterval(interval);
  }, []);

  const handleLogout = () => {
    void logout();
  };

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
      toast.error("No se pudo revocar el consentimiento. Intenta de nuevo.");
      return;
    }
    toast.success(
      `Consentimiento revocado. Tu cuenta fue dada de baja${
        result.totalPointsLost > 0 ? ` y se anularon ${result.totalPointsLost} pt(s)` : ""
      }.`,
    );
    setTimeout(() => {
      void logout();
    }, 1200);
  };

  const consentStatus = customer ? getConsentStatus(customer.id) : { hasActiveConsent: false };

  if (!customer) return null;

  const handleChangePassword = () => {
    if (newPwd.length < 4) {
      toast.error("La contraseña debe tener al menos 4 caracteres");
      return;
    }
    if (newPwd === customer.phone) {
      toast.error("La contraseña no puede ser igual a tu número de teléfono");
      return;
    }
    if (newPwd !== confirmPwd) {
      toast.error("Las contraseñas no coinciden");
      return;
    }
    resetCustomerPassword(customer.id, newPwd);
    toast.success("¡Contraseña actualizada exitosamente! 🔐");
    setShowPasswordModal(false);
    setNewPwd("");
    setConfirmPwd("");
    setTick((t) => t + 1);
    refreshCustomer();
  };

  const handleAcceptTerms = (checked: boolean) => {
    if (checked && selectedCampaign && !hasAcceptedTerms) {
      acceptCampaignTerms(customer.id, selectedCampaign.id);
      // Phase 3.3: terms acceptance is no longer mirrored as a 0-pt
      // transaction in the local audit log. Consent state lives on the
      // profile (`accepted_campaigns`); the ledger only records points.
      toast.success("¡Gracias por aceptar los términos! ✅");
      setTick((t) => t + 1);
      refreshCustomer();
    }
  };

  const cardShadow = "0 4px 20px -6px rgba(27,58,107,0.10)";

  // Estado vacío: no hay ninguna sucursal con campaña configurada.
  if (!campaignsReady) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "#f0f4f8" }}>
        <div className="flex flex-col items-center gap-3">
          <div
            className="w-10 h-10 rounded-full border-2 border-t-transparent animate-spin"
            style={{ borderColor: "#1B3A6B", borderTopColor: "transparent" }}
          />
          <p className="text-xs font-body" style={{ color: "#6b7a8c" }}>
            Cargando tus campañas…
          </p>
        </div>
      </div>
    );
  }

  if (activeCampaigns.length === 0) {
    return (
      <div className="min-h-screen flex flex-col" style={{ background: "#f0f4f8" }}>
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
            style={{ borderRadius: 16, border: "1px solid #e8edf3", boxShadow: cardShadow }}
          >
            <div className="text-4xl mb-2">🌊</div>
            <h2 className="font-heading font-bold text-base mb-1" style={{ color: "#1B3A6B" }}>
              No hay promociones activas
            </h2>
            <p className="font-body text-xs leading-relaxed" style={{ color: "#6b7a8c" }}>
              Por ahora ninguna sucursal tiene una campaña de premios configurada. Vuelve pronto para descubrir nuevas
              rutas de recompensas.
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
        <SocialFooter />
      </div>
    );
  }

  return (
    <div className="min-h-screen" style={{ background: "#f0f4f8" }}>
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
          <div
            className="flex items-center gap-3 cursor-pointer"
            style={{
              background: "linear-gradient(135deg, #fef3cd 0%, #fff8e1 100%)",
              borderRadius: 12,
              border: "1px solid #f0d060",
              padding: "12px 16px",
            }}
            onClick={() => setShowPasswordModal(true)}
          >
            <ShieldAlert className="w-5 h-5 shrink-0" style={{ color: "#b8860b" }} />
            <div className="flex-1">
              <p className="font-body font-semibold text-xs" style={{ color: "#8B6914" }}>
                ⚠️ Tu contraseña es igual a tu número de teléfono
              </p>
              <p className="font-body text-[10px] mt-0.5" style={{ color: "#a07d1c" }}>
                Por seguridad, te recomendamos cambiarla. Toca aquí para actualizarla.
              </p>
            </div>
            <KeyRound className="w-4 h-4 shrink-0" style={{ color: "#b8860b" }} />
          </div>
        )}

        <div
            key={selectedCampaignId || "none"}
            className="flex flex-col"
            style={{ gap: 10 }}
          >
            {/* Ruta de Premios */}
            <div
              className="bg-white relative"
              style={{ borderRadius: 16, border: "1px solid #e8edf3", padding: 16, boxShadow: cardShadow }}
            >
              {selectedCampaign && (
                <span
                  className="absolute top-3 right-3 inline-flex items-center gap-1 text-[9px] font-body font-bold uppercase tracking-wider px-2 py-0.5 rounded-full"
                  style={{
                    background: "rgba(34,197,94,0.12)",
                    color: "#16a34a",
                    border: "1px solid rgba(34,197,94,0.3)",
                  }}
                >
                  <span className="w-1.5 h-1.5 rounded-full" style={{ background: "#16a34a" }} />
                  Activa
                </span>
              )}
              <div className="flex items-center gap-2 mb-1">
                <Star className="w-4 h-4 sm:w-5 sm:h-5" style={{ color: "#C9A84C" }} />
                <h2 className="font-heading font-bold text-sm sm:text-base" style={{ color: "#1B3A6B" }}>
                  Tu Ruta de Premios
                </h2>
              </div>
              <p className="text-[10px] mb-3" style={{ color: "#8a96a6" }}>
                {currentPoints} / {maxPoints} puntos · {selectedCampaign?.branch || "Sin sucursal"}
              </p>
              <div className="w-full" style={{ padding: "0 16px", boxSizing: "border-box" }}>
                <ProgressRoute currentPoints={currentPoints} milestones={milestones} animate={false} />
              </div>
              {showProgressFixture && (
                <div className="mt-3 grid gap-3 border-t pt-3">
                  {[0, 1, 2, 3].map((points) => (
                    <div
                      key={points}
                      className="rounded-lg border border-dashed border-secondary/30 bg-secondary/5 p-2"
                    >
                      <p className="mb-1 text-[10px] font-bold text-secondary">Fixture: {points} pts</p>
                      <ProgressRoute currentPoints={points} milestones={milestones} animate={false} />
                    </div>
                  ))}
                </div>
              )}
            </div>

            <StatsGrid
              currentPoints={currentPoints}
              pointsToNext={pointsToNext}
              maxPoints={maxPoints}
              nextMilestone={nextMilestone}
            />
            {selectedCampaign && <BonusRuleBadge campaign={selectedCampaign} variant="card" />}
            <RewardsCard
              milestones={milestones}
              currentPoints={currentPoints}
              nextMilestoneId={nextMilestone?.id}
              pendingRequest={pendingRequest}
              onRequest={(m) => requestReward(m, currentPoints)}
              onCancelRequest={cancelRequest}
            />

            {selectedCampaign && (
              <TermsSection
                key={selectedCampaign.id}
                campaign={selectedCampaign}
                hasAcceptedTerms={hasAcceptedTerms}
                onAcceptTerms={handleAcceptTerms}
                cardShadow={cardShadow}
                className="mt-8"
              />
            )}
          </div>

        <div
          className="grid gap-2"
        >
          <button
            onClick={() => setShowHistory(!showHistory)}
            className="flex items-center justify-center gap-2 font-body font-semibold text-white cursor-pointer w-full"
            style={{
              background: "linear-gradient(135deg, #1B3A6B 0%, #2E6DB4 100%)",
              borderRadius: 14,
              padding: "12px",
              fontSize: 11,
              border: "none",
              boxShadow: "0 4px 12px -4px rgba(27,58,107,0.3)",
            }}
          >
            <Clock className="w-4 h-4" />
            {showHistory ? "Ocultar" : "Ver historial"}
          </button>
        </div>

        {showHistory && (
          <motion.div
            className="bg-white"
            style={{ borderRadius: 16, border: "1px solid #e8edf3", padding: 16, boxShadow: cardShadow }}
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
          >
            <div className="flex items-center gap-2 mb-3">
              <Clock className="w-5 h-5 text-secondary" />
              <h2 className="font-heading font-bold text-sm sm:text-base" style={{ color: "#1B3A6B" }}>
                Actividad — {selectedCampaign?.branch || "Sucursal"}
              </h2>
            </div>
            {displayTransactions.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4 font-body">
                Aún no tienes movimientos en esta sucursal
              </p>
            ) : (
              displayTransactions.map((tx) => <TransactionItem key={tx.id} tx={tx} />)
            )}
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
      <SocialFooter />
    </div>
  );
}
