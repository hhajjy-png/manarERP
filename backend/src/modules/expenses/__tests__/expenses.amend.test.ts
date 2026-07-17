import { describe, it, expect, vi, beforeEach } from 'vitest';

// Safe Approved-Expense Amendment workflow:
//   amend(): APPROVED → reverse GL (audit-preserving) + clear legacy → PENDING (editable)
//   approve() re-run: repostExpenseToGL re-posts the amended value (delete netted pair + fresh post)
// Mirrors the invoices reverse/repost lifecycle. No in-place journal mutation; no AuditLog rewrite.

const { clearByReference, postEntry, reverseExpenseFromGL, repostExpenseToGL } = vi.hoisted(() => ({
  clearByReference: vi.fn(),
  postEntry: vi.fn(),
  reverseExpenseFromGL: vi.fn(),
  repostExpenseToGL: vi.fn(),
}));

vi.mock('../../../config/database', () => {
  const tx = { expense: { update: vi.fn() } };
  return {
    prisma: {
      expense: { findUnique: vi.fn() },
      user: { findUnique: vi.fn() },
      $transaction: vi.fn(async (cb: (t: typeof tx) => unknown) => cb(tx)),
      __tx: tx,
    },
  };
});
vi.mock('../../../core/middleware/audit', () => ({ recordAudit: vi.fn() }));
vi.mock('../../transactions/transactions.service', () => ({
  transactionsService: { postEntry, clearByReference },
}));
vi.mock('../expenses.accounting', () => ({ repostExpenseToGL, reverseExpenseFromGL }));

import { prisma } from '../../../config/database';
import { recordAudit } from '../../../core/middleware/audit';
import { ExpensesService } from '../expenses.service';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const tx = (prisma as unknown as { __tx: any }).__tx;
const fakeReq = { user: { userId: 1 } } as unknown as import('express').Request;

const approvedExpense = {
  id: 7, code: 'EXP-2026-00007', category: 'FUEL',
  description: 'وقود', amount: 30, date: new Date('2026-06-01'),
  status: 'APPROVED', paymentMethod: 'CASH',
};

describe('ExpensesService.amend — safe approved-expense amendment', () => {
  let service: ExpensesService;

  beforeEach(() => {
    service = new ExpensesService();
    vi.clearAllMocks();
    tx.expense.update.mockResolvedValue({ ...approvedExpense, status: 'PENDING' });
  });

  it('reverses the GL (audit-preserving) — single source, no legacy ledger write', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(prisma.expense.findUnique).mockResolvedValue(approvedExpense as any);

    await service.amend(7, fakeReq);

    expect(reverseExpenseFromGL).toHaveBeenCalledWith(tx, 7);
    // legacy Transaction ledger retired — GL is the single accounting source.
    expect(clearByReference).not.toHaveBeenCalled();
  });

  it('returns the expense to PENDING and clears approval metadata', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(prisma.expense.findUnique).mockResolvedValue(approvedExpense as any);

    const result = await service.amend(7, fakeReq);

    expect(tx.expense.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 7 },
        data: expect.objectContaining({ status: 'PENDING', approvedById: null, approvedAt: null }),
      }),
    );
    expect(result).toMatchObject({ status: 'PENDING' });
  });

  it('records an AMEND_UNLOCK audit entry', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(prisma.expense.findUnique).mockResolvedValue(approvedExpense as any);

    await service.amend(7, fakeReq);

    expect(recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'AMEND_UNLOCK', module: 'expenses', entityId: 7 }),
    );
  });

  it('refuses to amend a non-APPROVED expense (no GL side effects)', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(prisma.expense.findUnique).mockResolvedValue({ ...approvedExpense, status: 'PENDING' } as any);

    await expect(service.amend(7, fakeReq)).rejects.toThrow('يمكن فتح التعديل الآمن للمصاريف المعتمدة فقط');
    expect(reverseExpenseFromGL).not.toHaveBeenCalled();
    expect(clearByReference).not.toHaveBeenCalled();
  });

  it('throws notFound when the expense does not exist', async () => {
    vi.mocked(prisma.expense.findUnique).mockResolvedValue(null);
    await expect(service.amend(999, fakeReq)).rejects.toThrow('المصروف غير موجود');
  });
});

describe('ExpensesService.approve — re-approval reposts amended value', () => {
  let service: ExpensesService;

  beforeEach(() => {
    service = new ExpensesService();
    vi.clearAllMocks();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ employeeId: 3 } as any);
    tx.expense.update.mockResolvedValue({ ...approvedExpense, status: 'APPROVED', amount: 55 });
  });

  it('reposts the amended value via repostExpenseToGL (immutable supersede) — no legacy write', async () => {
    // A previously-amended expense sitting at PENDING with amended amount 55.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(prisma.expense.findUnique).mockResolvedValue({ ...approvedExpense, status: 'PENDING', amount: 55 } as any);

    const result = await service.approve(7, fakeReq);

    expect(repostExpenseToGL).toHaveBeenCalledWith(tx, 7);
    // GL is the single source: no legacy Transaction posting/clearing anymore.
    expect(clearByReference).not.toHaveBeenCalled();
    expect(postEntry).not.toHaveBeenCalled();
    expect(result).toMatchObject({ status: 'APPROVED' });
  });

  it('refuses to approve a non-PENDING expense', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(prisma.expense.findUnique).mockResolvedValue(approvedExpense as any);
    await expect(service.approve(7, fakeReq)).rejects.toThrow('يمكن اعتماد المصاريف المعلّقة فقط');
    expect(repostExpenseToGL).not.toHaveBeenCalled();
  });
});
