import { useState, useEffect } from 'react';
import { getOperableCampaigns, getCampaignById, setStaffBranch } from '@/lib/store';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

import { useStaffAuth } from '@/hooks/useStaffAuth';
import { useCustomerOperations } from '@/hooks/useCustomerOperations';
import OperationsTab from '@/components/staff/OperationsTab';
import DashboardTab from '@/components/staff/DashboardTab';
import CampaignsTab from '@/components/staff/CampaignsTab';
import ReportsTab from '@/components/staff/ReportsTab';
import RedeemDialog from '@/components/staff/RedeemDialog';
import ReverseDialog from '@/components/staff/ReverseDialog';
import CampaignDialogs from '@/components/staff/CampaignDialogs';
import FloatingPoint from '@/components/FloatingPoint';
import StaffShiftStats from '@/components/staff/StaffShiftStats';
import CampaignStrip from '@/components/staff/CampaignStrip';
import { LogOut, Activity, BarChart3, Settings, TrendingUp, MapPin, ArrowLeftRight } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import logo from '@/assets/logo-gaviota.png';
import dishImg1 from '@/assets/papa_ahogada.png';
import dishImg2 from '@/assets/camaron_apanado.png';
import dishImg3 from '@/assets/gaviota_especial.png';

const carouselImages = [dishImg1, dishImg2, dishImg3];

