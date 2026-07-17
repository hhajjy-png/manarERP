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

type Tx = Prisma.TransactionClient;

/**
 * Re-export createBalancedJournalEntry for backward compatibility
 * with any callers that import directly from this file.
 */
export { createBalancedJournal as createBalancedJournalEntry } from '../../shared/services/gl.service';

// ─────────────────────────────────────────────────────────────────────────────
// Invoice GL — unified posting spec builder (single source for post & repost)
// ─────────────────────────────────────────────────────────────────────────────

const PURCHASE_PAYMENT_LABELS: Record<string, string> = {
  CASH: 'صرف نقدي',
  BANK: 'تحويل بنكي',
  ACCOUNTS_PAYABLE: 'ذمم مورد',
};

/** مواصفة قيد الفاتورة: النوع الأساس + نوع العكس + الأسطر — يبنيها مصدر واحد. */
type InvoiceGLPosting = {
  baseType: string;
  reversalType: string;
  date: Date;
  description: string;
  lines: JournalLine[];
};

/**
 * يبني مواصفة قيد اليومية للفاتورة (بيع أو شراء) من حالتها الحالية.
 * مصدر واحد يستهلكه الترحيل الأولي (postInvoiceToGL) والتصحيح غير الحذفي
 * (repostInvoiceToGL) معًا — فلا يتباعد منطق البناء بين المسارين.
 *
 * يُرجع null إذا كانت الفاتورة ملغاة أو قيمتها صفر (لا قيد).
 *
 * مبيعات:  Dr ذمم العملاء (1100) / Cr إيرادات المبيعات (4000)
 * مشتريات: Dr المشتريات (5000)   / Cr الصندوق|البنك|ذمم الموردين حسب paymentMethod
 */
async function buildInvoiceGLPosting(tx: Tx, invoiceId: number): Promise<InvoiceGLPosting | null> {
  const invoice = await tx.invoice.findUnique({ where: { id: invoiceId } });
  if (!invoice) throw AppError.notFound('الفاتورة غير موجودة');
  if (invoice.status === 'CANCELLED') return null;

  const amount = round3(invoice.total);
  if (amount <= 0) return null;

  await ensureSystemAccounts(tx);
  const accounts = await getSystemAccounts(tx);

  if (invoice.direction === 'SALES') {
    const arId = requireAccount(accounts, SYSTEM_ACCOUNT_CODES.ACCOUNTS_RECEIVABLE);
    const revenueId = requireAccount(accounts, SYSTEM_ACCOUNT_CODES.SALES_REVENUE);
    return {
      baseType: GL_REFERENCE_TYPES.INVOICE,
      reversalType: 'INVOICE_REVERSAL',
      date: invoice.issueDate ?? new Date(),
      description: `قيد فاتورة مبيعات ${invoice.invoiceNumber}`,
      lines: [
        { accountId: arId, debit: amount, credit: 0, description: `مديونية العميل — فاتورة ${invoice.invoiceNumber}` },
        { accountId: revenueId, debit: 0, credit: amount, description: `إيرادات مبيعات — فاتورة ${invoice.invoiceNumber}` },
      ],
    };
  }

  if (invoice.direction === 'PURCHASE') {
    const purchasesId = requireAccount(accounts, SYSTEM_ACCOUNT_CODES.PURCHASES);
    const paymentMethod = (invoice as Record<string, unknown>)['paymentMethod'] as string | null ?? 'ACCOUNTS_PAYABLE';
    const creditCode =
      paymentMethod === 'CASH' ? SYSTEM_ACCOUNT_CODES.CASH :
      paymentMethod === 'BANK' ? SYSTEM_ACCOUNT_CODES.BANK :
      SYSTEM_ACCOUNT_CODES.ACCOUNTS_PAYABLE; // default — فاتورة مورد مستحقة الدفع
    const creditAccId = requireAccount(accounts, creditCode);
    const creditLabel = PURCHASE_PAYMENT_LABELS[paymentMethod] ?? 'ذمم مورد';
    return {
      baseType: GL_REFERENCE_TYPES.PURCHASE_INVOICE,
      reversalType: GL_REFERENCE_TYPES.PURCHASE_INVOICE_REVERSAL,
      date: invoice.issueDate ?? new Date(),
      description: `قيد فاتورة مشتريات ${invoice.invoiceNumber}`,
      lines: [
        { accountId: purchasesId, debit: amount, credit: 0, description: `مشتريات — فاتورة ${invoice.invoiceNumber}` },
        { accountId: creditAccId, debit: 0, credit: amount, description: `${creditLabel} — فاتورة ${invoice.invoiceNumber}` },
      ],
    };
  }

  return null;
}

/**
 * ترحيل أولي لقيد فاتورة مشتريات — محمي من الترحيل المزدوج (أي نسخة موجودة ⇒ تجاهل).
 * يُستدعى عند الإنشاء ومن مسار الاعتماد (approve). idempotent.
 */
