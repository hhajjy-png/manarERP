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

/** Whole number: "144,922". */
export function formatInteger(value: unknown): string {
  return integerFormatter.format(Math.round(toNumber(value)));
}

// Cached formatter for the common default (1 fraction digit); other precisions build on demand.
const percentFormatter = new Intl.NumberFormat(currencyConfig.locale, {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

/** Percentage: "12.5%". */
export function formatPercent(value: unknown, fractionDigits = 1): string {
  const formatter = fractionDigits === 1
    ? percentFormatter
    : new Intl.NumberFormat(currencyConfig.locale, {
        minimumFractionDigits: fractionDigits,
        maximumFractionDigits: fractionDigits,
      });
  return `${formatter.format(toNumber(value))}%`;
}
