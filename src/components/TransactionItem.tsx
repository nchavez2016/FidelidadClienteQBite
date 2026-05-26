import { Transaction } from '@/lib/types';
import { formatDate, getTransactionLabel, formatPoints } from '@/lib/formatters';

interface TransactionItemProps {
  tx: Transaction;
  customerName?: string;
  showStaff?: boolean;
  showComment?: boolean;
  compact?: boolean;
}

export default function TransactionItem({ tx, customerName, showStaff, showComment, compact }: TransactionItemProps) {
  const baseLabel = getTransactionLabel(tx.type);
  const isBonus = tx.type === 'accumulation' && tx.bonusMultiplier && tx.bonusMultiplier > 1;
  const label = isBonus
    ? `🔥 Compra con Bonus x${tx.bonusMultiplier}${tx.bonusRuleLabel ? ` · ${tx.bonusRuleLabel}` : ''}`
    : baseLabel;
  const prefix = customerName ? `${customerName} — ` : '';
  const pointsClass = tx.points > 0 ? 'text-success' : tx.points < 0 ? 'text-destructive' : 'text-muted-foreground';

  // Etiqueta breve para identificar quién registró la transacción.
  const roleBadge = (() => {
    switch (tx.actorRole) {
      case 'admin':    return { text: 'ADM', title: 'Administrador', bg: 'rgba(197,160,89,0.18)', fg: '#8B6914', border: 'rgba(197,160,89,0.45)' };
      case 'cashier':  return { text: 'CAJ', title: 'Cajero',        bg: 'rgba(46,109,180,0.15)', fg: '#1B3A6B', border: 'rgba(46,109,180,0.4)' };
      case 'customer': return { text: 'CLI', title: 'Cliente',       bg: 'rgba(127,227,181,0.15)', fg: '#0f7a4f', border: 'rgba(127,227,181,0.4)' };
      default:         return null;
    }
  })();

  return (
    <div className={`flex items-center justify-between border-b last:border-0 ${compact ? 'py-1.5 text-sm' : 'py-2 text-sm'}`}>
      <div className="min-w-0">
        <p className={`font-medium ${compact ? 'text-xs' : ''} truncate flex items-center gap-1.5`}>
          {roleBadge && (
            <span
              title={roleBadge.title}
              className="inline-flex items-center font-bold leading-none rounded px-1 py-0.5 shrink-0"
              style={{
                fontSize: compact ? '8px' : '9px',
                letterSpacing: '0.04em',
                background: roleBadge.bg,
                color: roleBadge.fg,
                border: `1px solid ${roleBadge.border}`,
              }}
            >
              {roleBadge.text}
            </span>
          )}
          <span className="truncate">
            {prefix}{label}
            {tx.isReversed && ' (revertido)'}
            {tx.rewardName && !customerName && ` — ${tx.rewardName}`}
          </span>
        </p>
        <p className={`text-muted-foreground ${compact ? 'text-[10px]' : 'text-xs'}`}>
          {formatDate(tx.createdAt)}
          {showStaff && ` · ${tx.staffName}`}
          {showComment && tx.commentCategory && ` · ${tx.commentCategory}`}
        </p>
      </div>
      <span className={`font-bold shrink-0 ${pointsClass} ${compact ? 'text-xs' : ''}`}>
        {formatPoints(tx.points)}
      </span>
    </div>
  );
}
