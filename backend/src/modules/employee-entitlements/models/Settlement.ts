import type { PaymentMethod } from './LeaveAdvance';

/** يطابق EmployeeEntitlementLedger.entryType في schema.prisma. */
export type SettlementEntryType = 'LEAVE_ALLOWANCE' | 'END_OF_SERVICE' | 'OTHER';

/**
 * صف مصروف من سجل المستحقات (قراءة فقط) — تطابق نموذج EmployeeEntitlementLedger في
 * schema.prisma تمامًا (لا تغيير في المخطط). سجل تاريخي/مراجعة فقط: مستقلّ تمامًا عن
 * LeaveAdvance، لا يؤثر في أي احتساب (رصيد الإجازة/بدل الإجازة/مكافأة نهاية الخدمة).
 */
export interface Settlement {
  id: number;
  employeeId: number;
  entryType: SettlementEntryType;
  entryDate: Date;
  description: string | null;
  leaveDays: number | null;
  leaveBalanceSnapshot: number | null;
  amount: number;
  paymentMethod: PaymentMethod;
  notes: string | null;
}
