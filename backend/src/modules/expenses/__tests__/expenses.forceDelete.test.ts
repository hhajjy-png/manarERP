import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AppError } from '../../../core/errors/AppError';

vi.mock('../../../config/database', () => ({
  prisma: {
    expense: { findUnique: vi.fn(), delete: vi.fn() },
    journalEntry: { findMany: vi.fn(), deleteMany: vi.fn() },
    transaction: { count: vi.fn(), deleteMany: vi.fn() },
    attachment: { findMany: vi.fn(), count: vi.fn(), deleteMany: vi.fn() },
    bankStatementTransaction: { count: vi.fn(), updateMany: vi.fn() },
    $transaction: vi.fn(),
  },
}));
vi.mock('../../../core/middleware/audit', () => ({ recordAudit: vi.fn() }));
vi.mock('../../transactions/transactions.service', () => ({ transactionsService: { postEntry: vi.fn(), clearByReference: vi.fn() } }));
vi.mock('../expenses.accounting', () => ({ postExpenseToGL: vi.fn(), reverseExpenseFromGL: vi.fn() }));
vi.mock('fs', () => ({ default: { existsSync: vi.fn(() => true), unlinkSync: vi.fn() } }));

import fs from 'fs';
import { ExpensesService } from '../expenses.service';
import { prisma } from '../../../config/database';
import { recordAudit } from '../../../core/middleware/audit';
import { reverseExpenseFromGL } from '../expenses.accounting';
import { requireRole } from '../../../core/middleware/rbac.middleware';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockPrisma = prisma as any;
const fakeReq = {} as import('express').Request;

const approvedExpense = {
  id: 15, code: 'EXP-2026-00015', category: 'FUEL',
  description: 'وقود', amount: 250.5, date: new Date('2026-06-01'),
  status: 'APPROVED', paymentMethod: 'CASH', supplierName: null,
};

