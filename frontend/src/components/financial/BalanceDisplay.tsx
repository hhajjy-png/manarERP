import type { ReactNode } from 'react';
import { formatNumber } from '../../lib/format';
import { useT } from '../../lib/i18n';

type NormalBalance = 'DEBIT' | 'CREDIT';

/**
 * Converts a net balance (positive = debit, negative = credit) to an absolute
 * amount with an Arabic side indicator. Never shows raw negative numbers.
 *
 * value > 0 → "X.XXX مدين"
 * value < 0 → "X.XXX دائن"
 * value = 0 → "0.000"
 */
export function formatBalance(
  value: number,
  showIndicator = true
): string {
  const abs    = Math.abs(value ?? 0);
  const fmtAbs = formatNumber(abs);
  if (!showIndicator || abs < 0.0005) return fmtAbs;
  const indicator = value > 0 ? 'مدين' : value < 0 ? 'دائن' : '';
  return indicator ? `${fmtAbs} ${indicator}` : fmtAbs;
}

interface Props {
  value:          number;
  normalBalance?: NormalBalance;
  showIndicator?: boolean;
  className?:     string;
}

/**
 * Renders a balance amount with an Arabic side indicator (مدين / دائن).
 * Input `value` is in net-debit convention: positive = debit, negative = credit.
 */
export function BalanceDisplay({ value, showIndicator = true, className }: Props): ReactNode {
  const { t } = useT();
  const abs = Math.abs(value ?? 0);

  if (abs < 0.0005) {
    return <span className={`balance-display balance-zero ${className ?? ''}`}>0.000</span>;
  }

  const fmtAbs    = formatNumber(abs);
  const side      = value > 0 ? 'debit' : 'credit';
  const indicator = value > 0 ? t('acc.balance.debit') : t('acc.balance.credit');

  return (
    <span className={`balance-display balance-${side} ${className ?? ''}`}>
      <span className="balance-amount">{fmtAbs}</span>
      {showIndicator && (
        <span className="balance-indicator">{indicator}</span>
      )}
    </span>
  );
}
