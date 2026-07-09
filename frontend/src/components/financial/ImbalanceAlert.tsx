import { formatCurrency } from '../../lib/format';

interface Props { isBalanced?: boolean; difference?: number; }

export function ImbalanceAlert({ isBalanced, difference }: Props) {
  if (isBalanced !== false) return null;
  return (
    <div className="imbalance-alert" role="alert" aria-live="assertive">
      <span className="material-symbols-outlined imbalance-alert-icon" aria-hidden="true">warning</span>
      <div className="imbalance-alert-body">
        <strong className="imbalance-alert-title">ميزان المراجعة غير متوازن</strong>
        <span className="imbalance-alert-detail">
          الفرق بين المدين والدائن:{' '}
          <span className="imbalance-alert-value">{formatCurrency(difference)}</span>
        </span>
      </div>
    </div>
  );
}