/** يبني عميل معاملة وهمي يُعيد أعداد الحذف/التحديث. */
function buildTxMock() {
  return {
    bankStatementTransaction: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
    // GL is reversed (not deleted): forceRemove counts live entries then calls reverseExpenseFromGL.
    journalEntry: { count: vi.fn().mockResolvedValue(2), deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
    attachment: { deleteMany: vi.fn().mockResolvedValue({ count: 1 }) },
    expense: { delete: vi.fn().mockResolvedValue({}) },
  };
}

describe('ExpensesService.forceRemove — safety & audit', () => {
  let service: ExpensesService;
  beforeEach(() => { service = new ExpensesService(); vi.clearAllMocks(); });

  it('throws notFound when expense does not exist', async () => {
    mockPrisma.expense.findUnique.mockResolvedValue(null);
    await expect(service.forceRemove(999, 'X', fakeReq)).rejects.toThrow('المصروف غير موجود');
  });

  it('blocks when the typed confirmation does not match the expense code', async () => {
    mockPrisma.expense.findUnique.mockResolvedValue(approvedExpense);
    await expect(service.forceRemove(15, 'EXP-2026-00099', fakeReq)).rejects.toThrow(AppError);
    await expect(service.forceRemove(15, 'EXP-2026-00099', fakeReq)).rejects.toThrow('يجب كتابة رمز المصروف بشكل مطابق للتأكيد');
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });

  it('force-deletes an approved expense: unlinks bank matches, REVERSES GL (never deletes), deletes attachments, audits', async () => {
    mockPrisma.expense.findUnique.mockResolvedValue(approvedExpense);
    mockPrisma.attachment.findMany.mockResolvedValue([{ id: 1, filePath: '/data/att/x.pdf' }]);
    mockPrisma.journalEntry.findMany.mockResolvedValue([{ id: 100 }, { id: 101 }]);
    const tx = buildTxMock();
    mockPrisma.$transaction.mockImplementation(async (cb: (t: unknown) => Promise<unknown>) => cb(tx));

    const result = await service.forceRemove(15, 'EXP-2026-00015', fakeReq);

    // كل السجلات المرتبطة عولجت داخل المعاملة
    expect(tx.bankStatementTransaction.updateMany).toHaveBeenCalledTimes(1);
    // دفتر غير قابل للتغيير: يُعكَس قيد GL ولا يُحذف أبدًا.
    expect(vi.mocked(reverseExpenseFromGL)).toHaveBeenCalledWith(tx, 15);
    expect(tx.journalEntry.deleteMany).not.toHaveBeenCalled();
    expect(tx.attachment.deleteMany).toHaveBeenCalledWith({ where: { entityType: 'EXPENSE', entityId: 15 } });
    expect(tx.expense.delete).toHaveBeenCalledWith({ where: { id: 15 } });

    // ملف المرفق حُذف من القرص (أفضل جهد)
    expect(fs.unlinkSync).toHaveBeenCalledWith('/data/att/x.pdf');

    // تدقيق كامل — يسجّل عدد القيود المعكوسة (لا المحذوفة)
    expect(recordAudit).toHaveBeenCalledWith(expect.objectContaining({
      action: 'FORCE_DELETE_EXPENSE',
      module: 'expenses',
      entityId: 15,
      newValue: expect.objectContaining({
        forceDelete: true, code: 'EXP-2026-00015', amount: 250.5, status: 'APPROVED',
        journalEntriesReversed: 2, attachmentsDeleted: 1, bankMatchesUnlinked: 1,
      }),
    }));

    expect(result).toMatchObject({ deleted: true, journalEntriesReversed: 2, bankMatchesUnlinked: 1 });
  });

  it('does not abort the delete if an attachment file is missing on disk', async () => {
    mockPrisma.expense.findUnique.mockResolvedValue(approvedExpense);
    mockPrisma.attachment.findMany.mockResolvedValue([{ id: 1, filePath: '/data/att/missing.pdf' }]);
    mockPrisma.journalEntry.findMany.mockResolvedValue([]);
    (fs.existsSync as unknown as ReturnType<typeof vi.fn>).mockReturnValue(false);
    mockPrisma.$transaction.mockImplementation(async (cb: (t: unknown) => Promise<unknown>) => cb(buildTxMock()));

    const result = await service.forceRemove(15, 'EXP-2026-00015', fakeReq);
    expect(fs.unlinkSync).not.toHaveBeenCalled();
    expect(result).toMatchObject({ deleted: true });
  });
});

describe('ExpensesService.forceRemovePreview', () => {
  let service: ExpensesService;
  beforeEach(() => { service = new ExpensesService(); vi.clearAllMocks(); });

  it('returns a snapshot with linked-record counts and status warnings', async () => {
    mockPrisma.expense.findUnique.mockResolvedValue({ ...approvedExpense, supplier: null });
    mockPrisma.journalEntry.findMany.mockResolvedValue([{ id: 100 }, { id: 101 }]);
    mockPrisma.transaction.count.mockResolvedValue(1);
    mockPrisma.attachment.count.mockResolvedValue(0);
    mockPrisma.bankStatementTransaction.count.mockResolvedValue(1);

    const preview = await service.forceRemovePreview(15);
    expect(preview).toMatchObject({
      code: 'EXP-2026-00015', status: 'APPROVED',
      journalEntriesCount: 2, legacyTransactionsCount: 1, attachmentsCount: 0, bankMatchesCount: 1,
    });
    expect(preview.warnings.some((w) => w.includes('معتمد'))).toBe(true);
    expect(preview.warnings.some((w) => w.includes('كشوف البنك'))).toBe(true);
  });

  it('throws notFound when expense does not exist', async () => {
    mockPrisma.expense.findUnique.mockResolvedValue(null);
    await expect(service.forceRemovePreview(999)).rejects.toThrow('المصروف غير موجود');
  });
});

describe('Force Delete access control — requireRole(SYSTEM_ADMIN)', () => {
  function run(roleName: string) {
    const req = { user: { roleName } } as unknown as import('express').Request;
    const next = vi.fn();
    requireRole('SYSTEM_ADMIN')(req, {} as never, next);
    return next;
  }

  it('allows SYSTEM_ADMIN', () => {
    const next = run('SYSTEM_ADMIN');
    expect(next).toHaveBeenCalledWith();
  });

  it('rejects a non-admin role with a forbidden error', () => {
    const next = run('ACCOUNTANT');
    const arg = next.mock.calls[0][0];
    expect(arg).toBeInstanceOf(AppError);
    expect(arg.statusCode).toBe(403);
  });
});
