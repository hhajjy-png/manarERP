// Pure, dependency-free helpers for the Bank Account Explorer timeline filters.
// Kept out of the component so the date math and chart sanitisation can be unit-tested.

import type { TimelineFilterType } from '../api/bankStatementImport';

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