export async function postPurchaseInvoiceToGL(tx: Tx, invoiceId: number): Promise<void> {
  const posting = await buildInvoiceGLPosting(tx, invoiceId);
  if (!posting || posting.baseType !== GL_REFERENCE_TYPES.PURCHASE_INVOICE) return;
  const existing = await tx.journalEntry.findFirst({
    where: { referenceType: posting.baseType, referenceId: invoiceId },
  });
  if (existing) return;
  await createBalancedJournal(tx, {
    date: posting.date,
    description: posting.description,
    referenceType: posting.baseType,
    referenceId: invoiceId,
    revision: 1,
    lines: posting.lines,
  });
}

/**
 * عكس القيد المحاسبي لفاتورة مشتريات (عند الإلغاء/الحذف القسري).
 */
export async function reversePurchaseInvoiceGL(tx: Tx, invoiceId: number): Promise<void> {
  await reverseGL(
    tx,
    GL_REFERENCE_TYPES.PURCHASE_INVOICE,
    invoiceId,
    GL_REFERENCE_TYPES.PURCHASE_INVOICE_REVERSAL,
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Public unified entry point
// ─────────────────────────────────────────────────────────────────────────────

/**
 * نقطة دخول موحدة لترحيل GL حسب اتجاه الفاتورة:
 *   SALES   → postSalesInvoiceToGL  (Dr AR, Cr Revenue)
 *   PURCHASE → postPurchaseInvoiceToGL (Dr Purchases, Cr Cash/Bank/AP)
 */
export async function postInvoiceToGL(tx: Tx, invoiceId: number): Promise<void> {
  const posting = await buildInvoiceGLPosting(tx, invoiceId);
  if (!posting) return;
  // حارس الترحيل المزدوج: أي نسخة سابقة من نفس النوع الأساس ⇒ لا تُرحّل مجددًا.
  const existing = await tx.journalEntry.findFirst({
    where: { referenceType: posting.baseType, referenceId: invoiceId },
  });
  if (existing) return;
  await createBalancedJournal(tx, {
    date: posting.date,
    description: posting.description,
    referenceType: posting.baseType,
    referenceId: invoiceId,
    revision: 1,
    lines: posting.lines,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Payment GL
// ─────────────────────────────────────────────────────────────────────────────

/**
 * ترحيل قيد يومية مزدوج لسداد مورّد (فواتير المشتريات):
 *   Dr ذمم الموردين (2000) — مدين (تسوية الالتزام)
 *   Cr الصندوق/البنك (1000/1010) — دائن (خروج النقد)
 * محمي من الترحيل المزدوج عبر (referenceType='PURCHASE_PAYMENT', referenceId).
 */
export async function postPurchasePaymentToGL(tx: Tx, paymentId: number): Promise<void> {
  const payment = await tx.payment.findUnique({
    where: { id: paymentId },
    include: { invoice: { select: { direction: true, invoiceNumber: true } } },
  });
  if (!payment) throw AppError.notFound('الدفعة غير موجودة');
  if (!payment.invoice || payment.invoice.direction !== 'PURCHASE') return;

  const amount = round3(payment.amount);
  if (amount <= 0) return;

  const existing = await tx.journalEntry.findFirst({
    where: { referenceType: GL_REFERENCE_TYPES.PURCHASE_PAYMENT, referenceId: paymentId },
  });
  if (existing) return;

  await ensureSystemAccounts(tx);
  const accounts = await getSystemAccounts(tx);
  const apId = requireAccount(accounts, SYSTEM_ACCOUNT_CODES.ACCOUNTS_PAYABLE);
  const cashCode = payment.method === 'BANK' || payment.method === 'TRANSFER'
    ? SYSTEM_ACCOUNT_CODES.BANK
    : SYSTEM_ACCOUNT_CODES.CASH;
  const cashId = requireAccount(accounts, cashCode);
  const ref = payment.invoice.invoiceNumber ?? `#${paymentId}`;

  await createBalancedJournal(tx, {
    date: payment.date ?? new Date(),
    description: `قيد سداد مورد — فاتورة ${ref}`,
    referenceType: GL_REFERENCE_TYPES.PURCHASE_PAYMENT,
    referenceId: paymentId,
    lines: [
      { accountId: apId, debit: amount, credit: 0, description: `تسوية ذمم المورد — فاتورة ${ref}` },
      { accountId: cashId, debit: 0, credit: amount, description: `سداد نقدي/بنكي — فاتورة ${ref}` },
    ],
  });
}

/**
 * عكس قيد سداد مورد (عند حذف الفاتورة أو الدفعة).
 */
export async function reversePurchasePaymentGL(tx: Tx, paymentId: number): Promise<void> {
  await reverseGL(
    tx,
    GL_REFERENCE_TYPES.PURCHASE_PAYMENT,
    paymentId,
    GL_REFERENCE_TYPES.PURCHASE_PAYMENT_REVERSAL,
  );
}

/**
 * عكس قيد تحصيل دفعة مبيعات (عند الحذف النهائي للفاتورة) — بديل غير حذفي لمسح القيد.
 * كان تحصيل المبيعات يُمحى فقط ولا يُعكَس (لا وجود لنوع PAYMENT_REVERSAL) — أُضيف الآن
 * لتماثل مسار المشتريات ويكتمل أثر التدقيق.
 */
export async function reverseSalesPaymentGL(tx: Tx, paymentId: number): Promise<void> {
  await reverseGL(tx, GL_REFERENCE_TYPES.PAYMENT, paymentId, GL_REFERENCE_TYPES.PAYMENT_REVERSAL);
}

/**
 * ترحيل قيد يومية مزدوج لتحصيل دفعة (مبيعات فقط):
 *   Dr الصندوق/البنك (مدين) → Cr ذمم العملاء (دائن).
 * محمي من الترحيل المزدوج عبر (referenceType='PAYMENT', referenceId).
 */
export async function postPaymentToGL(tx: Tx, paymentId: number): Promise<void> {
  const payment = await tx.payment.findUnique({
    where: { id: paymentId },
    include: { invoice: { select: { direction: true, invoiceNumber: true } } },
  });
  if (!payment) throw AppError.notFound('الدفعة غير موجودة');

  // تحصيلات فواتير المبيعات فقط
  if (payment.invoice && payment.invoice.direction !== 'SALES') return;

  const amount = round3(payment.amount);
  if (amount <= 0) return;

  const existing = await tx.journalEntry.findFirst({
    where: { referenceType: GL_REFERENCE_TYPES.PAYMENT, referenceId: paymentId },
  });
  if (existing) return;

  await ensureSystemAccounts(tx);
  const accounts = await getSystemAccounts(tx);
  const cashCode = payment.method === 'BANK' || payment.method === 'TRANSFER'
    ? SYSTEM_ACCOUNT_CODES.BANK
    : SYSTEM_ACCOUNT_CODES.CASH;
  const cashId = requireAccount(accounts, cashCode);
  const arId = requireAccount(accounts, SYSTEM_ACCOUNT_CODES.ACCOUNTS_RECEIVABLE);
  const ref = payment.invoice?.invoiceNumber ?? `#${paymentId}`;

  await createBalancedJournal(tx, {
    date: payment.date ?? new Date(),
    description: `قيد تحصيل دفعة — فاتورة ${ref}`,
    referenceType: GL_REFERENCE_TYPES.PAYMENT,
    referenceId: paymentId,
    lines: [
      { accountId: cashId, debit: amount, credit: 0, description: `تحصيل نقدي/بنكي — فاتورة ${ref}` },
      { accountId: arId, debit: 0, credit: amount, description: `تسوية مديونية العميل — فاتورة ${ref}` },
    ],
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Reversal helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * إعادة ترحيل قيد فاتورة بعد التعديل — **غير حذفي**.
 *
 * لم يعد يحذف القيود السابقة (كان `deleteMany` يمحو قيودًا مُرحَّلة ويكسر لا-تغيّر الدفتر).
 * الآن: يعكس النسخة الحيّة الحالية ثم يُرحّل نسخة جديدة بالقيمة المصحّحة عبر
 * `supersedeBalancedJournal`. الأصل + العكس + النسخة الجديدة تبقى كلها في الدفتر،
 * وصافيها = الفاتورة بعد التعديل. أثر التدقيق كامل.
 */
export async function repostInvoiceToGL(tx: Tx, invoiceId: number): Promise<void> {
  const posting = await buildInvoiceGLPosting(tx, invoiceId);

  // اعكس النسخة الحيّة لأي نوع أساس لا يطابق الاتجاه الجديد — يغطّي تغيّر الاتجاه
  // (مبيعات↔مشتريات، نادر) وحالة الإلغاء/الصفر (posting=null ⇒ اعكس النوعين بلا ترحيل جديد).
  if (!posting || posting.baseType !== GL_REFERENCE_TYPES.INVOICE) {
    await reverseGL(tx, GL_REFERENCE_TYPES.INVOICE, invoiceId, 'INVOICE_REVERSAL');
  }
  if (!posting || posting.baseType !== GL_REFERENCE_TYPES.PURCHASE_INVOICE) {
    await reverseGL(tx, GL_REFERENCE_TYPES.PURCHASE_INVOICE, invoiceId, GL_REFERENCE_TYPES.PURCHASE_INVOICE_REVERSAL);
  }
  if (!posting) return;

  await supersedeBalancedJournal(tx, {
    baseType: posting.baseType,
    reversalType: posting.reversalType,
    referenceId: invoiceId,
    date: posting.date,
    description: posting.description,
    lines: posting.lines,
  });
}

/**
 * عكس القيد المحاسبي لفاتورة مبيعات (عند الإلغاء/الحذف القسري).
 */
export async function reverseInvoiceFromGL(tx: Tx, invoiceId: number): Promise<void> {
  await reverseGL(tx, GL_REFERENCE_TYPES.INVOICE, invoiceId, 'INVOICE_REVERSAL');
}
