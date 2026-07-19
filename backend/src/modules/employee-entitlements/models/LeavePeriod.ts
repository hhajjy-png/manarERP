/** يطابق Leave.type في schema.prisma. */
export type LeavePeriodType = 'ANNUAL' | 'SICK' | 'UNPAID' | 'EMERGENCY';

/** يطابق Leave.status في schema.prisma. */
export type LeavePeriodStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

/**
 * فترة إجازة (قراءة فقط) لنطاق Employee Entitlements — تطابق حقول نموذج Leave في
 * schema.prisma (لا تغيير في المخطط ولا في منطق طلب/اعتماد الإجازات).
 */
export interface LeavePeriod {
  id: number;
  employeeId: number;
  type: LeavePeriodType;
  startDate: Date;
  endDate: Date;
  days: number;
  status: LeavePeriodStatus;
}
