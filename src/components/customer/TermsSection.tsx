import { useState } from 'react';
import {
  Award,
  Coins,
  Zap,
  Gift,
  ArrowLeftRight,
  ChevronDown,
  ChevronUp,
  CheckCircle,
} from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import type { Campaign } from '@/lib/types';
import { DAY_LABELS } from '@/services/bonusRules.service';

interface TermsSectionProps {
  campaign: Campaign;
  hasAcceptedTerms: boolean;
  onAcceptTerms: (checked: boolean) => void;
  cardShadow: string;
}

export default function TermsSection({ campaign, hasAcceptedTerms, onAcceptTerms, cardShadow }: TermsSectionProps) {
  if (!campaign.termsAndConditions) return null;

  const [accepted, setAccepted] = useState(false);
  const [legalOpen, setLegalOpen] = useState(false);

  const activeBonus = campaign.bonusRules?.find((r) => r.active);
  const sortedMilestones = (campaign.milestones ?? [])
    .slice()
    .sort((a, b) => a.requiredPoints - b.requiredPoints);
  const nextMilestone = sortedMilestones[0];
  const minOrderAmount = campaign.minOrderAmount ?? 5;

  const cardBase: React.CSSProperties = {
    background: '#fff',
    border: '1px solid #e8edf3',
    borderRadius: 12,
    padding: 14,
  };

  return (
    <div
      className="overflow-hidden"
      style={{
        borderRadius: 16,
        border: hasAcceptedTerms ? '1px solid #e8edf3' : '2px solid #C9A84C',
        boxShadow: hasAcceptedTerms ? cardShadow : '0 4px 24px -6px rgba(201,168,76,0.18)',
        background: hasAcceptedTerms ? '#fff' : 'linear-gradient(135deg, #fffdf5 0%, #fff 100%)',
      }}
    >
      {/* Header */}
      <div className="flex items-start gap-3 px-4 pt-4 pb-3">
        <div
          className="w-10 h-10 rounded-full flex items-center justify-center shrink-0"
          style={{ background: 'rgba(201,168,76,0.15)' }}
        >
          <Award className="w-5 h-5" style={{ color: '#C9A84C' }} />
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="font-heading font-bold text-base leading-tight" style={{ color: '#1B3A6B' }}>
            {campaign.name}
          </h2>
          <p className="font-body text-[11px] mt-0.5" style={{ color: '#6b7a8c' }}>
            Antes de continuar, conoce cómo funciona
          </p>
        </div>
      </div>

      {/* Highlights grid */}
      <div className="px-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
        {/* Card A */}
        <div style={cardBase}>
          <div className="flex items-center gap-2 mb-1.5">
            <Coins className="w-4 h-4" style={{ color: '#C9A84C' }} />
            <h3 className="font-heading font-bold text-xs" style={{ color: '#1B3A6B' }}>
              Cómo ganar puntos
            </h3>
          </div>
          <p className="font-body text-[11px] leading-relaxed" style={{ color: '#4b5a6e' }}>
            1 punto por orden de ${minOrderAmount.toFixed(2)} USD o más. El monto no importa, cuenta la orden.
          </p>
        </div>

        {/* Card B */}
        {activeBonus && (
          <div style={cardBase}>
            <div className="flex items-center gap-2 mb-1.5">
              <Zap className="w-4 h-4" style={{ color: '#C9A84C' }} />
              <h3 className="font-heading font-bold text-xs" style={{ color: '#1B3A6B' }}>
                Puntos dobles
              </h3>
              {activeBonus.multiplier !== 2 && (
                <span
                  className="ml-auto text-[9px] font-bold px-1.5 py-0.5 rounded-full"
                  style={{ background: 'rgba(201,168,76,0.15)', color: '#b8860b' }}
                >
                  ×{activeBonus.multiplier} puntos
                </span>
              )}
            </div>
            <p className="font-body text-[11px] leading-relaxed" style={{ color: '#4b5a6e' }}>
              {activeBonus.days.map((d) => DAY_LABELS[d]).join(', ')} · {activeBonus.startTime}–{activeBonus.endTime}
            </p>
          </div>
        )}

        {/* Card C */}
        {nextMilestone && (
          <div style={cardBase}>
            <div className="flex items-center gap-2 mb-1.5">
              <Gift className="w-4 h-4" style={{ color: '#C9A84C' }} />
              <h3 className="font-heading font-bold text-xs" style={{ color: '#1B3A6B' }}>
                Tu próximo premio
              </h3>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-body text-[11px]" style={{ color: '#1B3A6B' }}>
                {nextMilestone.rewardName}
              </span>
              <span
                className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                style={{ background: 'rgba(201,168,76,0.12)', color: '#C9A84C' }}
              >
                {nextMilestone.requiredPoints} pts
              </span>
            </div>
            <p className="font-body text-[10px] mt-1.5" style={{ color: '#8a97a8' }}>
              Ver todos los premios disponibles más abajo ↓
            </p>
          </div>
        )}

        {/* Card D */}
        <div style={cardBase}>
          <div className="flex items-center gap-2 mb-1.5">
            <ArrowLeftRight className="w-4 h-4" style={{ color: '#C9A84C' }} />
            <h3 className="font-heading font-bold text-xs" style={{ color: '#1B3A6B' }}>
              Canje parcial
            </h3>
          </div>
          <p className="font-body text-[11px] leading-relaxed" style={{ color: '#4b5a6e' }}>
            Solo se descuentan los puntos del premio elegido. El resto queda en tu saldo.
          </p>
        </div>
      </div>

      {/* Accordion T&C */}
      <div className="px-4 pt-4">
        <button
          type="button"
          onClick={() => setLegalOpen((v) => !v)}
          className="w-full flex items-center gap-2 text-left px-3 py-2 rounded-lg transition-colors"
          style={{ background: '#f7f9fc', border: '1px solid #e8edf3', color: '#1B3A6B' }}
        >
          <span className="font-body font-semibold text-xs flex-1">
            Ver términos y condiciones completos
          </span>
          {legalOpen ? (
            <ChevronUp className="w-4 h-4" style={{ color: '#6b7a8c' }} />
          ) : (
            <ChevronDown className="w-4 h-4" style={{ color: '#6b7a8c' }} />
          )}
        </button>
        {legalOpen && (
          <div
            className="mt-2 rounded-lg p-3 overflow-y-auto"
            style={{ background: '#f7f9fc', border: '1px solid #e8edf3', maxHeight: 200 }}
          >
            <p className="text-xs text-muted-foreground whitespace-pre-line leading-relaxed font-body">
              {campaign.termsAndConditions}
            </p>
          </div>
        )}
      </div>

      {/* Acceptance */}
      <div className="px-4 pt-4 pb-4">
        {!hasAcceptedTerms ? (
          <div
            className="p-3.5 rounded-lg space-y-3"
            style={{ background: 'rgba(201,168,76,0.06)', border: '1.5px solid rgba(201,168,76,0.25)' }}
          >
            <div className="flex items-start gap-3">
              <Checkbox
                id="accept-terms"
                checked={accepted}
                onCheckedChange={(checked) => setAccepted(checked === true)}
                className="mt-0.5"
              />
              <label
                htmlFor="accept-terms"
                className="text-xs font-body leading-relaxed cursor-pointer"
                style={{ color: '#1B3A6B' }}
              >
                He leído y entendido el resumen del programa. Acepto los términos y condiciones.
              </label>
            </div>
            <button
              type="button"
              disabled={!accepted}
              onClick={() => onAcceptTerms(true)}
              className="w-full font-body font-bold text-xs text-white px-4 py-2.5 rounded-lg transition-all disabled:cursor-not-allowed"
              style={{
                background: accepted
                  ? 'linear-gradient(135deg, #2E6DB4 0%, #1B3A6B 100%)'
                  : '#cbd2db',
                opacity: accepted ? 1 : 0.6,
                boxShadow: accepted ? '0 4px 14px -4px rgba(46,109,180,0.45)' : 'none',
              }}
            >
              Participar en el programa
            </button>
          </div>
        ) : (
          <div
            className="flex items-center justify-center gap-2 text-xs font-body font-semibold py-2 rounded-lg"
            style={{ background: 'rgba(34,197,94,0.08)', color: '#16a34a', border: '1px solid rgba(34,197,94,0.2)' }}
          >
            <CheckCircle className="w-4 h-4" />
            Aceptado ✅
          </div>
        )}
      </div>
    </div>
  );
}
