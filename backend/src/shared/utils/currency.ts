import { currencyConfig } from '../config/currencyConfig';

const numberFormatter = new Intl.NumberFormat(currencyConfig.locale, {
  minimumFractionDigits: 3,
  maximumFractionDigits: 3,
});
const integerFormatter = new Intl.NumberFormat(currencyConfig.locale, {
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

function toNumber(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
}

/** Bare number: "144,922.400". */
export function formatNumber(value: unknown): string {
  return numberFormatter.format(toNumber(value));
}

/** Full monetary format: "144,922.400 KWD". */
export function formatCurrency(value: unknown): string {
  return `${numberFormatter.format(toNumber(value))} ${currencyConfig.code}`;
}

/**
 * خليّة مالية في تقرير **مرئي** (HTML / PDF): الرقم وحده — «12,455.000» — بلا رمز،
 * لأن الرمز يقع مرّة واحدة في **عنوان العمود** («المبلغ (KWD)»).
 *
 * الصفر قيمة («0.000»)، و«—» لغير المنطبق وحده أو لقيمة غير رقمية — فعرض `NaN` على
 * محاسب أسوأ من عرض لا شيء. مرآة سلوكية لـ `frontend/src/lib/format/currency.ts`.
 *
 * **لا تُستعمل في Excel**: هناك تبقى الخليّة رقمًا خامًا مع `numFmt` — عقد لا يُمسّ.
 */
export const MONEY_CELL_EMPTY = '—';

export function formatMoneyCell(value: unknown): string {
  if (value === null || value === undefined || value === '') return MONEY_CELL_EMPTY;
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return MONEY_CELL_EMPTY;
  return numberFormatter.format(n === 0 ? 0 : n);   // -0 لا يُطبع «-0.000»
}

/** عنوان عمود مالي: «المبلغ» ⇒ «المبلغ (KWD)». */
export function moneyHeader(label: string): string {
  return `${label} (${currencyConfig.code})`;
}

/** Whole number: "144,922". */
export function formatInteger(value: unknown): string {
  return integerFormatter.format(Math.round(toNumber(value)));
}

// Percent formatters memoized by fraction-digit count (reused across calls).
const percentFormatters = new Map<number, Intl.NumberFormat>();
function percentFormatter(fractionDigits: number): Intl.NumberFormat {
  let formatter = percentFormatters.get(fractionDigits);
  if (!formatter) {
    formatter = new Intl.NumberFormat(currencyConfig.locale, {
      minimumFractionDigits: fractionDigits,
      maximumFractionDigits: fractionDigits,
    });
    percentFormatters.set(fractionDigits, formatter);
  }
  return formatter;
}

/** Percentage: "12.5%". */
export function formatPercent(value: unknown, fractionDigits = 1): string {
  return `${percentFormatter(fractionDigits).format(toNumber(value))}%`;
}
