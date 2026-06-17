import { Prisma } from '@prisma/client';
import { AppError } from '../../core/errors/AppError';
import {
  SYSTEM_ACCOUNT_CODES,
  ensureSystemAccounts,
  getSystemAccounts,
  requireAccount,
} from '../accounting/accounting.accounts';

type Tx = Prisma.TransactionClient;

const round3 = (n: number) => Math.round((n + Number.EPSILON) * 1000) / 1000;

type JournalLine = { accountId: number; debit: number; credit: number; description: string };

/**
 * توليد رقم قيد يومية فريد بصيغة JRN-<السنة>-<تسلسل> داخل المعاملة.
 * يستخدم أقصى id (MAX) بدلاً من COUNT لتجنّب التعارض عند حذف قيود وسطية.
 */
async function generateEntryNumber(tx: Tx): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = `JRN-${year}-`;
  const last = await tx.journalEntry.findFirst({
    where: { entryNumber: { startsWith: prefix } },
    orderBy: { id: 'desc' },
    select: { entryNumber: true },
  });
  const lastSeq = last ? parseInt(last.entryNumber.slice(prefix.length), 10) : 0;
  const nextSeq = isNaN(lastSeq) ? 1 : lastSeq + 1;
  return `${prefix}${String(nextSeq).padStart(5, '0')}`;
}

/**
 * ينشئ قيد يومية مزدوجًا بعد التحقق من توازنه (إجمالي المدين = إجمالي الدائن).
 * يرمي خطأً قبل الكتابة إذا كان القيد غير متوازن.
 */
export async function createBalancedJournalEntry(
  tx: Tx,
  data: {
    date: Date;
    description: string;
    referenceType: string;
    referenceId: number;
    lines: JournalLine[];
  },
): Promise<void> {
  const totalDebit = round3(data.lines.reduce((s, l) => s + l.debit, 0));
  const totalCredit = round3(data.lines.reduce((s, l) => s + l.credit, 0));

  if (Math.abs(totalDebit - totalCredit) > 0.001) {
    throw new AppError(
      `قيد محاسبي غير متوازن: المدين ${totalDebit} ≠ الدائن ${totalCredit}`,
      500,
    );
  }

  await tx.journalEntry.create({
    data: {
      entryNumber: await generateEntryNumber(tx),
      date: data.date,
      description: data.description,
      referenceType: data.referenceType,
      referenceId: data.referenceId,
      status: 'POSTED',
      lines: { create: data.lines },
    },
  });
}

/**
 * ترحيل قيد يومية مزدوج لمصروف معتمد:
 *   من ح/ مصروفات عامة (5200) — مدين
 *   إلى ح/ الصندوق (1000) — دائن
 *
 * Phase B: الترحيل دائمًا على الصندوق لأن نموذج المصروف لا يحتوي حقل طريقة الدفع.
 * مستقبلاً: يمكن إضافة paymentMethod لتوجيه الترحيل إلى الصندوق أو البنك.
 *
 * محمي من الترحيل المزدوج عبر:
 * - حارس كودي: findFirst({ referenceType:'EXPENSE', referenceId })
 * - قيد فريد DB: @@unique([referenceType, referenceId]) على JournalEntry
 */
export async function postExpenseToGL(tx: Tx, expenseId: number): Promise<void> {
  const expense = await tx.expense.findUnique({ where: { id: expenseId } });
  if (!expense) throw AppError.notFound('المصروف غير موجود');

  const amount = round3(expense.amount);
  if (amount <= 0) return;

  // حارس الترحيل المزدوج (مستوى الكود — قبل DB)
  const existing = await tx.journalEntry.findFirst({
    where: { referenceType: 'EXPENSE', referenceId: expenseId },
  });
  if (existing) return;

  await ensureSystemAccounts(tx);
  const accounts = await getSystemAccounts(tx);
  const expenseAccId = requireAccount(accounts, SYSTEM_ACCOUNT_CODES.GENERAL_EXPENSE);
  const cashAccId = requireAccount(accounts, SYSTEM_ACCOUNT_CODES.CASH);

  await createBalancedJournalEntry(tx, {
    date: expense.date,
    description: `مصروف: ${expense.description}`,
    referenceType: 'EXPENSE',
    referenceId: expenseId,
    lines: [
      { accountId: expenseAccId, debit: amount, credit: 0, description: `مصروف عام — ${expense.description}` },
      { accountId: cashAccId, debit: 0, credit: amount, description: `صرف نقدي — ${expense.code}` },
    ],
  });
}

/**
 * عكس القيد المحاسبي لمصروف مُلغى اعتماده.
 * - لا يحذف القيد الأصلي (حفاظ على أثر التدقيق).
 * - يُنشئ قيدًا عكسيًا متوازنًا (EXPENSE_REVERSAL).
 * - محمي من تكرار العكس عبر حارس (referenceType='EXPENSE_REVERSAL', referenceId).
 */
export async function reverseExpenseFromGL(tx: Tx, expenseId: number): Promise<void> {
  const original = await tx.journalEntry.findFirst({
    where: { referenceType: 'EXPENSE', referenceId: expenseId, status: 'POSTED' },
    include: { lines: true },
  });
  if (!original) return; // لم يُرحَّل في GL — لا شيء للعكس

  const existingReversal = await tx.journalEntry.findFirst({
    where: { referenceType: 'EXPENSE_REVERSAL', referenceId: expenseId },
  });
  if (existingReversal) return; // العكس موجود بالفعل

  await createBalancedJournalEntry(tx, {
    date: new Date(),
    description: `عكس قيد مصروف #${expenseId}`,
    referenceType: 'EXPENSE_REVERSAL',
    referenceId: expenseId,
    lines: original.lines.map((line) => ({
      accountId: line.accountId,
      debit: line.credit,  // مقلوب
      credit: line.debit,  // مقلوب
      description: `عكس: ${line.description ?? ''}`.trim(),
    })),
  });
}
