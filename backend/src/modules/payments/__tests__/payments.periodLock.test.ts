import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../config/database', () => ({
  prisma: {
    payment: { findUnique: vi.fn(), update: vi.fn() },
    $transaction: vi.fn(),
  },
}));
vi.mock('../../../core/middleware/audit', () => ({ recordAudit: vi.fn() }));

import { prisma } from '../../../config/database';
import { paymentsService } from '../payments.service';
import { runWithRequestActor } from '../../../core/context/requestContext';
import { invalidatePeriodLockCache, OVERRIDE_PERMISSION } from '../../../shared/services/periodLock.service';
import type { Request } from 'express';

/**
 * تصحيح تاريخ التحصيل — قفل الفترة المحاسبية.
 *
 * هذا **المسار الوحيد في النظام** الذي ينقل قيدًا **مُرحَّلًا** عبر الزمن: يعيد كتابة
 * `JournalEntry.date` بـ `updateMany` مباشرةً، فلا يمرّ بـ `createBalancedJournal` ولا
 * `postEntry` — أي أن الحارس المركزي لا يراه إطلاقًا. وكان يحمل تعليق TODO يقول «لا يوجد
 * نظام إقفال فترات» — وهو ما صار كاذبًا منذ إضافة القفل.
 *
 * والحارس يفحص **التاريخين**: سحب دفعة **من** فترة مقفلة انتهاكٌ لها تمامًا كدفعها **إليها**.
 */

const p = prisma as unknown as {
  payment: { findUnique: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn> };
  $transaction: ReturnType<typeof vi.fn>;
};

const LOCK = '2026-01-01'; // كل ما قبل 2026 مقفل

const PAYMENT_2024 = {
  id: 5,
  date: new Date(2024, 5, 10),
  amount: 100,
  invoice: { id: 9, invoiceNumber: 'INV-2024-001', issueDate: new Date(2024, 0, 1) },
};
// فاتورة قديمة ودفعة حديثة: هكذا يمكن اختبار الرجوع إلى فترة مقفلة **دون** أن يعترضه الحارس
// القائم «لا يسبق تاريخ التحصيل تاريخ الإصدار» — وهو حارس آخر، وقد بقي كما هو.
const PAYMENT_2026 = {
  id: 6,
  date: new Date(2026, 5, 10),
  amount: 100,
  invoice: { id: 9, invoiceNumber: 'INV-2023-001', issueDate: new Date(2023, 0, 1) },
};

/** عميل معاملة وهمي — يقرأ إعداد القفل ويلتقط ما يُكتب. */
function makeTx() {
  return {
    setting:      { findUnique: vi.fn().mockResolvedValue({ value: LOCK }) },
    auditLog:     { create: vi.fn().mockResolvedValue({ id: 1 }) },
    payment:      { update: vi.fn().mockImplementation((a) => ({ id: a.where.id, date: a.data.date })) },
    journalEntry: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
  };
}

function req(roleName: string, permissions: string[] = []): Request {
  return { user: { userId: 1, roleName }, permissions, ip: '127.0.0.1' } as unknown as Request;
}

let tx: ReturnType<typeof makeTx>;

beforeEach(() => {
  vi.clearAllMocks();
  invalidatePeriodLockCache();
  tx = makeTx();
  p.$transaction.mockImplementation(async (fn: (c: unknown) => unknown) => fn(tx));
});

describe('فترة مقفلة', () => {
  it('نقل الدفعة **إلى** فترة مقفلة يُرفض قبل أي كتابة', async () => {
    p.payment.findUnique.mockResolvedValue(PAYMENT_2026);
    await runWithRequestActor(req('ACCOUNTANT'), async () => {
      await expect(
        paymentsService.correctCollectionDate(6, { date: new Date(2024, 5, 1) }, req('ACCOUNTANT')),
      ).rejects.toThrow(/مقفل|الفترة/);
    });
    expect(tx.payment.update).not.toHaveBeenCalled();       // ← قبل الطفرة، لا بعدها
    expect(tx.journalEntry.updateMany).not.toHaveBeenCalled();
  });

  it('سحب الدفعة **من** فترة مقفلة يُرفض أيضًا — لا تُفرَّغ فترة مُقفلة من تحصيلاتها', async () => {
    p.payment.findUnique.mockResolvedValue(PAYMENT_2024);
    await runWithRequestActor(req('ACCOUNTANT'), async () => {
      await expect(
        paymentsService.correctCollectionDate(5, { date: new Date(2026, 5, 1) }, req('ACCOUNTANT')),
      ).rejects.toThrow(/مقفل|الفترة/);
    });
    expect(tx.payment.update).not.toHaveBeenCalled();
    expect(tx.journalEntry.updateMany).not.toHaveBeenCalled();
  });
});

describe('فترة مفتوحة', () => {
  it('التصحيح داخل فترة مفتوحة يمرّ كما كان — الدفعة والقيد يتحرّكان معًا', async () => {
    p.payment.findUnique.mockResolvedValue(PAYMENT_2026);
    await runWithRequestActor(req('ACCOUNTANT'), async () => {
      const result = await paymentsService.correctCollectionDate(
        6, { date: new Date(2026, 6, 20) }, req('ACCOUNTANT'),
      );
      expect(result.changed).toBe(true);
    });
    expect(tx.payment.update).toHaveBeenCalledTimes(1);
    expect(tx.journalEntry.updateMany).toHaveBeenCalledTimes(1); // القيد تحرّك مع الدفعة
  });
});

describe('التجاوز — سلوك قائم لم يتغيّر', () => {
  it('SYSTEM_ADMIN يمرّ، ويُسجَّل التجاوز بدل أن يمرّ بلا أثر', async () => {
    p.payment.findUnique.mockResolvedValue(PAYMENT_2024);
    await runWithRequestActor(req('SYSTEM_ADMIN'), async () => {
      const result = await paymentsService.correctCollectionDate(
        5, { date: new Date(2024, 7, 1) }, req('SYSTEM_ADMIN'),
      );
      expect(result.changed).toBe(true);
    });
    expect(tx.payment.update).toHaveBeenCalledTimes(1);
    const overrides = tx.auditLog.create.mock.calls
      .map((c) => c[0].data)
      .filter((d: { action: string }) => d.action === 'PERIOD_LOCK_OVERRIDE');
    expect(overrides.length).toBeGreaterThanOrEqual(1); // ← الأثر الذي كان مفقودًا
  });

  it('صلاحية financial.overrideLock تمرّ كذلك', async () => {
    p.payment.findUnique.mockResolvedValue(PAYMENT_2024);
    await runWithRequestActor(req('ACCOUNTANT', [OVERRIDE_PERMISSION]), async () => {
      const result = await paymentsService.correctCollectionDate(
        5, { date: new Date(2024, 7, 1) }, req('ACCOUNTANT', [OVERRIDE_PERMISSION]),
      );
      expect(result.changed).toBe(true);
    });
  });
});
