import { formatCurrency } from '../../lib/format';
import { MoneyText } from '../../config/modules';
import { useT } from '../../lib/i18n';

interface Props { isBalanced?: boolean; difference?: number; }

export function ImbalanceAlert({ isBalanced, difference }: Props) {
  const { t } = useT();
  if (isBalanced !== false) return null;
  return (
    <div className="imbalance-alert" role="alert" aria-live="assertive">
      <span className="material-symbols-outlined imbalance-alert-icon" aria-hidden="true">warning</span>
      <div className="imbalance-alert-body">
        <strong className="imbalance-alert-title">{t('fc.imbalance.title')}</strong>
        <span className="imbalance-alert-detail">
          {t('fc.imbalance.diff_label')}{' '}
          <span className="imbalance-alert-value">{<MoneyText value={difference} />}</span>
        </span>
      </div>
    </div>
  );
}
