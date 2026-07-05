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

// Percent formatters memoized by fraction-digit count (reused across calls/renders).
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

/** Percentage: "12.5%" (default 1 fraction digit). */
export function formatPercent(value: unknown, fractionDigits = 1): string {
  return `${percentFormatter(fractionDigits).format(toNumber(value))}%`;
}

// Report/print table cells: 0–3 decimals, no forced trailing zeros (for non-currency numeric columns).
const reportCellNumberFormatter = new Intl.NumberFormat(currencyConfig.locale, {
  minimumFractionDigits: 0,
  maximumFractionDigits: 3,
});

/**
 * Format a report/print table cell: money columns (`format:'currency'`) render "144,922.400 KWD";
 * other numeric cells render plain en-US (0–3 decimals); empty/null → "".
 * Shared by Reports.tsx and ReportPrint.tsx so the currency-column convention lives in one place.
 */
export function formatReportCell(value: unknown, col: { format?: 'currency' }): string {
  if (value == null || value === '') return '';
  if (col.format === 'currency') return formatCurrency(value);
  if (typeof value === 'number') return reportCellNumberFormatter.format(value);
  return String(value);
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
