import type { LeavePeriod } from '../models/LeavePeriod';
import type { LeaveAdvance } from '../models/LeaveAdvance';
import type { Settlement } from '../models/Settlement';
import type { TimelineEvent } from '../models/TimelineEvent';

/**
 * يبني جدولاً زمنيًا موحَّدًا (الأحدث أولًا) من فترات الإجازة والدفعات المقدَّمة وصفوف
 * سجل المستحقات لموظف واحد (Part 4 — timeline/). دمج/فرز عرضي بحت — لا بيانات جديدة
 * ولا احتساب؛ نظير خادمي لِـ buildTimeline في
 * frontend/src/components/employee/entitlementsShared.tsx (غير مستهلَك من أي مسار API
 * بعد — جاهز لحزمة مستقبلية تعرضه عبر نقطة نهاية حقيقية).
 */
export function buildEntitlementTimeline(
  leavePeriods: readonly LeavePeriod[],
  advances: readonly LeaveAdvance[],
  settlements: readonly Settlement[],
): TimelineEvent[] {
  const events: TimelineEvent[] = [
    ...leavePeriods.map((l): TimelineEvent => ({
      kind: 'LEAVE',
      key: `leave-${l.id}`,
      date: l.startDate,
      leaveType: l.type,
      status: l.status,
      days: l.days,
    })),
    ...advances.map((a): TimelineEvent => ({
      kind: 'ADVANCE',
      key: `advance-${a.id}`,
      date: a.advanceDate,
      days: a.leaveDaysAdvanced,
      amount: a.amount,
    })),
    ...settlements.map((s): TimelineEvent => ({
      kind: 'SETTLEMENT',
      key: `settlement-${s.id}`,
      date: s.entryDate,
      entryType: s.entryType,
      amount: s.amount,
      days: s.leaveDays,
    })),
  ];

  return events.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
}
