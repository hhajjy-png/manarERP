/**
 * منطق نقي لتقييم تاريخ محاسبي مُدخَل يدويًا مقابل السنة الحالية وقفل الفترة.
 * منفصل عن React ليُختبَر مباشرةً. كل التواريخ محلية بصيغة `YYYY-MM-DD`.
 */

export type HistoricalSeverity = 'none' | 'historical' | 'locked';

export interface HistoricalAssessment {
  severity: HistoricalSeverity;
  /** سنة التاريخ المُدخَل. */
  year: number | null;
  /** هل التاريخ يخصّ سنة سابقة للسنة الحالية؟ */
  isHistorical: boolean;
  /** هل التاريخ مقفول (أقدم من lockBeforeDate) ولا يملك المستخدم تجاوزًا؟ */
  isBlocked: boolean;
  /** هل التاريخ مقفول لكن المستخدم يملك صلاحية التجاوز؟ */
  isOverridable: boolean;
}

export function assessHistoricalDate(
  dateStr: string | undefined | null,
  opts: { lockBeforeDate?: string | null; canOverride?: boolean; now?: Date } = {},
): HistoricalAssessment {
  const empty: HistoricalAssessment = {
    severity: 'none', year: null, isHistorical: false, isBlocked: false, isOverridable: false,
  };
  if (!dateStr || !/^\d{4}-\d{2}-\d{2}/.test(dateStr)) return empty;

  const year = Number(dateStr.slice(0, 4));
  const now = opts.now ?? new Date();
  const isHistorical = year < now.getFullYear();

  const lock = opts.lockBeforeDate ?? null;
  // المقارنة على مستوى اليوم بسلاسل YYYY-MM-DD (مقارنة معجمية صحيحة).
  const beforeLock = !!lock && dateStr.slice(0, 10) < lock.slice(0, 10);
  const isBlocked = beforeLock && !opts.canOverride;
  const isOverridable = beforeLock && !!opts.canOverride;

  const severity: HistoricalSeverity = beforeLock ? 'locked' : isHistorical ? 'historical' : 'none';

  return { severity, year, isHistorical, isBlocked, isOverridable };
}
