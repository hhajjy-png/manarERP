import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * C-1 Critical Accounting Fix Pack v1 — حارس تغيير طريقة الدفع في مسار التعديل.
 *
 * الثغرة المُغلقة: `paymentMethod` يقود حساب الدائن في قيد فاتورة الشراء
 * (`buildInvoiceGLPosting`)، ويُعاد اشتقاقه عند كل `repostInvoiceToGL` — بينما حالة
 * السداد (`paidAmount`/`status`) تُشتقّ منه **مرة واحدة عند الإنشاء** فقط عبر
 * `isImmediatelySettledPurchase`. تغييره بعد الترحيل كان يفصل المُخرجَين:
 *
 *   إنشاء بـ ACCOUNTS_PAYABLE → Dr مشتريات / Cr ذمم دائنة، الفاتورة UNPAID
 *   تعديل إلى CASH            → عكس + Cr صندوق (الائتمان النقدي الأول)، الفاتورة **ما زالت** UNPAID
 *   تسجيل دفعة                → Dr ذمم دائنة / Cr صندوق (الائتمان النقدي الثاني)
 *   الصافي: الصندوق دائن مرتين، والذمم الدائنة برصيد **مدين** (التزام سالب مستحيل محاسبيًا)
 *
 * الحارس يرفض التعديل قبل أي كتابة، ويُبقي التعديلات المكافئة محاسبيًا تعمل.
 */

vi.mock('../../../config/database', () => ({
  prisma: {
    invoice: { findUnique: vi.fn() },
    // Sentinel: يثبت أن الفاتورة المسموح بتعديلها تجتاز كل الحرّاس وتصل إلى مسار الكتابة.
    $transaction: vi.fn(async () => {
      throw new Error('__REACHED_TRANSACTION__');
    }),
  },
}));
vi.mock('../../../core/middleware/audit', () => ({ recordAudit: vi.fn() }));

import { prisma } from '../../../config/database';
import { invoicesService } from '../invoices.service';
import { effectivePurchaseGlMethod, purchaseGlTreatmentWouldChange } from '../invoices.calc';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const findUnique = prisma.invoice.findUnique as any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const $transaction = prisma.$transaction as any;
const fakeReq = { user: { userId: 1 } } as unknown as import('express').Request;

const BLOCKED = 'لا يمكن تغيير طريقة الدفع لفاتورة مشتريات بعد ترحيلها محاسبيًا';

/** فاتورة مشتريات آجلة غير مسدَّدة — الحالة التي كانت تفتح الثغرة. */
const purchaseOnCredit = {
  id: 1,
  number: 1,
  invoiceNumber: 'MN-INV-2026-00090',
  direction: 'PURCHASE',
  customerId: null,
  supplierId: 7,
  contractId: null,
  invoiceType: 'نقل اسفلت',
  issueDate: new Date('2026-06-01'),
  dueDate: null,
  deliveryDate: null,
  billingMonth: null,
  billingYear: null,
  taxRate: 0,
  discount: 0,
  paidAmount: 0,
  status: 'UNPAID',
  paymentMethod: 'ACCOUNTS_PAYABLE',
  items: [{ description: 'بند', quantity: 1, unit: 'طن', unitPrice: 100, priceId: null }],
};

beforeEach(() => vi.clearAllMocks());

