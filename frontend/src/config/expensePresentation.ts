// ─────────────────────────────────────────────────────────────────────────
//  Expenses — presentation-only status & payment-method labels (Single SoT).
//  Consolidates the status meta (label i18n key + tone + icon) and payment-method
//  Arabic labels that were previously duplicated across the Expenses page, the
//  force-delete modal, and the fast-entry dialog.
//
//  ⚠️ Codes (value) MUST match ENUMS.expenseStatus / expensePaymentMethod in
//     backend/src/config/constants.ts. Arabic is presentation only — never sent
//     to the API. Category labels live in ./expenseCategories (their own SoT).
// ─────────────────────────────────────────────────────────────────────────

export type ExpenseTone = 'neutral' | 'green' | 'red' | 'orange' | 'blue' | 'indigo';

export interface ExpenseStatusMeta {
  /** i18n key resolved via useT() — the primary display path. */
  key: string;
  tone: ExpenseTone;
  icon: string;
  /** Direct Arabic label — for non-i18n consumers (e.g. delete-preview modal). */
  ar: string;
}

export const EXPENSE_STATUS_META: Record<string, ExpenseStatusMeta> = {
  PENDING:   { key: 'exp.status.pending',   tone: 'orange',  icon: 'schedule',     ar: 'معلّق' },
  APPROVED:  { key: 'exp.status.approved',  tone: 'green',   icon: 'check_circle', ar: 'معتمد' },
  REJECTED:  { key: 'exp.status.rejected',  tone: 'red',     icon: 'cancel',       ar: 'مرفوض' },
  REVERSED:  { key: 'exp.status.reversed',  tone: 'neutral', icon: 'undo',         ar: 'مُلغى الاعتماد' },
  CANCELLED: { key: 'exp.status.cancelled', tone: 'neutral', icon: 'block',        ar: 'ملغى' },
};

/** Fallback meta for unknown/legacy status codes — never throws. */
export const EXPENSE_STATUS_FALLBACK: ExpenseStatusMeta = { key: '—', tone: 'neutral', icon: 'help', ar: '' };

export function expenseStatusMeta(status: string | null | undefined): ExpenseStatusMeta {
  return (status && EXPENSE_STATUS_META[status]) || EXPENSE_STATUS_FALLBACK;
}

/** Direct Arabic status label, with safe fallback to the raw code. */
export function expenseStatusAr(status: string | null | undefined): string {
  if (!status) return '';
  return EXPENSE_STATUS_META[status]?.ar ?? status;
}

// ── Payment method (UI vocabulary: CASH / BANK / ACCOUNTS_PAYABLE) ─────────────
export const EXPENSE_PAYMENT_METHOD_AR: Record<string, string> = {
  CASH: 'نقداً',
  BANK: 'تحويل بنكي',
  ACCOUNTS_PAYABLE: 'ذمم الموردين',
};

/** Ordered options for payment-method <select> inputs. */
export const EXPENSE_PAYMENT_METHOD_OPTIONS: { value: string; label: string }[] = [
  { value: 'CASH', label: EXPENSE_PAYMENT_METHOD_AR.CASH },
  { value: 'BANK', label: EXPENSE_PAYMENT_METHOD_AR.BANK },
  { value: 'ACCOUNTS_PAYABLE', label: EXPENSE_PAYMENT_METHOD_AR.ACCOUNTS_PAYABLE },
];

/** Arabic payment-method label — defaults to cash for unknown/absent codes. */
export function expensePaymentMethodAr(method: string | null | undefined): string {
  return (method && EXPENSE_PAYMENT_METHOD_AR[method]) || EXPENSE_PAYMENT_METHOD_AR.CASH;
}
