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
  supersedeBalancedJournal,
  round3,
  GL_REFERENCE_TYPES,
  JournalLine,
} from '../../shared/services/gl.service';
import { glPaymentMethodAr } from '../../shared/utils/expenseLabels';

type Tx = Prisma.TransactionClient;

/** مواصفة قيد المصروف — يبنيها مصدر واحد يستهلكه الترحيل الأولي والتصحيح معًا. */
type ExpenseGLPosting = { date: Date; description: string; lines: JournalLine[] };

/**
 * يبني مواصفة قيد المصروف من حالته الحالية (Dr مصروفات عامة / Cr صندوق|بنك|ذمم موردين).
 * يُرجع null إذا كانت القيمة صفرًا. مصدر واحد للترحيل الأولي (postExpenseToGL) والتصحيح
 * غير الحذفي (repostExpenseToGL).
 */
async function buildExpenseGLPosting(tx: Tx, expenseId: number): Promise<ExpenseGLPosting | null> {
  const expense = await tx.expense.findUnique({ where: { id: expenseId } });
  if (!expense) throw AppError.notFound('المصروف غير موجود');

  const amount = round3(expense.amount);
  if (amount <= 0) return null;

  await ensureSystemAccounts(tx);
  const accounts = await getSystemAccounts(tx);
  const expenseAccId = requireAccount(accounts, SYSTEM_ACCOUNT_CODES.GENERAL_EXPENSE);

  const paymentMethod = (expense as Record<string, unknown>)['paymentMethod'] as string ?? 'CASH';
  const creditCode =
    paymentMethod === 'BANK'             ? SYSTEM_ACCOUNT_CODES.BANK :
    paymentMethod === 'ACCOUNTS_PAYABLE' ? SYSTEM_ACCOUNT_CODES.ACCOUNTS_PAYABLE :
    SYSTEM_ACCOUNT_CODES.CASH;
  const creditAccId = requireAccount(accounts, creditCode);
  const creditLabel = glPaymentMethodAr(paymentMethod);

  return {
    date: expense.date,
    description: `مصروف: ${expense.description}`,
    lines: [
      { accountId: expenseAccId, debit: amount, credit: 0, description: `مصروف عام — ${expense.description}` },
      { accountId: creditAccId, debit: 0, credit: amount, description: `${creditLabel} — ${expense.code}` },
    ],
  };
}

/**
 * Re-export createBalancedJournal under the legacy name for backward compatibility
 * with tests and any callers that import directly from this file.
 */
export { createBalancedJournal as createBalancedJournalEntry } from '../../shared/services/gl.service';

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
  const posting = await buildExpenseGLPosting(tx, expenseId);
  if (!posting) return;

  // حارس الترحيل المزدوج: أي نسخة سابقة ⇒ لا تُرحّل مجددًا.
  const existing = await tx.journalEntry.findFirst({
    where: { referenceType: GL_REFERENCE_TYPES.EXPENSE, referenceId: expenseId },
  });
  if (existing) return;

  await createBalancedJournal(tx, {
    date: posting.date,
    description: posting.description,
    referenceType: GL_REFERENCE_TYPES.EXPENSE,
    referenceId: expenseId,
    revision: 1,
    lines: posting.lines,
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

/**
 * ترحيل/إعادة ترحيل قيد المصروف — **غير حذفي** (يماثل repostInvoiceToGL).
 *
 * لم يعد يحذف القيود بـ deleteMany. الآن عبر supersedeBalancedJournal: يعكس النسخة الحيّة
 * (إن وُجدت) ثم يُرحّل نسخة جديدة برقم نسخة أعلى. الأصل + العكس + النسخة الجديدة تبقى في
 * الدفتر، وصافيها = القيمة المصحّحة. مفتاح التفرّد (referenceType, referenceId, revision)
 * يسمح بتعايش النُسَخ. عند الاعتماد الأول (لا نسخة سابقة) يُرحّل النسخة 1 مباشرةً.
 */
export async function repostExpenseToGL(tx: Tx, expenseId: number): Promise<void> {
  const posting = await buildExpenseGLPosting(tx, expenseId);
  if (!posting) {
    // القيمة الجديدة صفر → اعكس النسخة الحيّة بلا ترحيل جديد.
    await reverseGL(tx, GL_REFERENCE_TYPES.EXPENSE, expenseId, GL_REFERENCE_TYPES.EXPENSE_REVERSAL);
    return;
  }
  await supersedeBalancedJournal(tx, {
    baseType: GL_REFERENCE_TYPES.EXPENSE,
    reversalType: GL_REFERENCE_TYPES.EXPENSE_REVERSAL,
    referenceId: expenseId,
    date: posting.date,
    description: posting.description,
    lines: posting.lines,
  });
}
