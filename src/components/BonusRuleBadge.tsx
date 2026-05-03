import { Flame } from 'lucide-react';
import type { Campaign } from '@/lib/types';
import { evaluateBonus, DAY_LABELS } from '@/services/bonusRules.service';

interface Props {
  campaign: Campaign | undefined;
  /** Compacto: solo el chip cuando hay bonus activo. */
  variant?: 'chip' | 'card';
}

/**
 * Muestra el bonus activo (si lo hay) y el listado de reglas próximas.
 * Visible para cliente y staff: refuerza la urgencia sin alterar la marca.
 */
export default function BonusRuleBadge({ campaign, variant = 'chip' }: Props) {
  if (!campaign?.bonusRules?.length) return null;
  const active = campaign.bonusRules.filter(r => r.active);
  if (active.length === 0) return null;
  const evalResult = evaluateBonus(campaign);

  if (variant === 'chip') {
    if (evalResult.multiplier <= 1) return null;
    return (
      <span
        className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full"
        style={{
          background: 'linear-gradient(135deg, rgba(245,158,11,0.15), rgba(220,38,38,0.12))',
          color: '#b45309',
          border: '1px solid rgba(245,158,11,0.5)',
        }}
        title={evalResult.rule?.label}
      >
        <Flame className="w-3 h-3" />
        Bonus x{evalResult.multiplier} activo
      </span>
    );
  }

  return (
    <div
      className="rounded-lg p-2.5"
      style={{
        background: 'linear-gradient(135deg, rgba(245,158,11,0.08), rgba(197,160,89,0.08))',
        border: '1px solid rgba(245,158,11,0.25)',
      }}
    >
      <div className="flex items-center gap-1.5 mb-1.5">
        <Flame className="w-3.5 h-3.5" style={{ color: '#d97706' }} />
        <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: '#92400e' }}>
          {evalResult.multiplier > 1 ? `🔥 ¡Bonus x${evalResult.multiplier} activo ahora!` : 'Bonus de puntos'}
        </span>
      </div>
      <ul className="space-y-1">
        {active.map(r => {
          const isNow = evalResult.rule?.id === r.id;
          return (
            <li
              key={r.id}
              className="text-[11px] flex items-center justify-between gap-2"
              style={{ color: isNow ? '#92400e' : '#6b7a8c', fontWeight: isNow ? 600 : 400 }}
            >
              <span className="truncate">
                {r.label || `Bonus x${r.multiplier}`} · {r.days.map(d => DAY_LABELS[d]).join(', ')} · {r.startTime}-{r.endTime}
              </span>
              <span
                className="shrink-0 text-[9px] font-bold px-1.5 py-0.5 rounded-full"
                style={{
                  background: isNow ? 'rgba(217,119,6,0.18)' : 'rgba(0,0,0,0.04)',
                  color: isNow ? '#b45309' : '#6b7a8c',
                }}
              >
                x{r.multiplier}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
