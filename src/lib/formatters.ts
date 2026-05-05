import { TransactionType } from './types';

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('es-EC', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatPoints(points: number): string {
  if (points === 0) return '0';
  return points > 0 ? `+${points}` : `${points}`;
}

export function getTransactionLabel(type: TransactionType): string {
  switch (type) {
    case 'accumulation': return '🟢 Compra';
    case 'redemption': return '🎁 Canje';
    case 'reversal': return '🔄 Reversión';
    case 'terms_acceptance': return '📋 T&C aceptados';
    case 'redemption_request': return '⏳ Premio solicitado';
    case 'redemption_request_cancelled': return '↩️ Solicitud cancelada';
    case 'consent_revocation': return '🚫 Cuenta dada de baja';
  }
}

export function getTransactionLabelFull(type: TransactionType): string {
  switch (type) {
    case 'accumulation': return '🟢 Compra registrada';
    case 'redemption': return '🎁 Premio canjeado';
    case 'reversal': return '🔄 Reversión';
    case 'terms_acceptance': return '📋 Términos y condiciones aceptados';
    case 'redemption_request': return '⏳ Cliente solicitó un premio';
    case 'redemption_request_cancelled': return '↩️ Solicitud de canje cancelada';
    case 'consent_revocation': return '🚫 Consentimiento revocado · cuenta dada de baja';
  }
}
