import { describe, it, expect, vi, beforeEach } from 'vitest';

// وحدة تصحيح تاريخ التحصيل الرسمي (Payment.date) لدفعة تاريخية — إجراء إداري بحت.
// نموذج المحاكاة يتبع نمط expenses.cancelApproval: نُحاكي prisma singleton + recordAudit،
// ونمرّر tx عبر $transaction.

vi.mock('../../../config/database', () => {
  const tx = {
    payment: { update: vi.fn() },
    journalEntry: { updateMany: vi.fn() },
  };
  return {
    prisma: {
      payment: { findUnique: vi.fn() },
      $transaction: vi.fn(async (cb: (t: typeof tx) => unknown) => cb(tx)),
      __tx: tx,
    },
  };
});
vi.mock('../../../core/middleware/audit', () => ({ recordAudit: vi.fn() }));

import { prisma } from '../../../config/database';
import { recordAudit } from '../../../core/middleware/audit';
import { paymentsService } from '../payments.service';
import { correctCollectionDateSchema } from '../payments.schema';
import { requireRole } from '../../../core/middleware/rbac.middleware';
import { ROLES } from '../../../config/constants';
import { AppError } from '../../../core/errors/AppError';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const tx = (prisma as unknown as { __tx: any }).__tx;
const fakeReq = { user: { userId: 1, username: 'admin' }, ip: '127.0.0.1' } as unknown as import('express').Request;

const NEW_DATE = new Date('2026-05-01');
const basePayment = {
  id: 5,
  invoiceId: 20,
  amount: 100.5,
  method: 'CHEQUE',
  date: new Date('2026-06-20'),
  createdAt: new Date('2026-06-20'),
  reference: 'CHK-99',
  notes: null,
  invoice: { id: 20, invoiceNumber: 'MN-INV-2026-00020', issueDate: new Date('2026-04-01') },
};

