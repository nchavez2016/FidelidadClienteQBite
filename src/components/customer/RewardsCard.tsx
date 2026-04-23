import { Gift, CheckCircle, Lock, ArrowRight } from 'lucide-react';
import { motion } from 'framer-motion';
import type { Milestone } from '@/lib/types';

interface RewardsCardProps {
  milestones: Milestone[];
  /** Puntos actuales en la campaña seleccionada. */
  currentPoints: number;
  nextMilestoneId: string | undefined;
  onRedeem?: (milestone: Milestone) => void;
}

export default function RewardsCard({ milestones, currentPoints, onRedeem }: RewardsCardProps) {
  if (milestones.length === 0) return null;

  return (
    <motion.div
      className="bg-white"
      style={{ borderRadius: 16, border: '0.5px solid #C5A059', padding: 16, boxShadow: '0 6px 24px -8px rgba(197,160,89,0.15)' }}
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.35 }}
    >
      <div className="flex items-center gap-2 mb-3">
        <Gift className="w-4 h-4 sm:w-5 sm:h-5" style={{ color: '#C9A84C' }} />
        <h2 className="font-heading font-bold text-sm sm:text-base" style={{ color: '#1B3A6B' }}>
          Premios Disponibles
        </h2>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 sm:gap-2.5">
        {milestones.map((m, index) => {
          const unlocked = currentPoints >= m.requiredPoints;
          const missing = Math.max(0, m.requiredPoints - currentPoints);
          return (
            <motion.div
              key={m.id}
              initial={{ opacity: 0, y: 12, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ delay: 0.4 + index * 0.08, duration: 0.4, ease: 'easeOut' }}
              className="relative flex flex-col items-center gap-1.5 transition-all overflow-hidden"
              style={{
                background: unlocked ? '#fffdf5' : '#fff',
                borderRadius: 12,
                padding: unlocked ? '14px 12px 10px' : '12px',
                minWidth: 0,
                border: unlocked ? '1.5px solid #C5A059' : '0.5px solid rgba(197,160,89,0.25)',
                boxShadow: unlocked
                  ? '0 4px 16px -4px rgba(197,160,89,0.35)'
                  : '0 2px 8px -4px rgba(0,0,0,0.05)',
              }}
            >
              {/* Franja dorada superior para premios desbloqueados */}
              {unlocked && (
                <div
                  className="absolute top-0 left-0 right-0"
                  style={{ height: 3, background: 'linear-gradient(90deg, #C5A059 0%, #E5C47B 50%, #C5A059 100%)' }}
                />
              )}

              <div
                className="w-8 h-8 rounded-full flex items-center justify-center"
                style={{ background: unlocked ? 'rgba(201,168,76,0.15)' : '#f0f4f8' }}
              >
                {unlocked
                  ? <CheckCircle className="w-4 h-4" style={{ color: '#C9A84C' }} />
                  : <Lock className="w-3.5 h-3.5" style={{ color: '#C5A059' }} />
                }
              </div>
              <span className="text-[11px] font-body font-semibold text-center leading-tight" style={{ color: '#1B3A6B' }}>
                {m.rewardName}
              </span>
              <span
                className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                style={{
                  background: unlocked ? 'rgba(201,168,76,0.12)' : '#f0f4f8',
                  color: unlocked ? '#C9A84C' : '#999',
                }}
              >
                {m.requiredPoints} pts
              </span>

              {unlocked ? (
                onRedeem ? (
                  <button
                    onClick={() => onRedeem(m)}
                    className="mt-1.5 w-full flex items-center justify-center gap-1 text-[10px] font-body font-bold text-white px-2 py-1.5 rounded-md transition-transform active:scale-95"
                    style={{
                      background: 'linear-gradient(135deg, #2E6DB4 0%, #1B3A6B 100%)',
                      boxShadow: '0 2px 8px -2px rgba(46,109,180,0.4)',
                    }}
                  >
                    Canjear ahora
                    <ArrowRight className="w-3 h-3" />
                  </button>
                ) : (
                  <span
                    className="mt-1 text-[9px] font-body font-bold uppercase tracking-wider"
                    style={{ color: '#2E6DB4' }}
                  >
                    Disponible
                  </span>
                )
              ) : (
                <span className="mt-1 text-[10px] font-body" style={{ color: '#999' }}>
                  Faltan <span style={{ fontWeight: 600 }}>{missing}</span> pts
                </span>
              )}
            </motion.div>
          );
        })}
      </div>
    </motion.div>
  );
}
