import { Prisma } from '@prisma/client';
import { AppError } from '../../core/errors/AppError';

type Tx = Prisma.TransactionClient;

export type JournalLine = {
  accountId: number;
  debit: number;
  credit: number;
  description: string;
};

export const round3 = (n: number) => Math.round((n + Number.EPSILON) * 1000) / 1000;

/**
 * توليد رقم قيد يومية فريد بصيغة JRN-<السنة>-<تسلسل>.
 * يستخدم أقصى id موجود (MAX عبر orderBy id desc) بدلاً من COUNT
 * لتجنّب التعارض عند حذف قيود وسطية وإعادة الترحيل.
 */
export async function generateEntryNumber(tx: Tx): Promise<string> {
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
 * يرمي خطأً قبل الكتابة إذا |ΔDebit - ΔCredit| > 0.001 (دقة الدينار الكويتي 3dp).
 * يُستخدم من جميع وحدات GL (المصروفات، الفواتير، الرواتب).
 */
export async function createBalancedJournal(
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
 * يتحقق من وجود قيد سابق لنفس (referenceType, referenceId).
 * يُعيد true إذا كان الترحيل موجودًا (يجب تجاهل الترحيل المزدوج).
 */
export async function checkDuplicatePosting(
  tx: Tx,
  referenceType: string,
  referenceId: number,
): Promise<boolean> {
  const existing = await tx.journalEntry.findFirst({
    where: { referenceType, referenceId },
    select: { id: true },
  });
  return existing !== null;
}

/**
 * ينشئ قيدًا عكسيًا متوازنًا لقيد أصلي موجود.
 * - لا يحذف القيد الأصلي (للحفاظ على أثر التدقيق).
 * - محمي من التكرار: لا ينشئ العكس إذا كان موجودًا مسبقًا.
 * - يُعيد بصمت إذا لم يُرحَّل القيد الأصلي أصلًا.
 *
 * @param referenceType   نوع المرجع الأصلي (مثلاً 'EXPENSE')
 * @param referenceId     معرّف المرجع الأصلي
 * @param reversalType    نوع القيد العكسي (مثلاً 'EXPENSE_REVERSAL')
 */
export async function reverseGL(
  tx: Tx,
  referenceType: string,
  referenceId: number,
  reversalType: string,
): Promise<void> {
  const original = await tx.journalEntry.findFirst({
    where: { referenceType, referenceId, status: 'POSTED' },
    include: { lines: { select: { accountId: true, debit: true, credit: true, description: true } } },
  });
  if (!original) return; // لم يُرحَّل — لا شيء للعكس

  const existingReversal = await tx.journalEntry.findFirst({
    where: { referenceType: reversalType, referenceId },
    select: { id: true },
  });
  if (existingReversal) return; // العكس موجود بالفعل

  await createBalancedJournal(tx, {
    date: new Date(),
    description: `عكس قيد ${referenceType} #${referenceId}`,
    referenceType: reversalType,
    referenceId,
    lines: original.lines.map((line) => ({
      accountId: line.accountId,
      debit: line.credit,   // مقلوب
      credit: line.debit,   // مقلوب
      description: `عكس: ${line.description ?? ''}`.trim(),
    })),
  });
}

/**
 * دليل تسمية أنواع مرجع GL المستخدمة في النظام.
 * يُستخدم للتوثيق والتحقق المستقبلي.
 */
export const GL_REFERENCE_TYPES = {
  EXPENSE: 'EXPENSE',
  EXPENSE_REVERSAL: 'EXPENSE_REVERSAL',
  INVOICE: 'INVOICE',
  INVOICE_REVERSAL: 'INVOICE_REVERSAL',
  PURCHASE_INVOICE: 'PURCHASE_INVOICE',
  PURCHASE_INVOICE_REVERSAL: 'PURCHASE_INVOICE_REVERSAL',
  PAYMENT: 'PAYMENT',
  PAYROLL: 'PAYROLL',
  PAYROLL_REVERSAL: 'PAYROLL_REVERSAL',
} as const;
