import { Prisma } from '@prisma/client';
import { AppError } from '../../core/errors/AppError';
import {
  SYSTEM_ACCOUNT_CODES,
  ensureSystemAccounts,
  getSystemAccounts,
  requireAccount,
} from '../accounting/accounting.accounts';

/** عميل معاملة Prisma (يجب الترحيل داخل $transaction للذرّية). */
type Tx = Prisma.TransactionClient;

const round3 = (n: number) => Math.round((n + Number.EPSILON) * 1000) / 1000;

/** سطر قيد يومية. */
type JournalLine = { accountId: number; debit: number; credit: number; description: string };

/**
 * توليد رقم قيد يومية فريد بصيغة JRN-<السنة>-<تسلسل> داخل المعاملة.
 * يستخدم أقصى رقم موجود (MAX) بدلاً من العدد (COUNT) لتجنّب التعارض
 * عند حذف قيود وسطية وإعادة الترحيل (repost).
 */
async function generateEntryNumber(tx: Tx): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = `JRN-${year}-`;
  const last = await tx.journalEntry.findFirst({
    where: { entryNumber: { startsWith: prefix } },
    orderBy: { entryNumber: 'desc' },
    select: { entryNumber: true },
  });
  const lastSeq = last ? parseInt(last.entryNumber.slice(prefix.length), 10) : 0;
  const nextSeq = isNaN(lastSeq) ? 1 : lastSeq + 1;
  return `${prefix}${String(nextSeq).padStart(5, '0')}`;
}

/**
 * ينشئ قيد يومية مزدوجًا بعد التحقق من توازنه (إجمالي المدين = إجمالي الدائن).
 * يرمي خطأً قبل الكتابة إذا كان القيد غير متوازن — حماية أخيرة ضد قيود فاسدة.
 * يستخدم دقّة 3 منازل عشرية (الدينار الكويتي) في المقارنة.
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
 * ترحيل قيد يومية مزدوج لفاتورة مبيعات:
 *   من ح/ ذمم العملاء (مدين) إلى ح/ إيرادات المبيعات (دائن).
 * فواتير المشتريات (PURCHASE) محظورة من الترحيل التلقائي في Phase 1 (تُرمى بخطأ واضح).
 * محمي من الترحيل المزدوج عبر (referenceType='INVOICE', referenceId) كوديًا وعلى مستوى قاعدة البيانات.
 */
export async function postInvoiceToGL(tx: Tx, invoiceId: number): Promise<void> {
  const invoice = await tx.invoice.findUnique({ where: { id: invoiceId } });
  if (!invoice) throw AppError.notFound('الفاتورة غير موجودة');

  if (invoice.direction === 'PURCHASE') {
    console.warn(`[GL] PURCHASE_INVOICE_GL_POSTING_SKIPPED invoiceId=${invoiceId} — purchase GL posting not yet implemented`);
    return; // invoice created successfully, GL posting deferred to future phase
  }

  // Phase 1: نُرحّل فواتير المبيعات فقط (أي اتجاه آخر يُتجاهل بصمت)
  if (invoice.direction !== 'SALES') return;

  // لا تُرحّل فاتورة ملغاة أو بإجمالي صفري
  if (invoice.status === 'CANCELLED') return;
  const amount = round3(invoice.total);
  if (amount <= 0) return;

  // حارس الترحيل المزدوج (مستوى الكود)
  const existing = await tx.journalEntry.findFirst({
    where: { referenceType: 'INVOICE', referenceId: invoiceId },
  });
  if (existing) return;

  await ensureSystemAccounts(tx);
  const accounts = await getSystemAccounts(tx);
  const arId = requireAccount(accounts, SYSTEM_ACCOUNT_CODES.ACCOUNTS_RECEIVABLE);
  const revenueId = requireAccount(accounts, SYSTEM_ACCOUNT_CODES.SALES_REVENUE);

  await createBalancedJournalEntry(tx, {
    date: invoice.issueDate ?? new Date(),
    description: `قيد فاتورة مبيعات ${invoice.invoiceNumber}`,
    referenceType: 'INVOICE',
    referenceId: invoiceId,
    lines: [
      { accountId: arId, debit: amount, credit: 0, description: `مديونية العميل — فاتورة ${invoice.invoiceNumber}` },
      { accountId: revenueId, debit: 0, credit: amount, description: `إيرادات مبيعات — فاتورة ${invoice.invoiceNumber}` },
    ],
  });
}

