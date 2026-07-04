import type { ParsedBankRow, RowValidation } from './types';

const ACCEPTED_CURRENCIES = new Set(['KWD', 'USD', 'EUR']);
const ACCEPTED_STATUSES   = new Set(['PROCESSED', 'SUCCESS', 'COMPLETED', 'CREDITED', 'PAID', '']);

/** Validate a single parsed row. Returns blocking errors and non-blocking warnings. */
export function validateRow(
  row: ParsedBankRow,
  existingTxIds: Set<string>,
  payloadTxCount: Map<string, number>,
): RowValidation {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Payroll period
  if (!row.payrollMonth || row.payrollMonth < 1 || row.payrollMonth > 12) {
    errors.push('شهر الرواتب غير صحيح');
  }
  if (!row.payrollYear || row.payrollYear < 2000 || row.payrollYear > 2100) {
    errors.push('سنة الرواتب غير صحيحة');
  }

  // Transaction ID
  if (!row.transactionId) {
    errors.push('رقم المعاملة مفقود');
  } else {
    if (existingTxIds.has(row.transactionId)) {
      errors.push('رقم المعاملة مستورد مسبقاً');
    }
    if ((payloadTxCount.get(row.transactionId) ?? 0) > 1) {
      errors.push('رقم المعاملة مكرر داخل الملف');
    }
  }

  // Amount
  if (isNaN(row.amount) || row.amount === 0) {
    errors.push('المبلغ يساوي صفر');
  } else if (row.amount < 0) {
    errors.push('المبلغ سالب');
  }

  // Currency
  if (!ACCEPTED_CURRENCIES.has(row.currency)) {
    errors.push(`العملة غير مدعومة: ${row.currency || 'مفقود'} (المقبول: KWD, USD, EUR)`);
  } else if (row.currency !== 'KWD') {
    warnings.push(`العملة ${row.currency} — تأكد من صحة المبلغ`);
  }

  // Payment status — some banks include error rows; non-blocking warning if not a success status
  if (row.paymentStatus) {
    const upper = row.paymentStatus.toUpperCase();
    if (!ACCEPTED_STATUSES.has(upper) && upper !== '') {
      warnings.push(`حالة الدفع: ${row.paymentStatus} — تحقق من صحة الصف`);
    }
  }

  // Payment date
  if (!row.paymentDate) {
    warnings.push('تاريخ الدفع غير موجود');
  } else {
    const d = new Date(row.paymentDate);
    if (isNaN(d.getTime())) {
      warnings.push(`تاريخ الدفع قد يكون غير صحيح: ${row.paymentDate}`);
    }
  }

  // IBAN validity is handled by the assistant (proper mod-97 check in ibanValidator.ts),
  // so no crude format warning is raised here.

  // Beneficiary name
  if (!row.beneficiaryName) {
    warnings.push('اسم المستفيد غير موجود');
  }

  // Matching fields — at least one identifier required
  const hasId = !!(row.employeeCode || row.civilId || row.bankAccount || row.iban);
  if (!hasId) {
    errors.push('لا يوجد معرّف للمطابقة: رقم الموظف، الرقم المدني، أو رقم الحساب');
  }

  return { errors, warnings };
}

/** Compute payload-level duplicate map (transactionId → count across all rows). */
export function buildPayloadTxCount(rows: ParsedBankRow[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const row of rows) {
    if (row.transactionId) {
      counts.set(row.transactionId, (counts.get(row.transactionId) ?? 0) + 1);
    }
  }
  return counts;
}
