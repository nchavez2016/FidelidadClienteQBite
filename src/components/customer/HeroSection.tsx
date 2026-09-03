import { LogOut, MapPin } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import logo from '@/assets/logo-qbites.png';
import dishImg1 from '@/assets/chicken-tender.png';
import dishImg2 from '@/assets/hamburguesa.png';
import dishImg3 from '@/assets/sanduche.png';
import type { Customer, Campaign, Milestone } from '@/lib/types';
import { getCustomerPoints } from '@/services';
import { getBranchAccent } from '@/lib/utils';

const heroCarouselImages = [dishImg1, dishImg2, dishImg3];

interface HeroSectionProps {
  customer: Customer;
  campaign: Campaign | undefined;
  /** Puntos del cliente para la campaña seleccionada. */
  points: number;
  heroImgIdx: number;
  onLogout: () => void;
  /** Próximo hito (para la mini barra de progreso). */
  nextMilestone?: Milestone;
  /** Puntos faltantes para el próximo hito. */
  pointsToNext?: number;
  /** Lista de campañas activas para chips scrolleables (solo si hay >1). */
  activeCampaigns?: Campaign[];
  selectedCampaignId?: string;
  onSelectCampaign?: (id: string) => void;
}

export default function HeroSection({
  customer,
  campaign,
  points,
  heroImgIdx,
  onLogout,
  nextMilestone,
  pointsToNext = 0,
  activeCampaigns = [],
  selectedCampaignId,
  onSelectCampaign,
}: HeroSectionProps) {
  // Progreso hacia el siguiente hito (0-100). Si no hay próximo, está al 100%.
  const prevTarget = nextMilestone
    ? Math.max(0, nextMilestone.requiredPoints - pointsToNext - (points - (nextMilestone.requiredPoints - pointsToNext)))
    : 0;
  const progressPct = nextMilestone
    ? Math.min(100, Math.max(0, (points / nextMilestone.requiredPoints) * 100))
    : 100;

  const showSwitcher = activeCampaigns.length > 1 && !!onSelectCampaign;

  return (
    <div className="relative w-full overflow-hidden" style={{ minHeight: '340px', background: '#0B181E' }}>
      <svg className="absolute inset-0 w-full h-full opacity-[0.08]" preserveAspectRatio="none" viewBox="0 0 400 320">
        <defs>
          <pattern id="wavePattern" x="0" y="0" width="200" height="40" patternUnits="userSpaceOnUse">
            <path d="M0 20 Q25 0 50 20 T100 20 T150 20 T200 20" fill="none" stroke="#E8A145" strokeWidth="1.2"/>
            <path d="M0 30 Q25 10 50 30 T100 30 T150 30 T200 30" fill="none" stroke="#E8A145" strokeWidth="0.8"/>
          </pattern>
        </defs>
        <rect width="400" height="320" fill="url(#wavePattern)"/>
      </svg>

      <div className="absolute top-0 right-0 w-48 h-48 opacity-[0.06]" style={{
        background: 'linear-gradient(135deg, #E8A145 0%, transparent 60%)',
        clipPath: 'polygon(100% 0, 0 0, 100% 100%)',
      }} />

      {/* Marca de agua decorativa — mismo patrón que PokerAmbience en ProgressRoute.tsx.
          Anclada arriba: la tarjeta de puntos (frosted glass + blur) tapa casi todo el
          resto del hero, igual que ya le pasa al patrón de olas y al triángulo dorado. */}
      <span
        className="absolute select-none pointer-events-none"
        style={{ top: '-30px', right: '-15px', fontSize: '220px', lineHeight: 1, color: '#E8A145', opacity: 0.09 }}
        aria-hidden="true"
      >
        ♣
      </span>

      <div className="relative z-10 max-w-[720px] mx-auto px-3 sm:px-10">
        <div className="w-full flex items-center justify-between pt-4 pb-2">
          <img src={logo} alt="Qbites" className="w-[67px] h-auto sm:w-[78px] opacity-90" />
          <button
            onClick={onLogout}
            className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-white/15 transition-colors"
            style={{ color: 'rgba(255,255,255,0.7)' }}
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>

        <p className="font-body text-white text-[15px] sm:text-[17px] mt-3 tracking-wide text-center">
          ¡Hola, <span className="font-semibold">{customer.name}</span>!
        </p>

        <div className="mt-4 mb-4 flex items-center gap-0">
          <div
              key={campaign?.id || 'no-campaign'}
              className="flex-1 min-w-0 flex flex-col items-center px-4 sm:px-10 py-5 sm:py-6 rounded-2xl relative z-10"
              style={{
                background: 'rgba(255,255,255,0.08)',
                backdropFilter: 'blur(18px)',
                WebkitBackdropFilter: 'blur(18px)',
                border: '1px solid rgba(232,161,69,0.45)',
                boxShadow: '0 8px 32px rgba(0,0,0,0.3), inset 0 1px 0 rgba(232,161,69,0.15)',
              }}
            >
              {campaign && (
                <p className="font-body text-[10px] tracking-[0.15em] uppercase mb-2 text-center break-words max-w-full" style={{ color: 'rgba(255,255,255,0.5)' }}>
                  {campaign.branch} · {campaign.name}
                </p>
              )}
              <div className="font-heading font-bold leading-none" style={{ fontSize: 'clamp(40px, 13vw, 56px)', color: '#E8A145' }}>
                {points.toLocaleString()}
              </div>
              <p className="font-body text-[11px] sm:text-[12px] mt-2 tracking-[0.2em] uppercase" style={{ color: 'rgba(232,161,69,0.85)' }}>
                Puntos Acumulados
              </p>

              {/* Mini barra de progreso al siguiente hito */}
              {nextMilestone && (
                <div className="w-full mt-4 flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-3">
                  <div
                    className="w-full sm:flex-1 rounded-full overflow-hidden"
                    style={{ height: 4, background: 'rgba(255,255,255,0.1)' }}
                  >
                    <motion.div
                      initial={false}
                      animate={{ width: `${progressPct}%` }}
                      transition={{ duration: 0.8, ease: 'easeOut' }}
                      style={{ height: '100%', background: '#E8A145', borderRadius: 999 }}
                    />
                  </div>
                  <span
                    className="text-[10px] font-body text-center sm:text-right leading-tight"
                    style={{ color: 'rgba(255,255,255,0.7)' }}
                  >
                    Faltan <span style={{ color: '#E8A145', fontWeight: 600 }}>{pointsToNext}</span> pts: {nextMilestone.rewardName}
                  </span>
                </div>
              )}
            </div>

          <div className="hidden sm:block relative w-36 h-36 -ml-8 z-20">
            <AnimatePresence initial={false}>
              <motion.img
                key={heroImgIdx}
                src={heroCarouselImages[heroImgIdx]}
                alt="Plato destacado"
                className="absolute inset-0 w-36 h-36 object-contain"
                style={{ filter: 'drop-shadow(0 8px 24px rgba(0,0,0,0.4))' }}
                initial={false}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.8, ease: 'easeInOut' }}
              />
            </AnimatePresence>
          </div>
        </div>

        {/* Chips horizontales scrolleables de sucursales (solo si hay más de una activa) */}
        {showSwitcher && (
          <div className="pb-4 -mx-5 sm:-mx-10 px-5 sm:px-10">
            <p className="font-body text-[10px] tracking-[0.15em] uppercase mb-2" style={{ color: 'rgba(255,255,255,0.45)' }}>
              Tus rutas activas
            </p>
            <div
              className="flex gap-2 overflow-x-auto pb-1"
              style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
            >
              <style>{`.hero-chips-scroll::-webkit-scrollbar { display: none; }`}</style>
              {activeCampaigns.map((c) => {
                const active = c.id === selectedCampaignId;
                const cPoints = getCustomerPoints(customer, c.id);
                const accent = getBranchAccent(c.branch);
                const accentColor = accent?.borderStrong ?? '#E8A145';
                return (
                  <button
                    key={c.id}
                    onClick={() => onSelectCampaign?.(c.id)}
                    className="flex items-center gap-2 shrink-0 px-3 py-2 rounded-xl transition-all"
                    style={{
                      background: 'rgba(255,255,255,0.07)',
                      border: active ? `1.5px solid ${accentColor}` : `1px solid ${accentColor}40`,
                      boxShadow: active ? `0 0 12px -2px ${accentColor}66` : 'none',
                    }}
                  >
                    <MapPin className="w-3 h-3" style={{ color: active ? accentColor : 'rgba(255,255,255,0.5)' }} />
                    <span
                      className="font-body text-[11px] font-semibold whitespace-nowrap"
                      style={{ color: active ? '#fff' : 'rgba(255,255,255,0.7)' }}
                    >
                      {c.branch}
                    </span>
                    <span
                      className="text-[10px] font-bold px-1.5 py-0.5 rounded-full"
                      style={{
                        background: active ? `${accentColor}33` : 'rgba(255,255,255,0.08)',
                        color: active ? accentColor : 'rgba(255,255,255,0.6)',
                      }}
                    >
                      {cPoints} pts
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
