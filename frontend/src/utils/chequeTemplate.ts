import { formatNumber } from '../lib/format';

export type FieldKey = 'beneficiary' | 'date' | 'tafqeet' | 'numeric';

export interface FieldConfig {
  top: number;
  left: number;
  width: number;
  fontSize: number;
  fontFamily: string;
  fontWeight: string;
  fontStyle: string;
  textAlign: 'left' | 'center' | 'right';
  color: string;
}

export type ChequeTemplate = Record<FieldKey, FieldConfig>;

/** Default positions extracted from the original hardcoded values in Cheques.tsx */
export const DEFAULT_TEMPLATE: ChequeTemplate = {
  beneficiary: {
    top: 29.8,
    left: 34.5,
    width: 38,
    fontSize: 11,
    fontFamily: 'Cairo',
    fontWeight: '600',
    fontStyle: 'normal',
    textAlign: 'left',
    color: '#000000',
  },
  date: {
    top: 24.3,
    left: 79.1,
    width: 23,
    fontSize: 10,
    fontFamily: 'Cairo',
    fontWeight: '600',
    fontStyle: 'normal',
    textAlign: 'center',
    color: '#000000',
  },
  tafqeet: {
    top: 39.1,
    left: 5.7,
    width: 72,
    fontSize: 10,
    fontFamily: 'Cairo',
    fontWeight: '600',
    fontStyle: 'normal',
    textAlign: 'right',
    color: '#000000',
  },
  numeric: {
    top: 45.8,
    left: 82.4,
    width: 18,
    fontSize: 11,
    fontFamily: 'monospace',
    fontWeight: '700',
    fontStyle: 'normal',
    textAlign: 'center',
    color: '#000000',
  },
};

export const FONT_FAMILIES = ['Cairo', 'Arial', 'Tahoma', 'Times New Roman', 'monospace'] as const;
export const FONT_SIZES = [8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18] as const;

export const FIELD_LABELS: Record<FieldKey, string> = {
  beneficiary: 'اسم المستفيد',
  date: 'التاريخ',
  tafqeet: 'التفقيط',
  numeric: 'المبلغ الرقمي',
};

// i18n keys for the SAME field labels, for on-screen calibrator UI consumers only
// (ChequeCalibrator.tsx, MeasurementAssistant.tsx). CalibrationTestSheet.tsx (the
// printed test sheet) keeps reading FIELD_LABELS directly — its output is out of
// localization scope and must stay exactly as-is.
export const FIELD_LABEL_KEYS: Record<FieldKey, string> = {
  beneficiary: 'field.cheque.beneficiary',
  date: 'col.date',
  tafqeet: 'lbl.cheque.tafqeet',
  numeric: 'lbl.cheque.numeric_amount',
};

export const FIELD_KEYS: FieldKey[] = ['beneficiary', 'date', 'tafqeet', 'numeric'];

// Stored bank-name values stay Arabic (matched against Settings rows keyed by bank name and
// sent to the backend as-is) — only the on-screen LABEL is localized via this lookup. Shared
// by Cheques.tsx and the calibrator UI (ChequeCalibrator.tsx) so both display the same
// English bank name.
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

export const SETTING_KEY_PREFIX = 'cheque.template.';

export function settingKey(bank: string): string {
  return `${SETTING_KEY_PREFIX}${bank}`;
}

/** Returns a deep clone of DEFAULT_TEMPLATE with no shared nested references. */
export function cloneDefaultTemplate(): ChequeTemplate {
  return {
    beneficiary: { ...DEFAULT_TEMPLATE.beneficiary },
    date: { ...DEFAULT_TEMPLATE.date },
    tafqeet: { ...DEFAULT_TEMPLATE.tafqeet },
    numeric: { ...DEFAULT_TEMPLATE.numeric },
  };
}

export function templateFromSettings(
  settings: { key: string; value: string }[],
  bank: string,
): ChequeTemplate {
  const row = settings.find((s) => s.key === settingKey(bank));
  if (!row) return cloneDefaultTemplate();
  try {
    const parsed = JSON.parse(row.value) as Partial<ChequeTemplate>;
    return {
      beneficiary: { ...DEFAULT_TEMPLATE.beneficiary, ...(parsed.beneficiary ?? {}) },
      date: { ...DEFAULT_TEMPLATE.date, ...(parsed.date ?? {}) },
      tafqeet: { ...DEFAULT_TEMPLATE.tafqeet, ...(parsed.tafqeet ?? {}) },
      numeric: { ...DEFAULT_TEMPLATE.numeric, ...(parsed.numeric ?? {}) },
    };
  } catch {
    return cloneDefaultTemplate();
  }
}

// ── Reliability pack: reprint reasons, version & print-log types ─────────────

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

/** i18n keys for the reprint-reason select (Cheques.tsx) and print-log reason display. */
export const REPRINT_REASON_KEYS: Record<ReprintReason, string> = {
  PAPER_JAM: 'reprint_reason.paper_jam',
  PRINTER_ISSUE: 'reprint_reason.printer_issue',
  CALIBRATION: 'reprint_reason.calibration',
  MISALIGNMENT: 'reprint_reason.misalignment',
  USER_REQUEST: 'reprint_reason.user_request',
  OTHER: 'reprint_reason.other',
};

/** A saved cheque calibration template version (server row). */
export interface ChequeTemplateVersionRow {
  id: number;
  bankName: string;
  version: number;
  template: string; // JSON snapshot
  note: string | null;
  createdById: number | null;
  createdByName: string | null;
  createdAt: string;
}

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

// ── Future-compatibility stubs (no UI wired yet) ─────────────────────────────

/**
 * A saved beneficiary entry for future autocomplete / master-list feature.
 * Store in settings under key 'cheque.beneficiaries' as JSON array.
 */
export interface BeneficiaryMaster {
  id: string;
  name: string;
  nameAr?: string;
  accountNumber?: string;
  bankName?: string;
  notes?: string;
}

/**
 * A named bank template binding a bank name to its saved field positions.
 * Extends the existing per-bank settings to support multiple named layouts
 * per bank (e.g. different cheque book sizes from the same bank).
 */
export interface BankTemplateProfile {
  id: string;
  bankName: string;
  profileName: string;
  template: ChequeTemplate;
  isDefault: boolean;
}

/**
 * Printer preference saved per bank — for future "saved printer" feature.
 * Would be stored in Electron userData and applied when printing cheques.
 */
export interface ChequePrinterPreference {
  bankName: string;
  printerName: string;
  /** When true, forces landscape orientation regardless of system default. */
  forceLandscape: boolean;
  /** Paper tray index (OS-specific). */
  trayIndex?: number;
}

// ── End future stubs ─────────────────────────────────────────────────────────

/**
 * The canonical printed cheque amount — the SINGLE formatter for every cheque
 * print surface (Classic `ChequePrintOutput` and the Designer Template runtime
 * alike), so the two providers can never drift.
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
