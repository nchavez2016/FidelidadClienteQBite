import { motion } from 'framer-motion';
import type { Milestone } from '@/lib/types';

interface StatsGridProps {
  currentPoints: number;
  pointsToNext: number;
  maxPoints: number;
  nextMilestone: Milestone | undefined;
}

export default function StatsGrid({ currentPoints, pointsToNext, maxPoints, nextMilestone }: StatsGridProps) {
  const cards = [
    { value: currentPoints, label: 'Puntos actuales', color: '#C5A059' },
    { value: nextMilestone ? pointsToNext : '—', label: 'Faltan para siguiente', color: '#001F3F' },
    { value: maxPoints, label: 'Meta de campaña', color: '#001F3F' },
  ];

  return (
    <motion.div
      className="grid grid-cols-3 gap-2 sm:gap-3"
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.3 }}
    >
      {cards.map((c) => (
        <div
          key={c.label}
          style={{
            background: '#fff',
            borderRadius: 12,
            border: '1px solid #e8edf3',
            padding: 12,
            boxShadow: '0 2px 8px -4px rgba(27,58,107,0.06)',
          }}
        >
          <div
            className="font-heading font-bold text-[22px] sm:text-[26px] leading-none"
            style={{ color: c.color }}
          >
            {c.value}
          </div>
          <p className="font-body text-[9px] sm:text-[10px] mt-1.5" style={{ color: '#8a96a6' }}>
            {c.label}
          </p>
        </div>
      ))}
    </motion.div>
  );
}