describe('paymentsService.correctCollectionDate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.payment.findUnique).mockResolvedValue(basePayment as any);
    tx.payment.update.mockResolvedValue({ ...basePayment, date: NEW_DATE });
    tx.journalEntry.updateMany.mockResolvedValue({ count: 1 });
  });

  it('updates ONLY Payment.date — never amount/method/createdAt/status', async () => {
    await paymentsService.correctCollectionDate(5, { date: NEW_DATE, reason: 'خطأ إدخال' }, fakeReq);

    expect(tx.payment.update).toHaveBeenCalledOnce();
    const arg = tx.payment.update.mock.calls[0][0];
    expect(arg.where).toEqual({ id: 5 });
    // الحقل الوحيد المسموح تعديله هو date — لا createdAt ولا amount ولا method.
    expect(Object.keys(arg.data)).toEqual(['date']);
    expect(arg.data.date).toBe(NEW_DATE);
  });

  it('keeps the linked journal entry date in sync (PAYMENT + PURCHASE_PAYMENT only)', async () => {
    await paymentsService.correctCollectionDate(5, { date: NEW_DATE }, fakeReq);

    expect(tx.journalEntry.updateMany).toHaveBeenCalledOnce();
    expect(tx.journalEntry.updateMany).toHaveBeenCalledWith({
      where: {
        referenceType: { in: ['PAYMENT', 'PURCHASE_PAYMENT'] },
        referenceId: 5,
      },
      data: { date: NEW_DATE },
    });
  });

  it('records a full audit trail (old date, new date, reason, invoice, username)', async () => {
    await paymentsService.correctCollectionDate(5, { date: NEW_DATE, reason: 'تصحيح تاريخ' }, fakeReq);

    expect(recordAudit).toHaveBeenCalledOnce();
    const audit = vi.mocked(recordAudit).mock.calls[0][0];
    expect(audit.action).toBe('COLLECTION_DATE_CORRECTION');
    expect(audit.module).toBe('payments');
    expect(audit.entityId).toBe(5);
    expect((audit.oldValue as any).collectionDate).toBe(basePayment.date);
    expect((audit.newValue as any).collectionDate).toBe(NEW_DATE);
    expect((audit.newValue as any).reason).toBe('تصحيح تاريخ');
    expect((audit.newValue as any).invoiceId).toBe(20);
    expect((audit.newValue as any).invoiceNumber).toBe('MN-INV-2026-00020');
    expect((audit.newValue as any).username).toBe('admin');
  });

  it('stores reason as null when omitted', async () => {
    await paymentsService.correctCollectionDate(5, { date: NEW_DATE }, fakeReq);
    const audit = vi.mocked(recordAudit).mock.calls[0][0];
    expect((audit.newValue as any).reason).toBeNull();
  });

  it('rejects a collection date earlier than the invoice issue date', async () => {
    // issueDate = 2026-04-01؛ محاولة التصحيح إلى 2026-03-15 (أقدم) يجب أن تُرفض.
    await expect(
      paymentsService.correctCollectionDate(5, { date: new Date('2026-03-15') }, fakeReq),
    ).rejects.toThrow('لا يمكن أن يكون تاريخ التحصيل أقدم من تاريخ إصدار الفاتورة');

    expect(tx.payment.update).not.toHaveBeenCalled();
    expect(tx.journalEntry.updateMany).not.toHaveBeenCalled();
    expect(recordAudit).not.toHaveBeenCalled();
  });

  it('allows a collection date equal to the invoice issue date (same day)', async () => {
    const result = await paymentsService.correctCollectionDate(
      5,
      { date: new Date('2026-04-01') }, // نفس يوم الإصدار
      fakeReq,
    );
    expect(result.changed).toBe(true);
    expect(tx.payment.update).toHaveBeenCalledOnce();
  });

  it('skips the invoice-date guard when issueDate is null', async () => {
    vi.mocked(prisma.payment.findUnique).mockResolvedValue({
      ...basePayment,
      invoice: { id: 20, invoiceNumber: 'MN-INV-2026-00020', issueDate: null },
    } as any);
    const result = await paymentsService.correctCollectionDate(5, { date: new Date('2020-01-01') }, fakeReq);
    expect(result.changed).toBe(true);
  });

  it('is IDEMPOTENT — repeating the same correction after it applied is a no-op', async () => {
    // بعد أول تصحيح، تاريخ الدفعة أصبح NEW_DATE؛ إعادة نفس الطلب لا تُحدث شيئًا.
    vi.mocked(prisma.payment.findUnique).mockResolvedValue({ ...basePayment, date: NEW_DATE } as any);

    const result = await paymentsService.correctCollectionDate(5, { date: NEW_DATE }, fakeReq);

    expect(result.changed).toBe(false);
    expect(tx.payment.update).not.toHaveBeenCalled();
    expect(tx.journalEntry.updateMany).not.toHaveBeenCalled();
    expect(recordAudit).not.toHaveBeenCalled();
  });

  it('throws 404 for a non-existent payment and touches nothing', async () => {
    vi.mocked(prisma.payment.findUnique).mockResolvedValue(null);

    await expect(
      paymentsService.correctCollectionDate(999, { date: NEW_DATE }, fakeReq),
    ).rejects.toThrow('الدفعة غير موجودة');

    expect(tx.payment.update).not.toHaveBeenCalled();
    expect(tx.journalEntry.updateMany).not.toHaveBeenCalled();
    expect(recordAudit).not.toHaveBeenCalled();
  });

  it('is a NO-OP when the new date equals the current date — no writes, no audit', async () => {
    const result = await paymentsService.correctCollectionDate(
      5,
      { date: new Date(basePayment.date) }, // نفس اللحظة تمامًا
      fakeReq,
    );

    expect(result.changed).toBe(false);
    expect(result.message).toContain('لم يتم إجراء أي تعديل');
    expect(tx.payment.update).not.toHaveBeenCalled();
    expect(tx.journalEntry.updateMany).not.toHaveBeenCalled();
    expect(recordAudit).not.toHaveBeenCalled();
  });

  it('is a NO-OP when the new date is the same DAY but a different time-of-day (day-granular guard)', async () => {
    // دفعة تحمل وقتًا (مثل ما تُنشئه new Date())، والتاريخ الجديد منتصف ليل نفس اليوم.
    vi.mocked(prisma.payment.findUnique).mockResolvedValue({
      ...basePayment,
      date: new Date(2026, 5, 20, 9, 30, 0), // 20 يونيو 2026، 09:30 محليًا
    } as any);

    const result = await paymentsService.correctCollectionDate(
      5,
      { date: new Date(2026, 5, 20, 0, 0, 0) }, // نفس اليوم، منتصف الليل
      fakeReq,
    );

    expect(result.changed).toBe(false);
    expect(tx.payment.update).not.toHaveBeenCalled();
    expect(recordAudit).not.toHaveBeenCalled();
  });

  it('proceeds when the day actually changes', async () => {
    vi.mocked(prisma.payment.findUnique).mockResolvedValue({
      ...basePayment,
      date: new Date(2026, 5, 20, 9, 30, 0),
    } as any);

    const result = await paymentsService.correctCollectionDate(
      5,
      { date: new Date(2026, 5, 21, 0, 0, 0) }, // يوم مختلف
      fakeReq,
    );

    expect(result.changed).toBe(true);
    expect(tx.payment.update).toHaveBeenCalledOnce();
  });

  it('aborts the whole transaction when no linked journal entry exists (accounting consistency)', async () => {
    tx.journalEntry.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      paymentsService.correctCollectionDate(5, { date: NEW_DATE }, fakeReq),
    ).rejects.toThrow('لا يوجد قيد محاسبي مرتبط');

    // القيد مفقود ⇒ الاستدعاء يرمي قبل التدقيق، فلا سجل تدقيق يُكتب. التراجع الفعلي عن تحديث
    // الدفعة تضمنه دلالات معاملة Prisma التفاعلية في الإنتاج (خارج نطاق هذه المحاكاة).
    expect(recordAudit).not.toHaveBeenCalled();
  });

  it('returns changed:true with the success message on a real correction', async () => {
    const result = await paymentsService.correctCollectionDate(5, { date: NEW_DATE }, fakeReq);
    expect(result.changed).toBe(true);
    expect(result.message).toBe('تم تصحيح تاريخ التحصيل');
  });

  it('trims a padded reason before storing it', async () => {
    await paymentsService.correctCollectionDate(5, { date: NEW_DATE, reason: '  خطأ إدخال  ' }, fakeReq);
    const audit = vi.mocked(recordAudit).mock.calls[0][0];
    expect((audit.newValue as any).reason).toBe('خطأ إدخال');
  });

  it('stores null for a whitespace-only reason', async () => {
    await paymentsService.correctCollectionDate(5, { date: NEW_DATE, reason: '   ' }, fakeReq);
    const audit = vi.mocked(recordAudit).mock.calls[0][0];
    expect((audit.newValue as any).reason).toBeNull();
  });
});

