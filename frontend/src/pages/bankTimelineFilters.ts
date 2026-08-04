// Pure, dependency-free helpers for the Bank Account Explorer timeline filters.
// Kept out of the component so the date math and chart sanitisation can be unit-tested.

import type {
  TimelineFilterType, TimelineFilters, TimelineDirection, TimelineCategory,
} from '../api/bankStatementImport';

export type QuickRange = 'today' | 'week' | 'month' | 'last30' | 'last90' | 'all';

export interface DateRange {
  fromDate: string; // YYYY-MM-DD ('' = unbounded)
  toDate:   string;
}

export const QUICK_RANGE_LABELS: Record<QuickRange, string> = {
  today:  'اليوم',
  week:   'هذا الأسبوع',
  month:  'هذا الشهر',
  last30: 'آخر 30 يوم',
  last90: 'آخر 90 يوم',
  all:    'الكل',
};

export const TYPE_LABELS: Record<TimelineFilterType, string> = {
  all:         'الكل',
  deposits:    'إيداعات',
  withdrawals: 'سحوبات',
  fees:        'رسوم',
  cheques:     'شيكات',
  transfers:   'تحويلات',
};

/** Label for the dynamic filtered-total shown beside the result count, per active type filter. */
export const TIMELINE_TOTAL_LABELS: Record<TimelineFilterType, string> = {
  all:         'الإجمالي',
  deposits:    'إجمالي الإيداعات',
  withdrawals: 'إجمالي السحوبات',
  fees:        'إجمالي الرسوم',
  cheques:     'إجمالي الشيكات',
  transfers:   'إجمالي التحويلات',
};

// Optional i18n hook, mirroring bankTransactionPresentation.ts's `tr()` pattern: callers
// pass their `t()` to localize the label; omitted (e.g. unit tests, or callers that
// haven't wired it up yet — see BankAccountExplorer.tsx) falls back to the original
// Arabic literal, so behavior is unchanged either way.
type TranslateFn = (key: string) => string;

/** i18n keys for the filtered-total label, one per active type filter. */
const TIMELINE_TOTAL_KEYS: Record<TimelineFilterType, string> = {
  all:         'bank.import.timeline.total.all',
  deposits:    'bank.import.timeline.total.deposits',
  withdrawals: 'bank.import.timeline.total.withdrawals',
  fees:        'bank.import.timeline.total.fees',
  cheques:     'bank.import.timeline.total.cheques',
  transfers:   'bank.import.timeline.total.transfers',
};

/** Resolve the filtered-total label for the active type filter (defaults to «الإجمالي»). */
export function timelineTotalLabel(type: TimelineFilterType | undefined, translate?: TranslateFn): string {
  const key = type ?? 'all';
  return translate ? translate(TIMELINE_TOTAL_KEYS[key]) : (TIMELINE_TOTAL_LABELS[key] ?? TIMELINE_TOTAL_LABELS.all);
}