describe('C-1 — الحارس يرفض تغيير المعالجة المحاسبية', () => {
  it('من آجل (ACCOUNTS_PAYABLE) إلى نقدي (CASH) ⇒ 400', async () => {
    findUnique.mockResolvedValue({ ...purchaseOnCredit });
    await expect(invoicesService.update(1, { paymentMethod: 'CASH' }, fakeReq)).rejects.toThrow(BLOCKED);
    expect($transaction).not.toHaveBeenCalled();
  });

  it('من آجل إلى بنكي (BANK) ⇒ 400 — نفس فئة التسوية الفورية', async () => {
    findUnique.mockResolvedValue({ ...purchaseOnCredit });
    await expect(invoicesService.update(1, { paymentMethod: 'BANK' }, fakeReq)).rejects.toThrow(BLOCKED);
    expect($transaction).not.toHaveBeenCalled();
  });

  it('من نقدي (CASH) إلى آجل (ACCOUNTS_PAYABLE) ⇒ 400', async () => {
    // فاتورة نقدية أُنشئت PAID يحجبها حارس «المسدَّدة للعرض فقط» أصلًا، فنستخدم صفًّا
    // نقديًا غير مسدَّد (بيانات تاريخية/مستوردة) ليقع الفحص على حارس C-1 نفسه.
    findUnique.mockResolvedValue({ ...purchaseOnCredit, paymentMethod: 'CASH' });
    await expect(invoicesService.update(1, { paymentMethod: 'ACCOUNTS_PAYABLE' }, fakeReq)).rejects.toThrow(BLOCKED);
    expect($transaction).not.toHaveBeenCalled();
  });

  it('من نقدي إلى بنكي ⇒ 400 — الحساب الدائن يتغيّر (صندوق ← بنك)', async () => {
    findUnique.mockResolvedValue({ ...purchaseOnCredit, paymentMethod: 'CASH' });
    await expect(invoicesService.update(1, { paymentMethod: 'BANK' }, fakeReq)).rejects.toThrow(BLOCKED);
    expect($transaction).not.toHaveBeenCalled();
  });

  it('الحالة الجزئية (PARTIAL): التغيير مرفوض أيضًا — فسادها فوري بلا دفعة إضافية', async () => {
    findUnique.mockResolvedValue({ ...purchaseOnCredit, status: 'PARTIAL', paidAmount: 40 });
    await expect(invoicesService.update(1, { paymentMethod: 'CASH' }, fakeReq)).rejects.toThrow(BLOCKED);
    expect($transaction).not.toHaveBeenCalled();
  });

  it('تحويل مبيعات ← مشتريات مع طريقة نقدية في نفس الطلب ⇒ 400 (الباب الثاني لنفس الثغرة)', async () => {
    // حارس الجهة/الاتجاه القائم لا يعمل عند paidAmount = 0، فهذا المسار كان مفتوحًا.
    findUnique.mockResolvedValue({
      ...purchaseOnCredit, direction: 'SALES', supplierId: null, customerId: 5, paymentMethod: null,
    });
    await expect(invoicesService.update(1, { direction: 'PURCHASE', paymentMethod: 'CASH' }, fakeReq))
      .rejects.toThrow(BLOCKED);
    expect($transaction).not.toHaveBeenCalled();
  });
});

describe('C-1 — الحالات المكافئة محاسبيًا تستمر بالعمل', () => {
  it('عدم إرسال paymentMethod إطلاقًا ⇒ التعديل ينجح ويصل إلى مسار الكتابة', async () => {
    findUnique.mockResolvedValue({ ...purchaseOnCredit });
    await expect(invoicesService.update(1, { notes: 'ملاحظة' }, fakeReq)).rejects.toThrow('__REACHED_TRANSACTION__');
    expect($transaction).toHaveBeenCalledOnce();
  });

  it('إرسال نفس القيمة الحالية (لا تغيير فعلي) ⇒ ينجح', async () => {
    findUnique.mockResolvedValue({ ...purchaseOnCredit });
    await expect(invoicesService.update(1, { paymentMethod: 'ACCOUNTS_PAYABLE' }, fakeReq))
      .rejects.toThrow('__REACHED_TRANSACTION__');
    expect($transaction).toHaveBeenCalledOnce();
  });

  it('null ⇄ ACCOUNTS_PAYABLE مكافئان (نفس حساب الدائن 2000) ⇒ ينجح في الاتجاهين', async () => {
    findUnique.mockResolvedValue({ ...purchaseOnCredit, paymentMethod: null });
    await expect(invoicesService.update(1, { paymentMethod: 'ACCOUNTS_PAYABLE' }, fakeReq))
      .rejects.toThrow('__REACHED_TRANSACTION__');

    vi.clearAllMocks();
    findUnique.mockResolvedValue({ ...purchaseOnCredit, paymentMethod: 'ACCOUNTS_PAYABLE' });
    await expect(invoicesService.update(1, { paymentMethod: null } as never, fakeReq))
      .rejects.toThrow('__REACHED_TRANSACTION__');
  });

  it('فاتورة مبيعات: طريقة الدفع لا تُقيَّد — فرع SALES لا يقرأ الحقل أصلًا', async () => {
    findUnique.mockResolvedValue({
      ...purchaseOnCredit, direction: 'SALES', supplierId: null, customerId: 5, paymentMethod: 'ACCOUNTS_PAYABLE',
    });
    await expect(invoicesService.update(1, { paymentMethod: 'CASH' }, fakeReq))
      .rejects.toThrow('__REACHED_TRANSACTION__');
    expect($transaction).toHaveBeenCalledOnce();
  });

  it('تحويل مشتريات ← مبيعات بلا مساس بطريقة الدفع ⇒ ينجح', async () => {
    findUnique.mockResolvedValue({ ...purchaseOnCredit });
    await expect(invoicesService.update(1, { direction: 'SALES' }, fakeReq))
      .rejects.toThrow('__REACHED_TRANSACTION__');
    expect($transaction).toHaveBeenCalledOnce();
  });
});

