/**
 * Bonus rules engine.
 *
 * Evalúa si en un instante dado aplica alguna regla de bonificación
 * configurada en la campaña. Devuelve el multiplicador resultante.
 *
 * Reglas:
 *  - Si varias reglas coinciden, gana la de mayor multiplicador.
 *  - Sin reglas o ninguna activa => x1 (acumulación normal).
 *  - Las horas se interpretan en hora local del navegador.
 */
import { BonusRule, Campaign } from '@/lib/types';

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(n => parseInt(n, 10));
  return (h || 0) * 60 + (m || 0);
}

export function isRuleActiveAt(rule: BonusRule, when: Date = new Date()): boolean {
  if (!rule.active) return false;
  if (!Array.isArray(rule.days) || rule.days.length === 0) return false;
  if (!rule.days.includes(when.getDay())) return false;
  const minutes = when.getHours() * 60 + when.getMinutes();
  const start = toMinutes(rule.startTime);
  const end = toMinutes(rule.endTime);
  if (Number.isNaN(start) || Number.isNaN(end) || end <= start) return false;
  return minutes >= start && minutes < end;
}

export interface BonusEvaluation {
  multiplier: number;
  rule?: BonusRule;
}

export function evaluateBonus(
  campaign: Campaign | undefined,
  when: Date = new Date(),
): BonusEvaluation {
  if (!campaign?.bonusRules?.length) return { multiplier: 1 };
  const matches = campaign.bonusRules
    .filter(r => isRuleActiveAt(r, when))
    .sort((a, b) => b.multiplier - a.multiplier);
  if (matches.length === 0) return { multiplier: 1 };
  return { multiplier: matches[0].multiplier, rule: matches[0] };
}

export const DAY_LABELS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
export const DAY_LABELS_LONG = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