export default function StaffPanel() {
  const { staff, isAdmin, logout } = useStaffAuth();
  const [activeTab, setActiveTab] = useState('operations');
  const [, setTick] = useState(0);
  const refresh = () => setTick(t => t + 1);

  const [showFinishConfirm, setShowFinishConfirm] = useState(false);
  const [finishCampaignId, setFinishCampaignId] = useState('');
  const [showReactivateDialog, setShowReactivateDialog] = useState(false);
  const [reactivateCampaignId, setReactivateCampaignId] = useState('');
  const [showBranchPicker, setShowBranchPicker] = useState(false);

  const [carouselIndex, setCarouselIndex] = useState(0);
  useEffect(() => {
    const interval = setInterval(() => {
      setCarouselIndex(prev => (prev + 1) % carouselImages.length);
    }, 3500);
    return () => clearInterval(interval);
  }, []);

  const activeCampaigns = getOperableCampaigns();
  const initialBranchId = staff?.branchCampaignId && activeCampaigns.find(c => c.id === staff.branchCampaignId)
    ? staff.branchCampaignId
    : activeCampaigns[0]?.id || '';
  const [branchCampaignId, setBranchCampaignId] = useState<string>(initialBranchId);

  useEffect(() => {
    if (!branchCampaignId && activeCampaigns.length > 0) {
      setBranchCampaignId(activeCampaigns[0].id);
    }
  }, [activeCampaigns, branchCampaignId]);

  const handleBranchChange = (id: string) => {
    setBranchCampaignId(id);
    if (staff) setStaffBranch(staff.id, id);
    refresh();
  };

  const ops = useCustomerOperations(staff!, branchCampaignId);

  if (!staff) return null;

  const currentCampaign = getCampaignById(branchCampaignId);

  return (
    <div className="min-h-screen bg-background">
      <FloatingPoint
        show={ops.showFloating}
        onDone={() => ops.setShowFloating(false)}
        amount={ops.floatingAmount}
        multiplier={ops.floatingMultiplier}
      />

      <div className="relative overflow-hidden px-4 py-6" style={{ background: '#001F3F' }}>
        <svg className="absolute inset-0 w-full h-full opacity-[0.07]" preserveAspectRatio="none" viewBox="0 0 800 200">
          <defs>
            <pattern id="staffWaves" x="0" y="0" width="200" height="100" patternUnits="userSpaceOnUse">
              <path d="M0 50 Q50 20 100 50 T200 50" fill="none" stroke="#C5A059" strokeWidth="1.5"/>
              <path d="M0 70 Q50 40 100 70 T200 70" fill="none" stroke="#C5A059" strokeWidth="1"/>
              <path d="M0 30 Q50 0 100 30 T200 30" fill="none" stroke="#C5A059" strokeWidth="0.8"/>
            </pattern>
          </defs>
          <rect width="800" height="200" fill="url(#staffWaves)"/>
        </svg>
        <div className="absolute top-0 right-0 w-40 h-40 opacity-[0.06]" style={{
          background: 'linear-gradient(135deg, #C5A059 0%, transparent 60%)',
          clipPath: 'polygon(100% 0, 0 0, 100% 100%)',
        }} />

        <div className="relative max-w-4xl mx-auto">
          {/* Fila 1: logo + bienvenida + rol + logout */}
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-3 min-w-0">
              <img src={logo} alt="La Gaviota Azul Express" className="h-12 w-auto shrink-0" />
              <div className="flex flex-col min-w-0">
                <span className="text-[10px] tracking-[0.18em] uppercase font-body leading-none" style={{ color: 'rgba(255,255,255,0.45)' }}>
                  Bienvenido,
                </span>
                <div className="flex items-center gap-2 mt-1">
                  <span className="font-heading font-bold text-base text-white truncate leading-none">
                    {staff.name}
                  </span>
                  <span
                    className="text-[9px] uppercase tracking-[0.15em] font-body font-semibold px-2 py-0.5 rounded-full leading-none"
                    style={{
                      background: 'rgba(255,255,255,0.08)',
                      border: '1px solid rgba(255,255,255,0.15)',
                      color: 'rgba(255,255,255,0.75)',
                    }}
                  >
                    {isAdmin ? 'Administrador' : 'Cajero'}
                  </span>
                </div>
              </div>
            </div>
            <Button variant="ghost" size="icon" onClick={logout} className="hover:bg-white/10 shrink-0" style={{ color: 'rgba(255,255,255,0.7)' }}>
              <LogOut className="w-5 h-5" />
            </Button>
          </div>

          {/* Branch selector / pill — admin selecciona, cajero ve fijo. Badge EN TURNO embebido. */}
          {activeCampaigns.length > 0 && (
            <div className="mb-3">
              <div
                className="flex items-center gap-3"
                style={{
                  background: 'rgba(255,255,255,0.06)',
                  border: '1px solid rgba(197,160,89,0.25)',
                  borderRadius: '12px',
                  padding: '10px 14px',
                }}
              >
                {/* Pin dorado */}
                <div
                  className="flex items-center justify-center shrink-0"
                  style={{
                    width: '34px',
                    height: '34px',
                    background: 'rgba(197,160,89,0.15)',
                    borderRadius: '8px',
                  }}
                >
                  <MapPin className="w-4 h-4" style={{ color: '#C5A059' }} />
                </div>

                {/* Texto en 3 líneas */}
                <div className="flex flex-col min-w-0 flex-1 gap-0.5">
                  <span
                    className="font-body leading-none"
                    style={{ fontSize: '9px', color: 'rgba(255,255,255,0.4)', letterSpacing: '0.12em', textTransform: 'uppercase' }}
                  >
                    Estás trabajando en
                  </span>
                  <span
                    className="font-heading font-bold text-white truncate leading-tight"
                    style={{ fontSize: '14px' }}
                  >
                    {currentCampaign?.branch || 'Sin sucursal'}
                  </span>
                  <span
                    className="font-body truncate leading-none"
                    style={{ fontSize: '10px', color: 'rgba(197,160,89,0.7)' }}
                  >
                    {currentCampaign?.name || 'Sin campaña activa'}
                  </span>
                </div>

                {/* Derecha: badge En turno + botón Cambiar */}
                <div className="flex flex-col items-end gap-1.5 shrink-0">
                  <span
                    className="inline-flex items-center gap-1.5 text-[10px] font-body font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full leading-none"
                    style={{ background: 'rgba(127,227,181,0.15)', color: '#7FE3B5', border: '1px solid rgba(127,227,181,0.35)' }}
                  >
                    <span className="inline-block w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: '#7FE3B5', boxShadow: '0 0 6px #7FE3B5' }} />
                    En turno
                  </span>
                  {isAdmin && activeCampaigns.length > 1 && (
                    <button
                      onClick={() => setShowBranchPicker(true)}
                      className="inline-flex items-center gap-1 text-[10px] font-body font-semibold px-2 py-0.5 rounded-md transition-colors hover:bg-white/10"
                      style={{
                        background: 'rgba(255,255,255,0.04)',
                        border: '1px solid rgba(197,160,89,0.3)',
                        color: '#C5A059',
                      }}
                    >
                      <ArrowLeftRight className="w-2.5 h-2.5" />
                      Cambiar
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Stats del turno */}
          <StaffShiftStats staffId={staff.id} branchCampaignId={branchCampaignId} refreshKey={ops.tick} />

          {/* Carrusel decorativo (solo desktop) */}
          <div className="hidden sm:block absolute top-0 right-0 w-32 h-32 pointer-events-none">
            {carouselImages.map((img, i) => (
              <img
                key={i}
                src={img}
                alt=""
                className="absolute inset-0 w-full h-full object-contain select-none transition-opacity duration-700 ease-in-out"
                style={{
                  opacity: carouselIndex === i ? 0.55 : 0,
                  filter: 'drop-shadow(0 6px 24px rgba(0,0,0,0.5))',
                }}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Franja de campaña activa + alerta T&C (reemplaza la card de campaña dentro del hero) */}
      <CampaignStrip campaign={currentCampaign} selectedCustomer={ops.selectedCustomer} />

      <div className="max-w-4xl mx-auto p-4">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className={`grid w-full ${isAdmin ? 'grid-cols-4' : 'grid-cols-1'} bg-muted/60`}>
            <TabsTrigger value="operations" className="gap-2 font-heading text-xs tracking-wide data-[state=active]:border-b-2 data-[state=active]:rounded-b-none data-[state=active]:shadow-none" style={{ borderColor: activeTab === 'operations' ? '#C5A059' : 'transparent' }}><Activity className="w-4 h-4" />Operaciones</TabsTrigger>
            {isAdmin && <TabsTrigger value="dashboard" className="gap-2 font-heading text-xs tracking-wide data-[state=active]:border-b-2 data-[state=active]:rounded-b-none data-[state=active]:shadow-none" style={{ borderColor: activeTab === 'dashboard' ? '#C5A059' : 'transparent' }}><BarChart3 className="w-4 h-4" />Dashboard</TabsTrigger>}
            {isAdmin && <TabsTrigger value="campaigns" className="gap-2 font-heading text-xs tracking-wide data-[state=active]:border-b-2 data-[state=active]:rounded-b-none data-[state=active]:shadow-none" style={{ borderColor: activeTab === 'campaigns' ? '#C5A059' : 'transparent' }}><Settings className="w-4 h-4" />Campañas</TabsTrigger>}
            {isAdmin && <TabsTrigger value="reports" className="gap-2 font-heading text-xs tracking-wide data-[state=active]:border-b-2 data-[state=active]:rounded-b-none data-[state=active]:shadow-none" style={{ borderColor: activeTab === 'reports' ? '#C5A059' : 'transparent' }}><TrendingUp className="w-4 h-4" />Reportes</TabsTrigger>}
          </TabsList>

          <TabsContent value="operations">
            <OperationsTab
              phoneSearch={ops.phoneSearch} setPhoneSearch={ops.setPhoneSearch}
              searchCustomer={ops.searchCustomer} selectedCustomer={ops.selectedCustomer} setSelectedCustomer={ops.setSelectedCustomer}
              handleAddPoint={ops.handleAddPoint} rewards={ops.rewards}
              setShowRedeemDialog={ops.setShowRedeemDialog} setShowReverseDialog={ops.setShowReverseDialog}
              commentCat={ops.commentCat} commentText={ops.commentText}
              setCommentCat={ops.setCommentCat} setCommentText={ops.setCommentText}
              campaign={currentCampaign}
              currentPoints={ops.currentPoints}
              activeCampaigns={activeCampaigns}
              currentCampaignId={branchCampaignId}
              pendingRequest={ops.pendingRequest}
              onApproveRequest={ops.approvePendingRequest}
              onRejectRequest={ops.rejectPendingRequest}
              onRefresh={ops.refresh}
            />
          </TabsContent>

          {isAdmin && <TabsContent value="dashboard"><DashboardTab branchCampaignId={branchCampaignId} /></TabsContent>}

          {isAdmin && (
            <TabsContent value="campaigns">
              <CampaignsTab
                onRefresh={refresh}
                onFinishCampaign={(id) => { setFinishCampaignId(id); setShowFinishConfirm(true); }}
                onReactivateCampaign={(id) => { setReactivateCampaignId(id); setShowReactivateDialog(true); }}
              />
            </TabsContent>
          )}

          {isAdmin && <TabsContent value="reports"><ReportsTab branchCampaignId={branchCampaignId} /></TabsContent>}
        </Tabs>
      </div>

      <RedeemDialog
        open={ops.showRedeemDialog} onOpenChange={ops.setShowRedeemDialog}
        customer={ops.selectedCustomer} campaign={currentCampaign}
        currentPoints={ops.currentPoints}
        selectedReward={ops.selectedReward} setSelectedReward={ops.setSelectedReward}
        commentCat={ops.commentCat} commentText={ops.commentText}
        setCommentCat={ops.setCommentCat} setCommentText={ops.setCommentText}
        onRedeem={ops.handleRedeem}
      />

      <ReverseDialog
        open={ops.showReverseDialog} onOpenChange={ops.setShowReverseDialog}
        commentCat={ops.commentCat} commentText={ops.commentText}
        setCommentCat={ops.setCommentCat} setCommentText={ops.setCommentText}
        onReverse={ops.handleReverse}
      />

      <CampaignDialogs
        showFinishConfirm={showFinishConfirm} setShowFinishConfirm={setShowFinishConfirm}
        finishCampaignId={finishCampaignId}
        showReactivateDialog={showReactivateDialog} setShowReactivateDialog={setShowReactivateDialog}
        reactivateCampaignId={reactivateCampaignId}
        onRefresh={refresh}
      />

      <Dialog open={showBranchPicker} onOpenChange={setShowBranchPicker}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-heading">Cambiar de sucursal</DialogTitle>
            <DialogDescription>Selecciona la sucursal en la que estarás operando.</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-2 mt-2">
            {activeCampaigns.map(c => {
              const isActive = c.id === branchCampaignId;
              return (
                <button
                  key={c.id}
                  onClick={() => { handleBranchChange(c.id); setShowBranchPicker(false); }}
                  className={`flex items-center justify-between gap-3 p-3 rounded-lg border text-left transition-colors ${
                    isActive ? 'border-[#C5A059] bg-[#C5A059]/10' : 'border-border hover:bg-muted'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <MapPin className="w-4 h-4 shrink-0" style={{ color: '#C5A059' }} />
                    <div className="flex flex-col min-w-0">
                      <span className="font-heading font-semibold text-sm truncate">{c.branch}</span>
                      <span className="text-xs text-muted-foreground truncate">{c.name}</span>
                    </div>
                  </div>
                  {isActive && (
                    <span className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full" style={{ background: 'rgba(127,227,181,0.15)', color: '#7FE3B5', border: '1px solid rgba(127,227,181,0.35)' }}>
                      Actual
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