describe('correctCollectionDateSchema — input validation', () => {
  // المخطط يتحقق من params (paymentId) والجسم معًا كما يفعل validate middleware.
  const parse = (body: unknown, params: unknown = { paymentId: '5' }) =>
    correctCollectionDateSchema.parse({ params, body });

  it('accepts a valid date and coerces it to a Date', () => {
    expect(parse({ date: '2026-05-01' }).body.date).toBeInstanceOf(Date);
  });

  it('coerces a valid paymentId param to a positive integer', () => {
    expect(parse({ date: '2026-05-01' }).params.paymentId).toBe(5);
  });

  it('accepts an optional reason', () => {
    expect(parse({ date: '2026-05-01', reason: 'سبب' }).body.reason).toBe('سبب');
  });

  it('rejects a missing date', () => {
    expect(() => parse({})).toThrow();
  });

  it('rejects an empty/invalid date', () => {
    expect(() => parse({ date: '' })).toThrow();
    expect(() => parse({ date: 'not-a-date' })).toThrow();
  });

  it('rejects an overly long reason (> 500 chars)', () => {
    expect(() => parse({ date: '2026-05-01', reason: 'x'.repeat(501) })).toThrow();
  });

  it('rejects an invalid paymentId param (non-numeric / zero / negative)', () => {
    expect(() => parse({ date: '2026-05-01' }, { paymentId: 'abc' })).toThrow();
    expect(() => parse({ date: '2026-05-01' }, { paymentId: '0' })).toThrow();
    expect(() => parse({ date: '2026-05-01' }, { paymentId: '-3' })).toThrow();
  });
});

describe('correction endpoint authorization (requireRole SYSTEM_ADMIN)', () => {
  const guard = requireRole(ROLES.SYSTEM_ADMIN);

  it('allows SYSTEM_ADMIN through', () => {
    const next = vi.fn();
    guard({ user: { roleName: 'SYSTEM_ADMIN' } } as any, {} as any, next);
    expect(next).toHaveBeenCalledWith();
  });

  it('rejects a non-admin user (forbidden)', () => {
    const next = vi.fn();
    guard({ user: { roleName: 'ACCOUNTANT' } } as any, {} as any, next);
    expect(next).toHaveBeenCalledOnce();
    expect(next.mock.calls[0][0]).toBeInstanceOf(AppError);
  });

  it('rejects an unauthenticated request', () => {
    const next = vi.fn();
    guard({} as any, {} as any, next);
    expect(next.mock.calls[0][0]).toBeInstanceOf(AppError);
  });
});
