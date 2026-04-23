import { ArrowRight, CheckCircle, Clock, ShieldAlert } from 'lucide-react';
import { motion } from 'framer-motion';
import { Checkbox } from '@/components/ui/checkbox';
import type { Campaign } from '@/lib/types';

interface TermsSectionProps {
  campaign: Campaign;
  hasAcceptedTerms: boolean;
  onAcceptTerms: (checked: boolean) => void;
  cardShadow: string;
}

export default function TermsSection({ campaign, hasAcceptedTerms, onAcceptTerms, cardShadow }: TermsSectionProps) {
  if (!campaign.termsAndConditions) return null;

  return (
    <motion.div
      className="overflow-hidden"
      style={{
        borderRadius: 16,
        border: hasAcceptedTerms ? '1px solid #e8edf3' : '2px solid #C9A84C',
        boxShadow: hasAcceptedTerms ? cardShadow : '0 4px 24px -6px rgba(201,168,76,0.18)',
        background: hasAcceptedTerms ? '#fff' : 'linear-gradient(135deg, #fffdf5 0%, #fff 100%)',
      }}
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.38 }}
    >
      {!hasAcceptedTerms && (
        <motion.div
          className="flex items-center gap-3 px-4 py-3"
          style={{ background: 'linear-gradient(135deg, rgba(201,168,76,0.12) 0%, rgba(201,168,76,0.04) 100%)', borderBottom: '1px solid rgba(201,168,76,0.2)' }}
          animate={{ opacity: [0.85, 1, 0.85] }}
          transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut' }}
        >
          <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0" style={{ background: 'rgba(201,168,76,0.15)' }}>
            <ShieldAlert className="w-4 h-4" style={{ color: '#b8860b' }} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-body font-semibold text-xs" style={{ color: '#8B6914' }}>📋 Lectura pendiente</p>
            <p className="font-body text-[10px] mt-0.5" style={{ color: '#a07d1c' }}>Revisa y acepta los términos para participar en la campaña.</p>
          </div>
        </motion.div>
      )}

      <details className="group" open={!hasAcceptedTerms}>
        <summary className="flex items-center gap-2 p-4 cursor-pointer list-none select-none">
          <ArrowRight className="w-4 h-4 transition-transform group-open:rotate-90" style={{ color: hasAcceptedTerms ? '#2E6DB4' : '#C9A84C' }} />
          <span className="font-heading font-bold text-sm" style={{ color: '#1B3A6B' }}>Términos y Condiciones</span>
          {hasAcceptedTerms ? (
            <span className="ml-auto inline-flex items-center gap-1 text-[10px] font-body font-semibold px-2.5 py-1 rounded-full" style={{ background: 'rgba(34,197,94,0.1)', color: '#16a34a' }}>
              <CheckCircle className="w-3 h-3" /> Aceptado ✅
            </span>
          ) : (
            <span className="ml-auto inline-flex items-center gap-1 text-[10px] font-body font-semibold px-2.5 py-1 rounded-full" style={{ background: 'rgba(201,168,76,0.12)', color: '#b8860b', border: '1px solid rgba(201,168,76,0.3)' }}>
              <Clock className="w-3 h-3" /> Pendiente
            </span>
          )}
        </summary>
        <div className="px-4 pb-4 space-y-3">
          <div className="rounded-lg p-3 max-h-48 overflow-y-auto" style={{ background: '#f7f9fc', border: '1px solid #e8edf3' }}>
            <p className="text-xs text-muted-foreground whitespace-pre-line leading-relaxed font-body">{campaign.termsAndConditions}</p>
          </div>
          {!hasAcceptedTerms && (
            <div className="flex items-start gap-3 p-3.5 rounded-lg" style={{ background: 'rgba(201,168,76,0.06)', border: '1.5px solid rgba(201,168,76,0.25)' }}>
              <Checkbox id="accept-terms" onCheckedChange={(checked) => onAcceptTerms(checked === true)} className="mt-0.5" />
              <label htmlFor="accept-terms" className="text-xs font-body leading-relaxed cursor-pointer" style={{ color: '#1B3A6B' }}>
                He leído y acepto los <strong>Términos y Condiciones</strong> de la campaña <strong>{campaign.name}</strong>.
              </label>
            </div>
          )}
        </div>
      </details>
    </motion.div>
  );
}
