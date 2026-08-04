import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AppError } from '../../../core/errors/AppError';

vi.mock('../../../config/database', () => ({
  prisma: {
    expense: { findUnique: vi.fn(), findFirst: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn(), count: vi.fn() },
    journalEntry: { count: vi.fn() },
  },
}));
vi.mock('../../../core/middleware/audit', () => ({ recordAudit: vi.fn() }));
vi.mock('../../transactions/transactions.service', () => ({ transactionsService: { postEntry: vi.fn(), clearByReference: vi.fn() } }));
vi.mock('../expenses.accounting', () => ({ repostExpenseToGL: vi.fn(), reverseExpenseFromGL: vi.fn() }));

import { ExpensesService } from '../expenses.service';
import { prisma } from '../../../config/database';

const mockPrisma = prisma as unknown as {
  expense: {
    findUnique: ReturnType<typeof vi.fn>;
    findFirst: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    delete: ReturnType<typeof vi.fn>;
    count: ReturnType<typeof vi.fn>;
  };
  journalEntry: { count: ReturnType<typeof vi.fn> };
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
    mockPrisma.journalEntry.count.mockResolvedValue(0); // default: no attached journals
  });

  it('throws notFound when expense does not exist', async () => {
    mockPrisma.expense.findUnique.mockResolvedValue(null);
    await expect(service.remove(999, fakeReq)).rejects.toThrow('المصروف غير موجود');
  });

  it('blocks deleting a PENDING expense that still carries journal entries (amended)', async () => {
    // After an amend, an expense returns to PENDING but keeps a reversed journal pair.
    // A plain delete would orphan those journals — must be refused.
    mockPrisma.expense.findUnique.mockResolvedValue(pendingExpense);
    mockPrisma.journalEntry.count.mockResolvedValue(2);
    await expect(service.remove(1, fakeReq)).rejects.toThrow('استخدم الحذف النهائي');
    expect(mockPrisma.expense.delete).not.toHaveBeenCalled();
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

describe('ExpensesService.create — code generation (collision-safe)', () => {
  let service: ExpensesService;

  beforeEach(() => {
    service = new ExpensesService();
    vi.clearAllMocks();
  });

  const baseInput = {
    category: 'FUEL', description: 'وقود', amount: 100,
  } as unknown as import('../expenses.schema').CreateExpenseInput;

  it('derives next code from the last row sequence, not the row count', async () => {
    // Reproduces the deletion-collision bug: 3 rows created (…00001–00003),
    // the MIDDLE one deleted → only 2 rows remain but max sequence is 00003.
    // count()+1 would have produced EXP-<year>-00003 (collides). The id-desc
    // approach must produce …00004.
    const year = new Date().getFullYear();
    mockPrisma.expense.findFirst.mockResolvedValue({ code: `EXP-${year}-00003` });
    let createdCode = '';
    mockPrisma.expense.create.mockImplementation(({ data }: { data: { code: string } }) => {
      createdCode = data.code;
      return Promise.resolve({ id: 4, ...data });
    });

    await service.create(baseInput, fakeReq);
    expect(createdCode).toBe(`EXP-${year}-00004`);
  });

  it('starts at 00001 when no expenses exist for the year', async () => {
    const year = new Date().getFullYear();
    mockPrisma.expense.findFirst.mockResolvedValue(null);
    let createdCode = '';
    mockPrisma.expense.create.mockImplementation(({ data }: { data: { code: string } }) => {
      createdCode = data.code;
      return Promise.resolve({ id: 1, ...data });
    });

    await service.create(baseInput, fakeReq);
    expect(createdCode).toBe(`EXP-${year}-00001`);
  });

  it('honours a client-supplied code without auto-generating', async () => {
    let createdCode = '';
    mockPrisma.expense.create.mockImplementation(({ data }: { data: { code: string } }) => {
      createdCode = data.code;
      return Promise.resolve({ id: 9, ...data });
    });

    await service.create({ ...baseInput, code: 'EXP-CUSTOM-1' }, fakeReq);
    expect(createdCode).toBe('EXP-CUSTOM-1');
    expect(mockPrisma.expense.findFirst).not.toHaveBeenCalled();
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

describe('ExpensesService — accounting period validation (date vs billingMonth/billingYear)', () => {
  let service: ExpensesService;

  beforeEach(() => {
    service = new ExpensesService();
    vi.clearAllMocks();
  });

  const inPeriodInput = {
    category: 'FUEL', description: 'وقود', amount: 100,
    date: new Date(2026, 6, 15), billingMonth: 7, billingYear: 2026,
  } as unknown as import('../expenses.schema').CreateExpenseInput;

  const outOfPeriodInput = {
    category: 'FUEL', description: 'وقود', amount: 100,
    date: new Date(2026, 5, 30), billingMonth: 7, billingYear: 2026,
  } as unknown as import('../expenses.schema').CreateExpenseInput;

  it('create — blocks saving when the expense date falls outside billingMonth/billingYear', async () => {
    await expect(service.create(outOfPeriodInput, fakeReq))
      .rejects.toThrow('لا يمكن حفظ المستند');
    expect(mockPrisma.expense.create).not.toHaveBeenCalled();
  });

  it('create — allows saving when the expense date falls inside billingMonth/billingYear', async () => {
    mockPrisma.expense.create.mockResolvedValue({ id: 10, ...inPeriodInput });
    await expect(service.create(inPeriodInput, fakeReq)).resolves.toBeDefined();
    expect(mockPrisma.expense.create).toHaveBeenCalledOnce();
  });

  it('update — blocks moving the expense date outside its existing billingMonth/billingYear', async () => {
    mockPrisma.expense.findUnique.mockResolvedValue({
      ...pendingExpense, date: new Date(2026, 6, 15), billingMonth: 7, billingYear: 2026,
    });
    await expect(service.update(1, { date: new Date(2026, 7, 1) }, fakeReq))
      .rejects.toThrow('لا يمكن حفظ المستند');
    expect(mockPrisma.expense.update).not.toHaveBeenCalled();
  });

  it('update — blocks moving billingMonth away from the existing (unchanged) date', async () => {
    mockPrisma.expense.findUnique.mockResolvedValue({
      ...pendingExpense, date: new Date(2026, 6, 15), billingMonth: 7, billingYear: 2026,
    });
    await expect(service.update(1, { billingMonth: 6 }, fakeReq))
      .rejects.toThrow('لا يمكن حفظ المستند');
    expect(mockPrisma.expense.update).not.toHaveBeenCalled();
  });

  it('update — allows a same-period date change', async () => {
    mockPrisma.expense.findUnique.mockResolvedValue({
      ...pendingExpense, date: new Date(2026, 6, 15), billingMonth: 7, billingYear: 2026,
    });
    mockPrisma.expense.update.mockResolvedValue({ ...pendingExpense, date: new Date(2026, 6, 20) });
    await expect(service.update(1, { date: new Date(2026, 6, 20) }, fakeReq)).resolves.toBeDefined();
    expect(mockPrisma.expense.update).toHaveBeenCalledOnce();
  });

  it('update — no billingMonth/billingYear on the record at all → no period to violate', async () => {
    mockPrisma.expense.findUnique.mockResolvedValue(pendingExpense); // no billingMonth/billingYear
    mockPrisma.expense.update.mockResolvedValue({ ...pendingExpense, amount: 999 });
    await expect(service.update(1, { amount: 999 }, fakeReq)).resolves.toBeDefined();
    expect(mockPrisma.expense.update).toHaveBeenCalledOnce();
  });
});
