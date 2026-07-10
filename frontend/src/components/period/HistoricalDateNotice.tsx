import { usePeriodLock } from '../../hooks/usePeriodLock';
import { assessHistoricalDate } from '../../lib/historicalDate';
import { displayDate } from '../../lib/financialPeriod';
import './historical-date-notice.css';

/**
 * تنبيه خفيف داخل النماذج المالية عند إدخال تاريخ يخصّ سنة سابقة، أو تاريخ مقفول.
 *
 * لا يمنع الحفظ ولا يغيّر التاريخ — يكتفي بالإعلام:
 *  - سنة سابقة → تنبيه كهرماني: يظهر الأثر في تقارير تلك السنة.
 *  - مقفول بلا تجاوز → رسالة قفل حمراء (الحفظ سيُرفض من الـ backend).
 *  - مقفول مع صلاحية `financial.overrideLock` → تنبيه أن الحفظ سيتجاوز القفل ويُسجَّل.
 *
 * تاريخ العملية هو المرجع دائمًا — لا `createdAt`.
 */
/**
 * @param enforcesLock هل الحفظ يخضع لقفل الفترة في الـ backend؟ true لكل ما يُرحَّل
 *   محاسبيًا (فاتورة/مصروف/دفعة/قيد). false للمستندات غير المُرحَّلة (شيك) حتى لا
 *   نُظهر رسالة «لا يمكن الحفظ» بينما الحفظ فعليًا مسموح.
 */
export default function HistoricalDateNotice({ date, enforcesLock = true }: { date?: string | null; enforcesLock?: boolean }) {
  const { lockBeforeDate, canOverride } = usePeriodLock();
  const a = assessHistoricalDate(date, {
    lockBeforeDate: enforcesLock ? lockBeforeDate : null,
    canOverride,
  });

  if (a.severity === 'none') return null;

  if (a.severity === 'locked') {
    return a.isOverridable ? (
      <div className="hist-notice hist-notice--override" role="note">
        <span className="material-symbols-outlined" aria-hidden>lock_open</span>
        <span>
          الفترة مقفلة قبل {displayDate(lockBeforeDate ?? undefined)}. الحفظ بتاريخ {displayDate(date ?? undefined)} سيتجاوز
          القفل بصلاحيتك، وسيُسجَّل التجاوز في سجل التدقيق.
        </span>
      </div>
    ) : (
      <div className="hist-notice hist-notice--locked" role="alert">
        <span className="material-symbols-outlined" aria-hidden>lock</span>
        <span>
          الفترة المالية مقفلة قبل {displayDate(lockBeforeDate ?? undefined)}. لا يمكن حفظ معاملة بتاريخ{' '}
          {displayDate(date ?? undefined)} — راجع مدير النظام أو صلاحية تجاوز القفل.
        </span>
      </div>
    );
  }

  // historical
  return (
    <div className="hist-notice hist-notice--historical" role="note">
      <span className="material-symbols-outlined" aria-hidden>history</span>
      <span>
        تنبيه: هذه المعاملة تخص سنة مالية سابقة ({a.year}). سيظهر أثرها المحاسبي في تقارير وأرصدة سنة {a.year}.
      </span>
    </div>
  );
}
