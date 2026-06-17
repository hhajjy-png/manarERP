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

/**
 * Re-export createBalancedJournal under the legacy name for backward compatibility
 * with tests and any callers that import directly from this file.
 */
export { createBalancedJournal as createBalancedJournalEntry } from '../../shared/services/gl.service';

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  CASH: 'صرف نقدي',
  BANK: 'تحويل بنكي',
  ACCOUNTS_PAYABLE: 'ذمم مورد',
};

/**
 * ترحيل قيد يومية مزدوج لمصروف معتمد:
 *   من ح/ مصروفات عامة (5200) — مدين
 *   إلى ح/ يُحدَّد بناءً على paymentMethod:
 *     CASH           → الصندوق (1000)
 *     BANK           → البنك (1010)
 *     ACCOUNTS_PAYABLE → ذمم الموردين (2000)
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
    where: { referenceType: GL_REFERENCE_TYPES.EXPENSE, referenceId: expenseId },
  });
  if (existing) return;

  await ensureSystemAccounts(tx);
  const accounts = await getSystemAccounts(tx);
  const expenseAccId = requireAccount(accounts, SYSTEM_ACCOUNT_CODES.GENERAL_EXPENSE);

  const paymentMethod = (expense as Record<string, unknown>)['paymentMethod'] as string ?? 'CASH';
  const creditCode =
    paymentMethod === 'BANK'             ? SYSTEM_ACCOUNT_CODES.BANK :
    paymentMethod === 'ACCOUNTS_PAYABLE' ? SYSTEM_ACCOUNT_CODES.ACCOUNTS_PAYABLE :
    SYSTEM_ACCOUNT_CODES.CASH;
  const creditAccId = requireAccount(accounts, creditCode);
  const creditLabel = PAYMENT_METHOD_LABELS[paymentMethod] ?? 'صرف نقدي';

  await createBalancedJournal(tx, {
    date: expense.date,
    description: `مصروف: ${expense.description}`,
    referenceType: GL_REFERENCE_TYPES.EXPENSE,
    referenceId: expenseId,
    lines: [
      { accountId: expenseAccId, debit: amount, credit: 0, description: `مصروف عام — ${expense.description}` },
      { accountId: creditAccId, debit: 0, credit: amount, description: `${creditLabel} — ${expense.code}` },
    ],
  });
}

/**
 * عكس القيد المحاسبي لمصروف مُعكوس (REVERSED).
 * - لا يحذف القيد الأصلي (حفاظ على أثر التدقيق).
 * - يُنشئ قيدًا عكسيًا متوازنًا (EXPENSE_REVERSAL).
 * - محمي من تكرار العكس.
 */
export async function reverseExpenseFromGL(tx: Tx, expenseId: number): Promise<void> {
  await reverseGL(tx, GL_REFERENCE_TYPES.EXPENSE, expenseId, GL_REFERENCE_TYPES.EXPENSE_REVERSAL);
}
