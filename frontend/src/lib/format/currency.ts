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

// Monetary number formatters per display language (built once).
//
// WESTERN DIGITS, ALWAYS (approved standard). Both languages format the NUMBER
// identically — `en-US` digits and separators: `12,455.000`. What the setting
// `finance.currencyDisplayLanguage` still selects is the CURRENCY SYMBOL only:
// English "KWD" · Arabic "د.ك".
//
// This deliberately supersedes the earlier Arabic-Indic behaviour
// (`ar-KW-u-nu-arab` → `١٢٬٤٥٥٫٠٠٠`): a single numeric shape must hold across the
// UI, the reports, the print output and the exports, so a figure never changes
// appearance depending on where it is read. The stored value, the setting itself
// and every API/DB contract are untouched — this is presentation only.
const currencyNumberFormatters: Record<CurrencyLanguage, Intl.NumberFormat> = {
  english: numberFormatter,
  arabic: numberFormatter,
};
const currencySuffix: Record<CurrencyLanguage, string> = {
  english: currencyConfig.code, // 'KWD'
  arabic: 'د.ك',
};

function toNumber(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return 0;
  // JavaScript's negative zero would render as "-0.000" — a minus sign on nothing,
  // which an accountant reads as a real credit. Collapse -0 to 0; every other value
  // passes through untouched. Presentation only: no stored value changes.
  return n === 0 ? 0 : n;
}

/** Bare number: "144,922.400" — designed print templates & chart axes/labels. */
export function formatNumber(value: unknown): string {
  return numberFormatter.format(toNumber(value));
}

/**
 * Full monetary format — a PURE function of its arguments (deterministic; no hidden state):
 *   English: "144,922.400 KWD"   ·   Arabic: "144,922.400 د.ك"
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

/**
 * A monetary TABLE CELL: the number alone — `12,455.000` — with **no currency
 * symbol**. The symbol belongs once in the column header (`المبلغ (KWD)`), not
 * repeated in every cell.
 *
 * Zero is a real value, not emptiness: `0` → `0.000`. Only a genuinely
 * not-applicable cell renders the em dash — `null`, `undefined`, `''` — and so does
 * a value that is not a finite number (`NaN`, `Infinity`, unparsable text), because
 * showing `NaN` to an accountant is worse than showing nothing. This does **not**
 * hide a real bug: the fallback is visible, and the tests pin it.
 */
export const MONEY_CELL_EMPTY = '—';

export function formatMoneyCell(value: unknown): string {
  if (value === null || value === undefined || value === '') return MONEY_CELL_EMPTY;
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return MONEY_CELL_EMPTY;
  return numberFormatter.format(n === 0 ? 0 : n);   // -0 لا يُطبع «-0.000»
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
 * The single gateway for a report table cell — screen and print alike.
 *
 * `symbol` decides where the currency lives:
 *   · `'inline'` (default) — "144,922.400 KWD" in every cell. **This is the print
 *     contract**: `ReportPrint.tsx` renders the printed report and is out of scope for
 *     the on-screen standardization, so its output must not shift by a single glyph.
 *   · `'header'` — "144,922.400" alone, because the screen table now carries the symbol
 *     once in the column header. Callers that pass this MUST add `(KWD)` to the header.
 *
 * Non-currency numeric cells render plain (0–3 decimals); empty/null → "".
 */
export function formatReportCell(
  value: unknown,
  col: { format?: 'currency' },
  opts?: { language?: CurrencyLanguage; symbol?: 'inline' | 'header' },
): string {
  if (value == null || value === '') return '';
  if (col.format === 'currency') {
    return opts?.symbol === 'header' ? formatMoneyCell(value) : formatCurrency(value, opts);
  }
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
