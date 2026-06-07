import type { Milestone } from '@/lib/types';
import { getBranchAccent } from '@/lib/branchAccent.ts';

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
    : '0 2px 8px -4px rgba(27,58,107,0.06)';
  const bg = accent ? accent.bg : '#fff';
  const cards = [
    { value: currentPoints, label: 'Puntos actuales', color: accent?.borderStrong ?? '#C5A059' },
    { value: nextMilestone ? pointsToNext : '—', label: 'Faltan para siguiente', color: '#001F3F' },
    { value: maxPoints, label: 'Meta de campaña', color: '#001F3F' },
  ];

  return (
    <div
      className="grid grid-cols-3 gap-2 sm:gap-3"
    >
      {cards.map((c) => (
        <div
          key={c.label}
          style={{
            background: bg,
            borderRadius: 12,
            border: borderStyle,
            padding: 12,
            boxShadow: shadow,
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
    </div>
  );
}
