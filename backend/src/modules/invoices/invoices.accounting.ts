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
 * Re-export createBalancedJournalEntry for backward compatibility
 * with any callers that import directly from this file.
 */
export { createBalancedJournal as createBalancedJournalEntry } from '../../shared/services/gl.service';

// ─────────────────────────────────────────────────────────────────────────────
// Sales Invoice GL
// ─────────────────────────────────────────────────────────────────────────────

/**
 * ترحيل قيد يومية مزدوج لفاتورة مبيعات:
 *   Dr ذمم العملاء (1100) — مدين
 *   Cr إيرادات المبيعات (4000) — دائن
 *
 * محمي من الترحيل المزدوج كوديًا وعلى مستوى قاعدة البيانات.
 */
async function postSalesInvoiceToGL(tx: Tx, invoiceId: number, invoice: {
  invoiceNumber: string;
  total: number;
  issueDate: Date | null;
}): Promise<void> {
  const amount = round3(invoice.total);
  if (amount <= 0) return;

  const existing = await tx.journalEntry.findFirst({
    where: { referenceType: GL_REFERENCE_TYPES.INVOICE, referenceId: invoiceId },
  });
  if (existing) return;

  await ensureSystemAccounts(tx);
  const accounts = await getSystemAccounts(tx);
  const arId = requireAccount(accounts, SYSTEM_ACCOUNT_CODES.ACCOUNTS_RECEIVABLE);
  const revenueId = requireAccount(accounts, SYSTEM_ACCOUNT_CODES.SALES_REVENUE);

  await createBalancedJournal(tx, {
    date: invoice.issueDate ?? new Date(),
    description: `قيد فاتورة مبيعات ${invoice.invoiceNumber}`,
    referenceType: GL_REFERENCE_TYPES.INVOICE,
    referenceId: invoiceId,
    lines: [
      { accountId: arId, debit: amount, credit: 0, description: `مديونية العميل — فاتورة ${invoice.invoiceNumber}` },
      { accountId: revenueId, debit: 0, credit: amount, description: `إيرادات مبيعات — فاتورة ${invoice.invoiceNumber}` },
    ],
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Purchase Invoice GL (Part 2 — Phase D)
// ─────────────────────────────────────────────────────────────────────────────

const PURCHASE_PAYMENT_LABELS: Record<string, string> = {
  CASH: 'صرف نقدي',
  BANK: 'تحويل بنكي',
  ACCOUNTS_PAYABLE: 'ذمم مورد',
};

/**
 * ترحيل قيد يومية مزدوج لفاتورة مشتريات:
 *   Dr المشتريات (5000) — مدين  (جميع أنواع فواتير الموردين)
 *   Cr يُحدَّد بناءً على paymentMethod:
 *       CASH           → الصندوق (1000)
 *       BANK           → البنك (1010)
 *       ACCOUNTS_PAYABLE → ذمم الموردين (2000) [الافتراضي]
 *
 * يُستدعى عند إنشاء فاتورة مشتريات جديدة.
 * محمي من الترحيل المزدوج عبر (referenceType='PURCHASE_INVOICE', referenceId).
 */
export async function postPurchaseInvoiceToGL(tx: Tx, invoiceId: number): Promise<void> {
  const invoice = await tx.invoice.findUnique({ where: { id: invoiceId } });
  if (!invoice) throw AppError.notFound('الفاتورة غير موجودة');
  if (invoice.direction !== 'PURCHASE') return;
  if (invoice.status === 'CANCELLED') return;

  const amount = round3(invoice.total);
  if (amount <= 0) return;

  // حارس الترحيل المزدوج
  const existing = await tx.journalEntry.findFirst({
    where: { referenceType: GL_REFERENCE_TYPES.PURCHASE_INVOICE, referenceId: invoiceId },
  });
  if (existing) return;

  await ensureSystemAccounts(tx);
  const accounts = await getSystemAccounts(tx);
  const purchasesId = requireAccount(accounts, SYSTEM_ACCOUNT_CODES.PURCHASES);

  const paymentMethod = (invoice as Record<string, unknown>)['paymentMethod'] as string | null ?? 'ACCOUNTS_PAYABLE';
  const creditCode =
    paymentMethod === 'CASH' ? SYSTEM_ACCOUNT_CODES.CASH :
    paymentMethod === 'BANK' ? SYSTEM_ACCOUNT_CODES.BANK :
    SYSTEM_ACCOUNT_CODES.ACCOUNTS_PAYABLE; // default — فاتورة مورد مستحقة الدفع
  const creditAccId = requireAccount(accounts, creditCode);
  const creditLabel = PURCHASE_PAYMENT_LABELS[paymentMethod] ?? 'ذمم مورد';

  await createBalancedJournal(tx, {
    date: invoice.issueDate ?? new Date(),
    description: `قيد فاتورة مشتريات ${invoice.invoiceNumber}`,
    referenceType: GL_REFERENCE_TYPES.PURCHASE_INVOICE,
    referenceId: invoiceId,
    lines: [
      { accountId: purchasesId, debit: amount, credit: 0, description: `مشتريات — فاتورة ${invoice.invoiceNumber}` },
      { accountId: creditAccId, debit: 0, credit: amount, description: `${creditLabel} — فاتورة ${invoice.invoiceNumber}` },
    ],
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
  const invoice = await tx.invoice.findUnique({ where: { id: invoiceId } });
  if (!invoice) throw AppError.notFound('الفاتورة غير موجودة');

  if (invoice.direction === 'PURCHASE') {
    await postPurchaseInvoiceToGL(tx, invoiceId);
    return;
  }

  if (invoice.direction !== 'SALES') return;
  if (invoice.status === 'CANCELLED') return;

  await postSalesInvoiceToGL(tx, invoiceId, {
    invoiceNumber: invoice.invoiceNumber,
    total: invoice.total,
    issueDate: invoice.issueDate,
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
 * إعادة ترحيل قيد فاتورة مبيعات بعد التعديل:
 * يحذف القيود السابقة ثم يُعيد الترحيل بالقيمة الجديدة.
 */
export async function repostInvoiceToGL(tx: Tx, invoiceId: number): Promise<void> {
  await tx.journalEntry.deleteMany({
    where: {
      referenceType: {
        in: [
          GL_REFERENCE_TYPES.INVOICE,
          'INVOICE_REVERSAL',
          GL_REFERENCE_TYPES.PURCHASE_INVOICE,
          GL_REFERENCE_TYPES.PURCHASE_INVOICE_REVERSAL,
        ],
      },
      referenceId: invoiceId,
    },
  });
  await postInvoiceToGL(tx, invoiceId);
}

/**
 * عكس القيد المحاسبي لفاتورة مبيعات (عند الإلغاء/الحذف القسري).
 */
export async function reverseInvoiceFromGL(tx: Tx, invoiceId: number): Promise<void> {
  await reverseGL(tx, GL_REFERENCE_TYPES.INVOICE, invoiceId, 'INVOICE_REVERSAL');
}
