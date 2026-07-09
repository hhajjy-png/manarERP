import { currencyConfig } from './currencyConfig';
import { CurrencyLanguage } from './currencyLanguage';

// Formatter instances created ONCE at module load and reused (performance requirement).
const numberFormatter = new Intl.NumberFormat(currencyConfig.locale, {
  minimumFractionDigits: 3,
  maximumFractionDigits: 3,
});
const integerFormatter = new Intl.NumberFormat(currencyConfig.locale, {
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

// Monetary number formatters per display language (built once). English keeps the
// existing en-US digits/separators; Arabic uses Arabic-Indic digits + separators.
// The suffix follows: English "KWD", Arabic "د.ك". Exactly 3 decimals in both.
const currencyNumberFormatters: Record<CurrencyLanguage, Intl.NumberFormat> = {
  english: numberFormatter,
  arabic: new Intl.NumberFormat('ar-KW-u-nu-arab', {
    minimumFractionDigits: 3,
    maximumFractionDigits: 3,
  }),
};
const currencySuffix: Record<CurrencyLanguage, string> = {
  english: currencyConfig.code, // 'KWD'
  arabic: 'د.ك',
};

function toNumber(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
}

/** Bare number: "144,922.400" — designed print templates & chart axes/labels. */
export function formatNumber(value: unknown): string {
  return numberFormatter.format(toNumber(value));
}

/**
 * Full monetary format — a PURE function of its arguments (deterministic; no hidden state):
 *   English: "144,922.400 KWD"   ·   Arabic: "١٤٤٬٩٢٢٫٤٠٠ د.ك"
 * Exactly 3 decimals, KWD currency. `language` defaults SAFELY to English when omitted.
 * The active company setting is resolved at app-level entry points (money / report cells)
 * and passed in explicitly — this module holds no mutable currency-language state.
 */
export function formatCurrency(value: unknown, opts?: { language?: CurrencyLanguage }): string {
  const language = opts?.language ?? 'english';
  return `${currencyNumberFormatters[language].format(toNumber(value))} ${currencySuffix[language]}`;
}

/**
 * The same monetary value split into its number and currency-label parts (e.g.
 * `{ number: "17,097.620", currency: "KWD" }`). Lets a UI render the currency label
 * inline beside the amount as a distinct element without losing the exact 3-decimal
 * formatting or the active display language (English "KWD" / Arabic "د.ك"). Combining
 * `${number} ${currency}` reproduces `formatCurrency` exactly.
 */
export function formatMoneyParts(
  value: unknown,
  opts?: { language?: CurrencyLanguage },
): { number: string; currency: string } {
  const language = opts?.language ?? 'english';
  return {
    number: currencyNumberFormatters[language].format(toNumber(value)),
    currency: currencySuffix[language],
  };
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
export function formatReportCell(value: unknown, col: { format?: 'currency' }, opts?: { language?: CurrencyLanguage }): string {
  if (value == null || value === '') return '';
  if (col.format === 'currency') return formatCurrency(value, opts);
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
