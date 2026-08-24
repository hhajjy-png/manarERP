import { formatNumber } from '../lib/format';

/**
 * Shared cheque helpers — bank display names, reprint vocabulary, print-log
 * types, and the canonical printed cheque amount.
 *
 * ── Scope after "Keep Gulf Bank Template Only" ─────────────────────────────
 * This file used to also carry the CLASSIC cheque template model: `ChequeTemplate`
 * / `FieldConfig`, `DEFAULT_TEMPLATE`, the per-bank `cheque.template.<bank>`
 * settings-key helpers, the calibrator's field/font/label vocabularies, and some
 * never-wired future stubs. Classic was one of several cheque print templates;
 * the system now prints exactly one approved template — «قالب شيك الخليج» — so
 * every one of those exports lost its last consumer along with the Classic
 * calibrator and was removed rather than left as dead code.
 *
 * The historical Classic templates themselves are NOT touched: their
 * `cheque.template.<bank>` rows stay in the database, as do the cheque template
 * versions. Nothing here reads or writes them any more.
 *
 * What remains is genuinely shared by the surviving cheque surfaces.
 */

// Stored bank-name values stay Arabic (they are what the server sends on a cheque
// record) — only the on-screen LABEL is localized via this lookup, so the cheque
// table, the cheque drawer and the Excel export all display the same name.
export const BANK_NAME_KEYS: Record<string, string> = {
  'بنك الكويت الوطني': 'bank.name.nbk',
  'بيت التمويل الكويتي': 'bank.name.kfh',
  'بنك الخليج': 'bank.name.gulf',
  'البنك التجاري الكويتي': 'bank.name.cbk',
  'بنك برقان': 'bank.name.burgan',
  'بنك بوبيان': 'bank.name.boubyan',
  'بنك وربة': 'bank.name.warba',
  'البنك الأهلي الكويتي': 'bank.name.abk',
  'البنك الأهلي المتحد': 'bank.name.ahli_united',
  'بنك الكويت الدولي': 'bank.name.kib',
};

export function bankLabel(bank: string, t: (k: string) => string): string {
  const key = BANK_NAME_KEYS[bank];
  return key ? t(key) : bank;
}

// ── Reprint reasons, version & print-log types ───────────────────────────────

/** Reprint reason keys — must match backend REPRINT_REASONS in cheques.schema.ts. */
export const REPRINT_REASONS = [
  'PAPER_JAM',
  'PRINTER_ISSUE',
  'CALIBRATION',
  'MISALIGNMENT',
  'USER_REQUEST',
  'OTHER',
] as const;

export type ReprintReason = (typeof REPRINT_REASONS)[number];

export const REPRINT_REASON_LABELS: Record<ReprintReason, string> = {
  PAPER_JAM: 'انحشار الورق',
  PRINTER_ISSUE: 'مشكلة في الطابعة',
  CALIBRATION: 'ضبط المعايرة',
  MISALIGNMENT: 'عدم تطابق المحاذاة',
  USER_REQUEST: 'طلب المستخدم',
  OTHER: 'أخرى',
};

/** i18n keys for the reprint-reason select and the print-log reason display. */
export const REPRINT_REASON_KEYS: Record<ReprintReason, string> = {
  PAPER_JAM: 'reprint_reason.paper_jam',
  PRINTER_ISSUE: 'reprint_reason.printer_issue',
  CALIBRATION: 'reprint_reason.calibration',
  MISALIGNMENT: 'reprint_reason.misalignment',
  USER_REQUEST: 'reprint_reason.user_request',
  OTHER: 'reprint_reason.other',
};

/** A cheque print/reprint log row (server row). */
export interface ChequePrintLogRow {
  id: number;
  chequeId: number;
  sequence: number;
  reason: string | null;
  note: string | null;
  printedById: number | null;
  printedByName: string | null;
  printedAt: string;
}

/**
 * The canonical printed cheque amount — the SINGLE formatter for every cheque
 * print surface, so no two surfaces can ever drift.
 *
 * Invariant, always, with no exceptions:
 *   #<thousands-separated integer part>.<exactly 3 decimals>#
 *
 *   1370     → #1,370.000#      5550     → #5,550.000#
 *   1370.000 → #1,370.000#      5550.250 → #5,550.250#
 *   90       → #90.000#         0        → #0.000#
 *   999.9999 → #1,000.000#      0.001    → #0.001#
 *
 * Two earlier defects are closed here:
 *   1. the fils-suppression branch, which printed `#1,370#` for a whole-dinar
 *      cheque and so violated the bank's 3-decimal cheque format;
 *   2. a rounding-basis disagreement — the fils test used `Math.round` while the
 *      integer branch used `Math.floor`, so `999.9999` printed as `#999#`
 *      (a one-dinar understatement on a live financial instrument).
 * Both are fixed by rounding ONCE, to fils, and formatting that single value.
 *
 * PRESENTATION ONLY. This never touches a stored amount, the KWD 3-decimal
 * accounting policy, GL postings, or API monetary semantics — and the tafqeet
 * (`amountToWordsKWD`) is a SIBLING consumer of the same raw numeric amount, so
 * it is unaffected by anything here.
 */
export function fmtChequeAmount(amount: number): string {
  // Round once, to fils — one consistent basis for the whole format.
  // `formatNumber` pins exactly 3 decimals, adds thousands separators, and
  // collapses -0, so a non-finite input degrades to `#0.000#` rather than `#NaN#`.
  return `#${formatNumber(Math.round(amount * 1000) / 1000)}#`;
}
