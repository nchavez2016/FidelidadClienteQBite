import type { Milestone } from '@/lib/types';
import { getBranchAccent } from '@/lib/utils';

interface StatsGridProps {
  currentPoints: number;
  pointsToNext: number;
  maxPoints: number;
  nextMilestone: Milestone | undefined;
  branch?: string;
}

export default function StatsGrid({ currentPoints, pointsToNext, maxPoints, nextMilestone, branch }: StatsGridProps) {
  const accent = getBranchAccent(branch);
  const borderColor = accent?.borderStrong ?? '#e8edf3';
  const borderStyle = accent ? `1.5px solid ${borderColor}` : '1px solid #e8edf3';
  const shadow = accent
    ? `0 4px 14px -6px ${borderColor}55`
    : '0 2px 8px -4px rgba(11,24,30,0.06)';
  const bg = accent ? accent.bg : '#fff';
  const cards = [
    { value: currentPoints, label: 'Puntos actuales', color: accent?.borderStrong ?? '#E8A145' },
    { value: nextMilestone ? pointsToNext : '—', label: 'Faltan para siguiente', color: '#0B181E' },
    { value: maxPoints, label: 'Meta de campaña', color: '#0B181E' },
  ];

  return (
    <div
      className="grid grid-cols-3 gap-2 sm:gap-3"
    >
      {cards.map((c) => (
        <div
          key={c.label}
          className="min-w-0"
          style={{
            background: bg,
            borderRadius: 12,
            border: borderStyle,
            padding: 10,
            boxShadow: shadow,
          }}
        >
          <div
            className="font-heading font-bold text-[18px] sm:text-[26px] leading-none"
            style={{ color: c.color }}
          >
            {c.value}
          </div>
          <p className="font-body text-[9px] sm:text-[10px] mt-1.5 leading-tight break-words" style={{ color: '#8a96a6' }}>
            {c.label}
          </p>
        </div>
      ))}
    </div>
  );
}
