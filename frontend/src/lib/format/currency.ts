import { currencyConfig } from './currencyConfig';

// Formatter instances created ONCE at module load and reused (performance requirement).
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

/** Bare number: "144,922.400" — designed print templates & chart axes/labels. */
export function formatNumber(value: unknown): string {
  return numberFormatter.format(toNumber(value));
}

/** Full monetary format: "144,922.400 KWD" — all app UI, HTML reports, non-designed PDF. */
export function formatCurrency(value: unknown): string {
  return `${numberFormatter.format(toNumber(value))} ${currencyConfig.code}`;
}

/** Whole number, no decimals: "144,922" — counts. */
export function formatInteger(value: unknown): string {
  return integerFormatter.format(Math.round(toNumber(value)));
}

// Cached formatter for the common default (1 fraction digit); other precisions build on demand.
const percentFormatter = new Intl.NumberFormat(currencyConfig.locale, {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

/** Percentage: "12.5%" (default 1 fraction digit). */
export function formatPercent(value: unknown, fractionDigits = 1): string {
  const formatter = fractionDigits === 1
    ? percentFormatter
    : new Intl.NumberFormat(currencyConfig.locale, {
        minimumFractionDigits: fractionDigits,
        maximumFractionDigits: fractionDigits,
      });
  return `${formatter.format(toNumber(value))}%`;
}

// Compact notation for chart AXIS ticks ONLY (e.g. "1.2K", "25K", "2.5M", "1.1B"). No currency suffix.
// Frontend-only (charts are frontend); intentionally not mirrored in the backend util.
const compactFormatter = new Intl.NumberFormat(currencyConfig.locale, {
  notation: 'compact',
  maximumFractionDigits: 1,
});

/** Compact number for chart axis ticks: "1.2K" / "25K" / "2.5M" / "1.1B". No "KWD". */
export function formatCompact(value: unknown): string {
  return compactFormatter.format(toNumber(value));
}
