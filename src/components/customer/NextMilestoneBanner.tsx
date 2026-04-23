import { Star } from 'lucide-react';
import type { Milestone } from '@/lib/types';

interface NextMilestoneBannerProps {
  allCompleted: boolean;
  nextMilestone: Milestone | undefined;
  pointsToNext: number;
}

export default function NextMilestoneBanner({ allCompleted, nextMilestone, pointsToNext }: NextMilestoneBannerProps) {
  if (allCompleted) {
    return (
      <div className="max-w-[720px] mx-auto px-4 sm:px-6 mt-3 mb-1">
        <div
          className="flex items-center justify-center gap-2 py-3 px-5 font-body text-[13px] sm:text-[14px]"
          style={{
            background: 'linear-gradient(135deg, #2E6DB4 0%, #1a4a80 100%)',
            color: '#fff',
            borderRadius: 12,
            boxShadow: '0 4px 16px -4px rgba(46,109,180,0.4)',
          }}
        >
          <Star className="w-4 h-4 shrink-0" style={{ color: '#C5A059', fill: '#C5A059' }} />
          🎉 ¡Completaste la ruta de premios!
        </div>
      </div>
    );
  }

  if (!nextMilestone) {
    return (
      <div className="max-w-[720px] mx-auto px-4 sm:px-6 mt-3 mb-1">
        <div
          className="flex items-center justify-center gap-2 py-3 px-5 font-body text-[13px]"
          style={{ background: 'rgba(46,109,180,0.1)', color: '#1B3A6B', borderRadius: 12 }}
        >
          Sin campaña activa
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-[720px] mx-auto px-4 sm:px-6 mt-3 mb-1">
      <div
        className="flex items-center gap-3 py-3 px-4"
        style={{
          background: 'linear-gradient(135deg, #2E6DB4 0%, #1a4a80 100%)',
          borderRadius: 12,
          boxShadow: '0 4px 16px -4px rgba(46,109,180,0.4)',
        }}
      >
        <div
          className="w-9 h-9 rounded-full flex items-center justify-center shrink-0"
          style={{ background: 'rgba(197,160,89,0.18)', border: '1px solid rgba(197,160,89,0.4)' }}
        >
          <Star className="w-4 h-4" style={{ color: '#C5A059', fill: '#C5A059' }} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-body font-bold text-white text-[13px] sm:text-[14px] leading-tight">
            ¡Estás muy cerca!
          </p>
          <p className="font-body text-[11px] sm:text-[12px] mt-0.5 truncate" style={{ color: 'rgba(255,255,255,0.7)' }}>
            {nextMilestone.rewardName}
          </p>
        </div>
        <div className="text-right shrink-0">
          <div className="font-heading font-bold text-[20px] sm:text-[22px] leading-none" style={{ color: '#C5A059' }}>
            {pointsToNext}
          </div>
          <p className="font-body text-[9px] uppercase tracking-wider mt-0.5" style={{ color: 'rgba(197,160,89,0.85)' }}>
            pts faltan
          </p>
        </div>
      </div>
    </div>
  );
}