/** Local-date → YYYY-MM-DD (no timezone shift, unlike toISOString). */
export function toIsoDate(d: Date): string {
  const y   = d.getFullYear();
  const m   = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Resolve a quick range to concrete from/to dates. `now` is injectable for tests.
 * Week starts on Saturday (Kuwait convention). "month" is the current calendar
 * month to date; last30/last90 are rolling windows inclusive of today.
 */
export function quickRangeToDates(range: QuickRange, now: Date = new Date()): DateRange {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const to    = toIsoDate(today);

  const minusDays = (n: number): string => {
    const d = new Date(today);
    d.setDate(d.getDate() - n);
    return toIsoDate(d);
  };

  switch (range) {
    case 'today':
      return { fromDate: to, toDate: to };
    case 'week': {
      // Days since the most recent Saturday (getDay: 0=Sun … 6=Sat).
      const sinceSaturday = (today.getDay() + 1) % 7;
      return { fromDate: minusDays(sinceSaturday), toDate: to };
    }
    case 'month': {
      const first = new Date(today.getFullYear(), today.getMonth(), 1);
      return { fromDate: toIsoDate(first), toDate: to };
    }
    case 'last30':
      return { fromDate: minusDays(29), toDate: to };
    case 'last90':
      return { fromDate: minusDays(89), toDate: to };
    case 'all':
    default:
      return { fromDate: '', toDate: '' };
  }
}

/** Coerce any value to a finite number, defaulting to 0. Guards charts from NaN/undefined. */
export function safeNum(v: unknown): number {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

/** Round to 3 decimals (KWD) as a finite number, never NaN. */
export function safeAmount(v: unknown): number {
  return parseFloat(safeNum(v).toFixed(3));
}

// ── البُعدان المستقلان: الاتجاه والتصنيف ───────────────────────────────────────
// نتيجة التدقيق: فلتر «النوع» القديم كان يخلط الاتجاه بالتصنيف في قائمة أحادية،
// فتعذّر طلب «شيكات صادرة». صارا بُعدين مستقلين: اتجاه واحد + تصنيفات متعددة.

export const DIRECTION_OPTIONS: readonly TimelineDirection[] = ['deposit', 'withdrawal', 'neutral'];

export const DIRECTION_FILTER_KEYS: Record<TimelineDirection, string> = {
  deposit:    'bank.explorer.badge_deposit',
  withdrawal: 'bank.explorer.badge_withdrawal',
  neutral:    'bank.explorer.badge_neutral',
};

/** ترتيب العرض في شريط الفلاتر — الأكثر استخدامًا أولًا. */
export const CATEGORY_OPTIONS: readonly TimelineCategory[] = [
  'cheque', 'transfer', 'bank_fee', 'invoice', 'expense', 'payroll',
  'voucher', 'receipt_voucher', 'payment_voucher', 'journal',
  'interest', 'adjustment', 'opening_balance', 'cash', 'unclassified',
];

export const CATEGORY_FILTER_KEYS: Record<TimelineCategory, string> = {
  cheque:          'bank.explorer.category.cheque',
  transfer:        'bank.explorer.category.transfer',
  invoice:         'bank.explorer.category.invoice',
  expense:         'bank.explorer.category.expense',
  payroll:         'bank.explorer.category.payroll',
  voucher:         'bank.explorer.category.voucher',
  receipt_voucher: 'bank.explorer.category.receipt_voucher',
  payment_voucher: 'bank.explorer.category.payment_voucher',
  journal:         'bank.explorer.category.journal',
  bank_fee:        'bank.explorer.category.bank_fee',
  interest:        'bank.explorer.category.interest',
  adjustment:      'bank.explorer.category.adjustment',
  opening_balance: 'bank.explorer.category.opening_balance',
  cash:            'bank.explorer.category.cash',
  unclassified:    'bank.explorer.category.unclassified',
};

// ── عدّاد الفلاتر المفعَّلة ─────────────────────────────────────────────────────
// المدى الزمني بُعد واحد (حتى لو حدّين)، وكذلك مدى المبلغ — كي يطابق العدّاد
// عدد الشرائح المعروضة تمامًا.
export function countActiveFilters(f: TimelineFilters): number {
  let n = 0;
  if (f.search) n += 1;
  if (f.fromDate || f.toDate) n += 1;
  if (f.direction) n += 1;
  if (f.categories?.length) n += 1;
  if (f.minAmount != null || f.maxAmount != null) n += 1;
  if (f.excludeDuplicates) n += 1;
  return n;
}

// ── التحقق من صحة الإدخال ─────────────────────────────────────────────────────
// تناقض «من > إلى» أو «الأدنى > الأعلى» كان يُنتج صفر نتائج بلا سبب مفهوم.
// يُرصد الآن قبل إرسال الاستعلام، ويُعرض كرسالة صريحة بدل قائمة فارغة مضلِّلة.

export interface FilterValidationIssue {
  field:      'dateRange' | 'amountRange';
  messageKey: string;
}

export function validateFilterInputs(input: {
  fromDate?: string;
  toDate?:   string;
  minAmount?: number;
  maxAmount?: number;
}): FilterValidationIssue[] {
  const issues: FilterValidationIssue[] = [];
  if (input.fromDate && input.toDate && input.fromDate > input.toDate) {
    issues.push({ field: 'dateRange', messageKey: 'bank.explorer.invalid_date_range' });
  }
  if (input.minAmount != null && input.maxAmount != null && input.minAmount > input.maxAmount) {
    issues.push({ field: 'amountRange', messageKey: 'bank.explorer.invalid_amount_range' });
  }
  return issues;
}

/** هل المدخلات صالحة للإرسال؟ استعلام واحد لا يُرسل ما دام هناك تناقض. */
export function areFilterInputsValid(input: Parameters<typeof validateFilterInputs>[0]): boolean {
  return validateFilterInputs(input).length === 0;
}
