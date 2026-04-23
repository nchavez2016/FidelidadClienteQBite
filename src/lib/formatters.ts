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
  }
}

export function getTransactionLabelFull(type: TransactionType): string {
  switch (type) {
    case 'accumulation': return '🟢 Compra registrada';
    case 'redemption': return '🎁 Premio canjeado';
    case 'reversal': return '🔄 Reversión';
    case 'terms_acceptance': return '📋 Términos y condiciones aceptados';
  }
}