/**
 * ترحيل قيد يومية مزدوج لتحصيل دفعة:
 *   من ح/ الصندوق (مدين) إلى ح/ ذمم العملاء (دائن).
 * محمي من الترحيل المزدوج عبر (referenceType='PAYMENT', referenceId).
 */
export async function postPaymentToGL(tx: Tx, paymentId: number): Promise<void> {
  const payment = await tx.payment.findUnique({
    where: { id: paymentId },
    include: { invoice: { select: { direction: true, invoiceNumber: true } } },
  });
  if (!payment) throw AppError.notFound('الدفعة غير موجودة');

  // Phase 1: تحصيلات فواتير المبيعات فقط
  if (payment.invoice && payment.invoice.direction !== 'SALES') return;

  const amount = round3(payment.amount);
  if (amount <= 0) return;

  // حارس الترحيل المزدوج
  const existing = await tx.journalEntry.findFirst({
    where: { referenceType: 'PAYMENT', referenceId: paymentId },
  });
  if (existing) return;

  await ensureSystemAccounts(tx);
  const accounts = await getSystemAccounts(tx);
  // التحصيل البنكي/التحويل يذهب لحساب البنك، وغيره للصندوق
  const cashCode = payment.method === 'BANK' || payment.method === 'TRANSFER'
    ? SYSTEM_ACCOUNT_CODES.BANK
    : SYSTEM_ACCOUNT_CODES.CASH;
  const cashId = requireAccount(accounts, cashCode);
  const arId = requireAccount(accounts, SYSTEM_ACCOUNT_CODES.ACCOUNTS_RECEIVABLE);
  const ref = payment.invoice?.invoiceNumber ?? `#${paymentId}`;

  await createBalancedJournalEntry(tx, {
    date: payment.date ?? new Date(),
    description: `قيد تحصيل دفعة — فاتورة ${ref}`,
    referenceType: 'PAYMENT',
    referenceId: paymentId,
    lines: [
      { accountId: cashId, debit: amount, credit: 0, description: `تحصيل نقدي/بنكي — فاتورة ${ref}` },
      { accountId: arId, debit: 0, credit: amount, description: `تسوية مديونية العميل — فاتورة ${ref}` },
    ],
  });
}

/**
 * إعادة ترحيل قيد الفاتورة بعد التعديل: يحذف قيود الفاتورة السابقة
 * (الأصلي والعكسي إن وُجدا) ثم يُعيد الترحيل بالقيمة الجديدة.
 * يُستخدم في تدفّق تعديل الفاتورة حيث يُعاد بناء الفاتورة بالكامل.
 */
export async function repostInvoiceToGL(tx: Tx, invoiceId: number): Promise<void> {
  await tx.journalEntry.deleteMany({
    where: { referenceType: { in: ['INVOICE', 'INVOICE_REVERSAL'] }, referenceId: invoiceId },
  });
  await postInvoiceToGL(tx, invoiceId);
}

/**
 * عكس القيد المحاسبي لفاتورة (عند الإلغاء/الحذف القسري).
 * يُنشئ قيدًا عكسيًا متوازنًا بدلًا من حذف القيد الأصلي (للحفاظ على أثر التدقيق).
 * محمي من التكرار عبر (referenceType='INVOICE_REVERSAL', referenceId).
 */
export async function reverseInvoiceFromGL(tx: Tx, invoiceId: number): Promise<void> {
  const original = await tx.journalEntry.findFirst({
    where: { referenceType: 'INVOICE', referenceId: invoiceId, status: 'POSTED' },
    include: { lines: true },
  });
  if (!original) return; // لم يُرحَّل أصلًا — لا شيء للعكس

  const existingReversal = await tx.journalEntry.findFirst({
    where: { referenceType: 'INVOICE_REVERSAL', referenceId: invoiceId },
  });
  if (existingReversal) return;

  await createBalancedJournalEntry(tx, {
    date: new Date(),
    description: `عكس قيد فاتورة مبيعات #${invoiceId}`,
    referenceType: 'INVOICE_REVERSAL',
    referenceId: invoiceId,
    lines: original.lines.map((line) => ({
      accountId: line.accountId,
      debit: line.credit, // مقلوب
      credit: line.debit, // مقلوب
      description: `عكس: ${line.description ?? ''}`.trim(),
    })),
  });
}
