import { Prisma } from '@prisma/client';
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

/**
 * ترحيل صرف راتب (salary_payments — كشوف التحويل البنكي للرواتب) إلى الأستاذ العام:
 *
 *   Dr مصروف الرواتب (5100) — مدين  (الاعتراف بمصروف الراتب)
 *   Cr البنك (1010)          — دائن  (خروج النقد عبر التحويل البنكي)
 *
 * لماذا هنا: رواتب السائقين (النشاط الأساسي للشركة) تُدفع فعليًا عبر ملفات التحويل
 * البنكي المستوردة إلى salary_payments، لا عبر وحدة payroll (التي تبقى مسودّات). كانت
 * هذه المدفوعات غائبة عن كل تقرير مالي، فيَظهر ربحٌ مبالغٌ فيه. الآن تُرحَّل إلى نفس
 * الأستاذ العام مثل بقية الأحداث — مصدر محاسبي واحد.
 *
 * محمي من الترحيل المزدوج عبر (referenceType='SALARY_PAYMENT', referenceId) + قيد
 * @@unique. يتجاهل: القيمة صفر، أو السجل المُعلَّم تكرارًا (duplicateFlag).
 *
 * التاريخ المحاسبي = تاريخ الدفع الفعلي إن وُجد، وإلا تاريخ الإدخال (createdAt) — لا
 * يُستخدم تاريخ اليوم لسجل تاريخي.
 */
export async function postSalaryPaymentToGL(tx: Tx, salaryPaymentId: number): Promise<void> {
  const sp = await tx.salaryPayment.findUnique({ where: { id: salaryPaymentId } });
  if (!sp) return;

  // لا تُرحّل السجلات المُعلَّمة تكرارًا (لتجنّب ازدواج مصروف الراتب في الدفتر).
  if (sp.duplicateFlag) return;

  const amount = round3(sp.amount);
  if (amount <= 0) return;

  // حارس الترحيل المزدوج (مستوى الكود — قبل قيد DB الفريد).
  const existing = await tx.journalEntry.findFirst({
    where: { referenceType: GL_REFERENCE_TYPES.SALARY_PAYMENT, referenceId: salaryPaymentId },
  });
  if (existing) return;

  await ensureSystemAccounts(tx);
  const accounts = await getSystemAccounts(tx);
  const payrollExpId = requireAccount(accounts, SYSTEM_ACCOUNT_CODES.PAYROLL_EXPENSE);
  const bankId = requireAccount(accounts, SYSTEM_ACCOUNT_CODES.BANK);

  const postingDate = sp.paymentDate ?? sp.createdAt ?? new Date();
  const monthLabel = sp.sourceMonth ? ` (${sp.sourceMonth})` : '';

  await createBalancedJournal(tx, {
    date: postingDate,
    description: `راتب ${sp.beneficiaryName}${monthLabel}`,
    referenceType: GL_REFERENCE_TYPES.SALARY_PAYMENT,
    referenceId: salaryPaymentId,
    lines: [
      { accountId: payrollExpId, debit: amount, credit: 0, description: `مصروف راتب — ${sp.beneficiaryName}${monthLabel}` },
      { accountId: bankId, debit: 0, credit: amount, description: `تحويل بنكي — ${sp.beneficiaryName}${monthLabel}` },
    ],
  });
}

/**
 * عكس قيد صرف راتب (عند حذف/تصحيح كشف التحويل) — بديل غير حذفي، للحفاظ على أثر التدقيق.
 */
export async function reverseSalaryPaymentGL(tx: Tx, salaryPaymentId: number): Promise<void> {
  await reverseGL(
    tx,
    GL_REFERENCE_TYPES.SALARY_PAYMENT,
    salaryPaymentId,
    GL_REFERENCE_TYPES.SALARY_PAYMENT_REVERSAL,
  );
}
