/* ════════════════════════════════════════════════════════════════════════════
   Financial Center — presentation-only label & currency helpers.
   Pure display mapping: turns backend enum codes into Arabic labels and formats
   currency using the company's currency-display-language setting (so the Financial
   Center matches the rest of the app). No business/accounting logic — display only.
   ════════════════════════════════════════════════════════════════════════════ */
import { formatCurrency, formatMoneyCell, formatMoneyParts } from '../../lib/format';
import { currentCurrencyLanguage } from '../../stores/settingsStore';

/**
 * Currency for the Financial Center, honoring `finance.currencyDisplayLanguage`
 * (English "1,250.000 KWD" / Arabic "1,250.000 د.ك" — western digits always; the
 * setting selects the SYMBOL only) — mirrors the shared `money()`.
 */
export function fcCurrency(value: unknown): string {
  return formatCurrency(value, { language: currentCurrencyLanguage() });
}

/**
 * رمز العملة وحده — «KWD» أو «د.ك» بحسب الإعداد. يُوضع **مرّة واحدة في عنوان العمود**
 * (`مدين (KWD)`) بدل تكراره في كل خليّة.
 */
export function fcCurrencySymbol(): string {
  return formatMoneyParts(0, { language: currentCurrencyLanguage() }).currency;
}

/** عنوان عمود مالي: «مدين» ⇒ «مدين (KWD)». */
export function fcMoneyHeader(label: string): string {
  return `${label} (${fcCurrencySymbol()})`;
}

/**
 * خليّة مالية: الرقم وحده — «12,455.000» — بلا رمز (الرمز في العنوان).
 * الصفر قيمة (`0.000`)؛ و«—» لغير المنطبق وحده. تُصيَّر داخل `.money-cell` كي لا
 * يقلب اتجاه الواجهة العربية ترتيبَ الرقم.
 */
export function fcMoneyCell(value: unknown): string {
  return formatMoneyCell(value);
}

// ── Journal / statement reference type → Arabic (display only) ─────────────────
const REFERENCE_TYPE_AR: Record<string, string> = {
  INVOICE:          'فاتورة مبيعات',
  PURCHASE_INVOICE: 'فاتورة مشتريات',
  PURCHASE:         'مشتريات',
  PAYMENT:          'تحصيل',
  PURCHASE_PAYMENT: 'سداد مورد',
  EXPENSE:          'مصروف',
  PAYROLL:          'رواتب',
  GOODS_RECEIPT:    'استلام بضاعة',
  MATERIAL_ISSUE:   'صرف مواد',
  MANUAL:           'قيد يدوي',
};

/**
 * Arabic label for a reference type. Unknown codes fall back to the raw value
 * (never throws / never blanks), and `*_REVERSAL` codes render as "…(عكس)".
 */
export function referenceTypeAr(type: string | null | undefined): string {
  if (!type) return '';
  const direct = REFERENCE_TYPE_AR[type];
  if (direct) return direct;
  if (type.endsWith('_REVERSAL')) {
    const base = type.slice(0, -'_REVERSAL'.length);
    return `${referenceTypeAr(base)} (عكس)`;
  }
  return type;
}

// ── Account type → Arabic (display only) — matches the app-wide COA wording ─────
const ACCOUNT_TYPE_AR: Record<string, string> = {
  ASSET:     'أصول',
  LIABILITY: 'التزامات',
  EQUITY:    'حقوق ملكية',
  REVENUE:   'إيرادات',
  EXPENSE:   'مصروفات',
};

export function accountTypeAr(type: string | null | undefined): string {
  if (!type) return '';
  return ACCOUNT_TYPE_AR[type] ?? type;
}

// ── Journal status → Arabic (display only) — matches the FC status filter copy ──
const JOURNAL_STATUS_AR: Record<string, string> = {
  POSTED:    'مرحّل',
  DRAFT:     'مسودة',
  CANCELLED: 'ملغى',
};

export function journalStatusAr(status: string | null | undefined): string {
  if (!status) return '';
  return JOURNAL_STATUS_AR[status] ?? status;
}
