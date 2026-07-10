import { Prisma } from '@prisma/client';
import { AppError } from '../../core/errors/AppError';
import {
  SYSTEM_ACCOUNT_CODES,
  ensureSystemAccounts,
  getSystemAccounts,
  requireAccount,
} from '../accounting/accounting.accounts';
import {
  createBalancedJournal,
  reverseGL,
  round3,
  GL_REFERENCE_TYPES,
} from '../../shared/services/gl.service';

type Tx = Prisma.TransactionClient;

const PAYROLL_PAYMENT_LABELS: Record<string, string> = {
  CASH: 'صرف نقدي',
  BANK: 'تحويل بنكي',
  ACCOUNTS_PAYABLE: 'رواتب مستحقة الدفع',
};

/**
 * تاريخ قيد الرواتب المحاسبي.
 *
 * السياسة (نقطة واحدة يستخدمها الدفتران — GL والدفتر القديم):
 *   1. تاريخ صرف صريح من المستخدم إن وُجد.
 *   2. وإلا: آخر يوم في شهر وسنة الراتب.
 * لا يُستخدم تاريخ اليوم أبدًا كتاريخ محاسبي — راتب ديسمبر 2024 يُرحَّل
 * في 31/12/2024 مهما كان تاريخ إدخاله.
 *
 * `new Date(year, month, 0)` — اليوم صفر من الشهر التالي = آخر يوم في الشهر
 * الحالي، لأن `month` هنا 1-based بينما مُنشئ Date يتوقع 0-based.
 */
export function resolvePayrollPostingDate(
  payroll: { month: number; year: number },
  explicitPaymentDate?: Date | null,
): Date {
  return explicitPaymentDate ?? new Date(payroll.year, payroll.month, 0);
}

/**
 * ترحيل قيد يومية مزدوج لكشف راتب مصروف (PAID):
 *   Dr مصروف الرواتب (5100) — مدين (إجمالي صافي الراتب)
 *   Cr يُحدَّد بناءً على paymentMethod:
 *       CASH           → الصندوق (1000)      — صرف نقدي مباشر
 *       BANK           → البنك (1010)         — تحويل بنكي
 *       ACCOUNTS_PAYABLE → رواتب مستحقة (2100) — التزام مؤجل (Salaries Payable)
 *
 * يُستدعى في markPaid() عند تحديد paymentMethod.
 * محمي من الترحيل المزدوج عبر (referenceType='PAYROLL', referenceId).
 * القيد الفريد على مستوى قاعدة البيانات: @@unique([referenceType, referenceId]).
 */
export async function postPayrollToGL(
  tx: Tx,
  payrollId: number,
  paymentDate?: Date | null,
): Promise<void> {
  const payroll = await tx.payroll.findUnique({
    where: { id: payrollId },
    include: { employee: { select: { fullName: true } } },
  });
  if (!payroll) throw AppError.notFound('كشف الراتب غير موجود');

  const amount = round3(payroll.netSalary);
  if (amount <= 0) return;

  // حارس الترحيل المزدوج (مستوى الكود)
  const existing = await tx.journalEntry.findFirst({
    where: { referenceType: GL_REFERENCE_TYPES.PAYROLL, referenceId: payrollId },
  });
  if (existing) return;

  await ensureSystemAccounts(tx);
  const accounts = await getSystemAccounts(tx);
  const payrollExpId = requireAccount(accounts, SYSTEM_ACCOUNT_CODES.PAYROLL_EXPENSE);

  // paymentMethod موجود على كشف الراتب بعد تحديثه في markPaid()
  const paymentMethod = (payroll as Record<string, unknown>)['paymentMethod'] as string | null ?? 'BANK';
  const creditCode =
    paymentMethod === 'CASH'             ? SYSTEM_ACCOUNT_CODES.CASH :
    paymentMethod === 'ACCOUNTS_PAYABLE' ? SYSTEM_ACCOUNT_CODES.SALARIES_PAYABLE :
    SYSTEM_ACCOUNT_CODES.BANK; // BANK default
  const creditAccId = requireAccount(accounts, creditCode);
  const creditLabel = PAYROLL_PAYMENT_LABELS[paymentMethod] ?? 'تحويل بنكي';

  const monthLabel = `${payroll.month}/${payroll.year}`;
  const empName = payroll.employee.fullName;

  await createBalancedJournal(tx, {
    date: resolvePayrollPostingDate(payroll, paymentDate),
    description: `راتب ${empName} — ${monthLabel}`,
    referenceType: GL_REFERENCE_TYPES.PAYROLL,
    referenceId: payrollId,
    lines: [
      {
        accountId: payrollExpId,
        debit: amount,
        credit: 0,
        description: `مصروف راتب — ${empName} ${monthLabel}`,
      },
      {
        accountId: creditAccId,
        debit: 0,
        credit: amount,
        description: `${creditLabel} — ${empName} ${monthLabel}`,
      },
    ],
  });
}

/**
 * عكس القيد المحاسبي لكشف راتب (عند الإلغاء بعد الصرف أو التصحيح).
 * - لا يحذف القيد الأصلي (حفاظ على أثر التدقيق).
 * - يُنشئ قيدًا عكسيًا متوازنًا (PAYROLL_REVERSAL).
 * - محمي من التكرار.
 */
export async function reversePayrollGL(tx: Tx, payrollId: number): Promise<void> {
  await reverseGL(tx, GL_REFERENCE_TYPES.PAYROLL, payrollId, GL_REFERENCE_TYPES.PAYROLL_REVERSAL);
}
