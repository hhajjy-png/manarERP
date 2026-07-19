/** يطابق LeaveSettlement.paymentMethod في schema.prisma. */
export type PaymentMethod = 'CASH' | 'BANK_TRANSFER' | 'CHEQUE' | 'OTHER';

/**
 * دفعة مقدَّمة يدوية على رصيد الإجازة (قراءة فقط) — تطابق نموذج LeaveSettlement في
 * schema.prisma تمامًا (لا تغيير في المخطط). توثيق تاريخي فقط: لا تُسقط ولا تُنقص
 * استحقاق الإجازة القانوني المحتسَب (المادتان 73/74 — انظر entitlements.calc.ts).
 */
export interface LeaveAdvance {
  id: number;
  employeeId: number;
  advanceDate: Date;
  leaveDaysAdvanced: number;
  amount: number;
  paymentMethod: PaymentMethod;
  notes: string | null;
}
