import { formatCurrency } from '../../lib/format';

interface Props { isBalanced?: boolean; difference?: number; }

export function ImbalanceAlert({ isBalanced, difference }: Props) {
  if (isBalanced !== false) return null;
  return (
    <div className="imbalance-alert" role="alert" aria-live="assertive">
      ⚠️ ميزان المراجعة غير متوازن — الفرق: {formatCurrency(difference)}
    </div>
  );
}
