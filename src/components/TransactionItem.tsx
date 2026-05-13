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

  return (
    <div className={`flex items-center justify-between border-b last:border-0 ${compact ? 'py-1.5 text-sm' : 'py-2 text-sm'}`}>
      <div className="min-w-0">
        <p className={`font-medium ${compact ? 'text-xs' : ''} truncate`}>
          {prefix}{label}
          {tx.isReversed && ' (revertido)'}
          {tx.rewardName && !customerName && ` — ${tx.rewardName}`}
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
