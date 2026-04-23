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
  const label = getTransactionLabel(tx.type);
  const prefix = customerName ? `${customerName} — ` : '';

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
      <span className={`font-bold shrink-0 ${tx.points > 0 ? 'text-success' : 'text-destructive'} ${compact ? 'text-xs' : ''}`}>
        {formatPoints(tx.points)}
      </span>
    </div>
  );
}
