import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * تحديث مفقود عند تسجيل دفعتين متزامنتين.
 *
 * كانت `addPayment` تقرأ الفاتورة وتحسب `newPaid` **قبل** المعاملة، ثم تكتب `paidAmount`
 * قيمةً مطلقة مشتقّة من تلك القراءة. فإرسالان متداخلان (نقرة مزدوجة أو مستخدمان) يقرآن
 * كلاهما `paidAmount = 0` فيكتبان معًا 100 بينما أُنشئت دفعتان بـ100 لكلٍّ منهما:
 * `Σ payments.amount = 200` مقابل `invoice.paidAmount = 100` — انحراف دائم بين ما تقرؤه
 * الأعمار والكشوف وما تعرضه الفاتورة، مع رصيد مستحق لم يعد قائمًا.
 *
 * الاختبار يحاكي التداخل: القراءة الأولى (خارج المعاملة سابقًا) تُظهر 0، بينما القراءة
 * داخل المعاملة تُظهر 100 لأن الدفعة المتزامنة رُحّلت بالفعل. القيمة المكتوبة يجب أن
 * تُشتقّ من قراءة **المعاملة** لا من القراءة السابقة لها.
 */

const txInvoice = { invoice: { findUnique: vi.fn(), update: vi.fn() }, payment: { create: vi.fn() } };

const prismaMock = {
  invoice: { findUnique: vi.fn(), update: vi.fn() },
  payment: { create: vi.fn() },
  $transaction: vi.fn(async (cb: (tx: unknown) => unknown) => cb(txInvoice)),
};

vi.mock('../../../config/database', () => ({ prisma: prismaMock }));
vi.mock('../../../core/middleware/audit', () => ({ recordAudit: vi.fn() }));
vi.mock('../../../shared/services/historicalEntry.service', () => ({ recordHistoricalEntry: vi.fn() }));
vi.mock('../invoices.accounting', () => ({
  postInvoiceToGL: vi.fn(),
  repostInvoiceToGL: vi.fn(),
  reverseInvoiceFromGL: vi.fn(),
  postPaymentToGL: vi.fn(),
  postPurchasePaymentToGL: vi.fn(),
  reversePaymentGL: vi.fn(),
  reversePurchasePaymentGL: vi.fn(),
}));

const BASE_INVOICE = {
  id: 1,
  total: 200,
  paidAmount: 0,
  status: 'UNPAID',
  issueDate: new Date('2026-01-01'),
  invoiceNumber: 'MN-INV-2026-00001',
};

describe('addPayment — التزامن وتحديث paidAmount', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.$transaction.mockImplementation(async (cb: (tx: unknown) => unknown) => cb(txInvoice));
    txInvoice.payment.create.mockResolvedValue({ id: 99 });
    txInvoice.invoice.update.mockImplementation(async ({ data }: { data: unknown }) => data);
  });

  it('يشتقّ paidAmount من القراءة داخل المعاملة، لا من قراءة سابقة لها', async () => {
    // القراءة قبل المعاملة (السلوك القديم) ترى 0؛ القراءة داخلها ترى 100 بعد دفعة متزامنة.
    prismaMock.invoice.findUnique.mockResolvedValue({ ...BASE_INVOICE, paidAmount: 0 });
    txInvoice.invoice.findUnique.mockResolvedValue({ ...BASE_INVOICE, paidAmount: 100 });

    const { invoicesService } = await import('../invoices.service');
    await invoicesService.addPayment(1, { amount: 100, method: 'CASH' } as never, {} as never);

    const written = txInvoice.invoice.update.mock.calls[0][0].data;
    // 100 (المُرحَّلة فعلًا) + 100 (هذه الدفعة) = 200 — لا 100 كما كان يقع سابقًا.
    expect(written.paidAmount).toBe(200);
    expect(written.status).toBe('PAID');
  });

  it('يقرأ الفاتورة داخل المعاملة لا خارجها', async () => {
    txInvoice.invoice.findUnique.mockResolvedValue({ ...BASE_INVOICE });

    const { invoicesService } = await import('../invoices.service');
    await invoicesService.addPayment(1, { amount: 50, method: 'CASH' } as never, {} as never);

    expect(txInvoice.invoice.findUnique).toHaveBeenCalled();
    expect(prismaMock.invoice.findUnique).not.toHaveBeenCalled();
  });

  it('يرفض تجاوز المتبقي بناءً على الحالة داخل المعاملة', async () => {
    // خارج المعاملة تبدو الفاتورة غير مسددة؛ داخلها سُدِّدت بالكامل بدفعة متزامنة.
    prismaMock.invoice.findUnique.mockResolvedValue({ ...BASE_INVOICE, paidAmount: 0 });
    txInvoice.invoice.findUnique.mockResolvedValue({ ...BASE_INVOICE, paidAmount: 200 });

    const { invoicesService } = await import('../invoices.service');
    await expect(
      invoicesService.addPayment(1, { amount: 100, method: 'CASH' } as never, {} as never),
    ).rejects.toThrow();
    expect(txInvoice.invoice.update).not.toHaveBeenCalled();
  });
});