describe('C-1 — الحارس يقع قبل أي أثر جانبي', () => {
  it('الرفض يحدث قبل فتح المعاملة: لا قيود، ولا مساس بـ paidAmount أو status', async () => {
    const row = { ...purchaseOnCredit, status: 'PARTIAL', paidAmount: 40 };
    findUnique.mockResolvedValue(row);

    await expect(invoicesService.update(1, { paymentMethod: 'CASH' }, fakeReq)).rejects.toThrow(BLOCKED);

    // لا معاملة ⇒ لا invoice.update ولا repostInvoiceToGL ولا أي قيد جديد أو معكوس.
    expect($transaction).not.toHaveBeenCalled();
    // الصف كما كان — الحارس لا يكتب شيئًا.
    expect(row.paidAmount).toBe(40);
    expect(row.status).toBe('PARTIAL');
    expect(row.paymentMethod).toBe('ACCOUNTS_PAYABLE');
  });

  it('حرّاس الحوكمة القائمة أسبق من حارس C-1 (لا انحدار في ترتيب الرفض)', async () => {
    findUnique.mockResolvedValue({ ...purchaseOnCredit, status: 'PAID', paidAmount: 100 });
    await expect(invoicesService.update(1, { paymentMethod: 'CASH' }, fakeReq))
      .rejects.toThrow('لا يمكن تعديل فاتورة مسددة بالكامل');

    vi.clearAllMocks();
    findUnique.mockResolvedValue({ ...purchaseOnCredit, status: 'CANCELLED' });
    await expect(invoicesService.update(1, { paymentMethod: 'CASH' }, fakeReq))
      .rejects.toThrow('لا يمكن تعديل فاتورة ملغاة');
  });
});

describe('C-1 — الدوال النقية', () => {
  it('effectivePurchaseGlMethod يطبّع الغياب إلى ACCOUNTS_PAYABLE (نفس افتراضي بانِي القيد)', () => {
    expect(effectivePurchaseGlMethod(null)).toBe('ACCOUNTS_PAYABLE');
    expect(effectivePurchaseGlMethod(undefined)).toBe('ACCOUNTS_PAYABLE');
    expect(effectivePurchaseGlMethod('ACCOUNTS_PAYABLE')).toBe('ACCOUNTS_PAYABLE');
    expect(effectivePurchaseGlMethod('CASH')).toBe('CASH');
    expect(effectivePurchaseGlMethod('BANK')).toBe('BANK');
  });

  it('purchaseGlTreatmentWouldChange يرصد كل انتقال يغيّر حساب الدائن', () => {
    expect(purchaseGlTreatmentWouldChange('PURCHASE', 'ACCOUNTS_PAYABLE', 'CASH')).toBe(true);
    expect(purchaseGlTreatmentWouldChange('PURCHASE', 'ACCOUNTS_PAYABLE', 'BANK')).toBe(true);
    expect(purchaseGlTreatmentWouldChange('PURCHASE', 'CASH', 'ACCOUNTS_PAYABLE')).toBe(true);
    expect(purchaseGlTreatmentWouldChange('PURCHASE', 'CASH', 'BANK')).toBe(true);
    expect(purchaseGlTreatmentWouldChange('PURCHASE', null, 'CASH')).toBe(true);
  });

  it('لا يرصد ما لا يغيّر حساب الدائن، ولا يتدخّل خارج المشتريات', () => {
    expect(purchaseGlTreatmentWouldChange('PURCHASE', 'CASH', 'CASH')).toBe(false);
    expect(purchaseGlTreatmentWouldChange('PURCHASE', null, 'ACCOUNTS_PAYABLE')).toBe(false);
    expect(purchaseGlTreatmentWouldChange('PURCHASE', 'ACCOUNTS_PAYABLE', null)).toBe(false);
    expect(purchaseGlTreatmentWouldChange('SALES', 'ACCOUNTS_PAYABLE', 'CASH')).toBe(false);
    expect(purchaseGlTreatmentWouldChange('SALES', null, 'BANK')).toBe(false);
  });
});
