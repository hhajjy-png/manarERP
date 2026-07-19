import type { LeavePeriodStatus, LeavePeriodType } from './LeavePeriod';
import type { SettlementEntryType } from './Settlement';

interface TimelineEventBase {
  key: string;
  date: Date;
}

export interface LeaveTimelineEvent extends TimelineEventBase {
  kind: 'LEAVE';
  leaveType: LeavePeriodType;
  status: LeavePeriodStatus;
  days: number;
}

export interface AdvanceTimelineEvent extends TimelineEventBase {
  kind: 'ADVANCE';
  days: number;
  amount: number;
}

export interface SettlementTimelineEvent extends TimelineEventBase {
  kind: 'SETTLEMENT';
  entryType: SettlementEntryType;
  amount: number;
  days: number | null;
}

/**
 * حدث واحد في الجدول الزمني الموحَّد لاستحقاقات موظف (قراءة/عرض فقط) — يدمج فترات
 * الإجازة والدفعات المقدَّمة وصفوف سجل المستحقات في نوع واحد نظيف قابل للفرز الزمني.
 * لا بيانات جديدة ولا احتساب — انظر timeline/buildEntitlementTimeline.ts.
 */
export type TimelineEvent = LeaveTimelineEvent | AdvanceTimelineEvent | SettlementTimelineEvent;
