/* ════════════════════════════════════════════════════════════════════════════
   Financial Center — presentation-only label & currency helpers.
   Pure display mapping: turns backend enum codes into localized labels and formats
   currency using the company's currency-display-language setting (so the Financial
   Center matches the rest of the app). No business/accounting logic — display only.
   ════════════════════════════════════════════════════════════════════════════ */
import { formatCurrency, formatMoneyCell, formatMoneyParts } from '../../lib/format';
import { currentCurrencyLanguage } from '../../stores/settingsStore';

/** A translator function, matching the shape returned by `useT()`. */
type Translator = (key: string) => string;

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

// ── Journal / statement reference type → i18n key (display only) ──────────────
const REFERENCE_TYPE_KEY: Record<string, string> = {
  INVOICE:          'fc.ref.sales_invoice',
  PURCHASE_INVOICE: 'fc.ref.purchase_invoice',
  PURCHASE:         'cat.purchases',
  PAYMENT:          'modal.collect_payment',
  PURCHASE_PAYMENT: 'fc.ref.supplier_payment',
  EXPENSE:          'ops.pending.expense_unit',
  PAYROLL:          'cat.salaries',
  GOODS_RECEIPT:    'fc.ref.goods_receipt',
  MATERIAL_ISSUE:   'fc.ref.material_issue',
  MANUAL:           'fc.ref.manual_entry',
};

/**
 * Localized label for a reference type. Unknown codes fall back to the raw value
 * (never throws / never blanks), and `*_REVERSAL` codes render with a "(Reversal)"
 * suffix.
 */
export function referenceTypeLabel(type: string | null | undefined, t: Translator): string {
  if (!type) return '';
  const key = REFERENCE_TYPE_KEY[type];
  if (key) return t(key);
  if (type.endsWith('_REVERSAL')) {
    const base = type.slice(0, -'_REVERSAL'.length);
    return `${referenceTypeLabel(base, t)} ${t('fc.ref.reversal_suffix')}`;
  }
  return type;
}

// ── Account type → i18n key (display only) — matches the app-wide COA wording ──
const ACCOUNT_TYPE_KEY: Record<string, string> = {
  ASSET:     'acc.type.asset',
  LIABILITY: 'acc.type.liability',
  EQUITY:    'acc.type.equity',
  REVENUE:   'acc.type.revenue',
  EXPENSE:   'acc.type.expense',
};

export function accountTypeLabel(type: string | null | undefined, t: Translator): string {
  if (!type) return '';
  const key = ACCOUNT_TYPE_KEY[type];
  return key ? t(key) : type;
}

// ── Journal status → i18n key (display only) — matches the FC status filter copy ──
const JOURNAL_STATUS_KEY: Record<string, string> = {
  POSTED:    'acc.journal.posted',
  DRAFT:     'acc.journal.draft',
  CANCELLED: 'acc.journal.cancelled',
};

export function journalStatusLabel(status: string | null | undefined, t: Translator): string {
  if (!status) return '';
  const key = JOURNAL_STATUS_KEY[status];
  return key ? t(key) : status;
}
