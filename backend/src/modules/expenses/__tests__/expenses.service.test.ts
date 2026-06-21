import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AppError } from '../../../core/errors/AppError';

vi.mock('../../../config/database', () => ({
  prisma: { expense: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn(), count: vi.fn() } },
}));
vi.mock('../../../core/middleware/audit', () => ({ recordAudit: vi.fn() }));
vi.mock('../../transactions/transactions.service', () => ({ transactionsService: { postEntry: vi.fn() } }));
vi.mock('../expenses.accounting', () => ({ postExpenseToGL: vi.fn(), reverseExpenseFromGL: vi.fn() }));

import { ExpensesService } from '../expenses.service';
import { prisma } from '../../../config/database';

const mockPrisma = prisma as unknown as {
  expense: {
    findUnique: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    delete: ReturnType<typeof vi.fn>;
    count: ReturnType<typeof vi.fn>;
  };
};

const fakeReq = {} as import('express').Request;

const pendingExpense = {
  id: 1, code: 'EXP-2026-00001', category: 'FUEL',
  description: 'وقود', amount: 250.5, date: new Date(),
  status: 'PENDING', paymentMethod: 'CASH',
};

describe('ExpensesService.update — status guards', () => {
  let service: ExpensesService;

  beforeEach(() => {
    service = new ExpensesService();
    vi.clearAllMocks();
  });

  it('throws notFound when expense does not exist', async () => {
    mockPrisma.expense.findUnique.mockResolvedValue(null);
    await expect(service.update(999, { description: 'x' }, fakeReq)).rejects.toThrow('المصروف غير موجود');
  });

  it('throws badRequest when updating APPROVED expense', async () => {
    mockPrisma.expense.findUnique.mockResolvedValue({ ...pendingExpense, status: 'APPROVED' });
    await expect(service.update(1, { description: 'x' }, fakeReq))
      .rejects.toThrow('لا يمكن تعديل مصروف معتمد');
  });

  it('throws badRequest when updating REVERSED expense', async () => {
    mockPrisma.expense.findUnique.mockResolvedValue({ ...pendingExpense, status: 'REVERSED' });
    await expect(service.update(1, { amount: 100 }, fakeReq))
      .rejects.toThrow('لا يمكن تعديل مصروف معكوس');
  });

  it('throws badRequest when updating CANCELLED expense', async () => {
    mockPrisma.expense.findUnique.mockResolvedValue({ ...pendingExpense, status: 'CANCELLED' });
    await expect(service.update(1, { amount: 100 }, fakeReq))
      .rejects.toThrow('لا يمكن تعديل مصروف ملغى');
  });

  it('allows update on PENDING expense', async () => {
    mockPrisma.expense.findUnique.mockResolvedValue(pendingExpense);
    mockPrisma.expense.update.mockResolvedValue({ ...pendingExpense, description: 'محدث' });
    const result = await service.update(1, { description: 'محدث' }, fakeReq);
    expect(result).toMatchObject({ description: 'محدث' });
  });
});

describe('ExpensesService.approve — guards', () => {
  let service: ExpensesService;

  beforeEach(() => {
    service = new ExpensesService();
    vi.clearAllMocks();
  });

  it('throws notFound when expense does not exist', async () => {
    mockPrisma.expense.findUnique.mockResolvedValue(null);
    await expect(service.approve(999, fakeReq)).rejects.toThrow('المصروف غير موجود');
  });

  it('throws badRequest when approving already-APPROVED expense', async () => {
    mockPrisma.expense.findUnique.mockResolvedValue({ ...pendingExpense, status: 'APPROVED' });
    await expect(service.approve(1, fakeReq)).rejects.toThrow('يمكن اعتماد المصاريف المعلّقة فقط');
  });
});

describe('ExpensesService.remove — guards', () => {
  let service: ExpensesService;

  beforeEach(() => {
    service = new ExpensesService();
    vi.clearAllMocks();
  });

  it('throws notFound when expense does not exist', async () => {
    mockPrisma.expense.findUnique.mockResolvedValue(null);
    await expect(service.remove(999, fakeReq)).rejects.toThrow('المصروف غير موجود');
  });

  it('throws conflict when removing APPROVED expense', async () => {
    mockPrisma.expense.findUnique.mockResolvedValue({ ...pendingExpense, status: 'APPROVED' });
    await expect(service.remove(1, fakeReq)).rejects.toThrow(AppError);
    await expect(service.remove(1, fakeReq)).rejects.toThrow('لا يمكن حذف مصروف معتمد');
  });

  it('throws conflict when removing REVERSED expense', async () => {
    mockPrisma.expense.findUnique.mockResolvedValue({ ...pendingExpense, status: 'REVERSED' });
    await expect(service.remove(1, fakeReq)).rejects.toThrow('لا يمكن حذف مصروف معكوس');
  });

  it('allows delete on PENDING expense', async () => {
    mockPrisma.expense.findUnique.mockResolvedValue(pendingExpense);
    mockPrisma.expense.delete.mockResolvedValue({});
    const result = await service.remove(1, fakeReq);
    expect(result).toEqual({ deleted: true });
  });

  it('allows delete on REJECTED expense', async () => {
    mockPrisma.expense.findUnique.mockResolvedValue({ ...pendingExpense, status: 'REJECTED' });
    mockPrisma.expense.delete.mockResolvedValue({});
    const result = await service.remove(1, fakeReq);
    expect(result).toEqual({ deleted: true });
  });
});

describe('ExpensesService.cancel — guards', () => {
  let service: ExpensesService;

  beforeEach(() => {
    service = new ExpensesService();
    vi.clearAllMocks();
  });

  it('throws notFound when expense does not exist', async () => {
    mockPrisma.expense.findUnique.mockResolvedValue(null);
    await expect(service.cancel(999, fakeReq)).rejects.toThrow('المصروف غير موجود');
  });

  it('throws badRequest when cancelling non-PENDING expense', async () => {
    mockPrisma.expense.findUnique.mockResolvedValue({ ...pendingExpense, status: 'APPROVED' });
    await expect(service.cancel(1, fakeReq)).rejects.toThrow('يمكن إلغاء المصاريف المعلّقة فقط');
  });

  it('allows cancel on PENDING expense', async () => {
    mockPrisma.expense.findUnique.mockResolvedValue(pendingExpense);
    mockPrisma.expense.update.mockResolvedValue({ ...pendingExpense, status: 'CANCELLED' });
    const result = await service.cancel(1, fakeReq);
    expect(result).toMatchObject({ status: 'CANCELLED' });
  });
});

describe('ExpensesService.reject — guards', () => {
  let service: ExpensesService;

  beforeEach(() => {
    service = new ExpensesService();
    vi.clearAllMocks();
  });

  it('throws notFound when expense does not exist', async () => {
    mockPrisma.expense.findUnique.mockResolvedValue(null);
    await expect(service.reject(999, fakeReq)).rejects.toThrow('المصروف غير موجود');
  });

  it('throws badRequest when rejecting APPROVED expense', async () => {
    mockPrisma.expense.findUnique.mockResolvedValue({ ...pendingExpense, status: 'APPROVED' });
    await expect(service.reject(1, fakeReq))
      .rejects.toThrow('لا يمكن رفض مصروف معتمد — استخدم إلغاء الاعتماد');
  });
});
