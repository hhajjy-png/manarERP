import { describe, it, expect, vi, beforeEach } from 'vitest';

// Bug C4 regression: approving an expense posts to BOTH the legacy single-entry
// `transaction` table (which the dashboard sums) AND the double-entry GL. Reversing the
// approval must clean up BOTH — otherwise the reversed expense stays counted in the
// dashboard's expense total forever. This mirrors invoice cancellation
// (clearByReference + reverse GL).

const { clearByReference, postEntry, reverseExpenseFromGL, postExpenseToGL } = vi.hoisted(() => ({
  clearByReference: vi.fn(),
  postEntry: vi.fn(),
  reverseExpenseFromGL: vi.fn(),
  postExpenseToGL: vi.fn(),
}));

vi.mock('../../../config/database', () => {
  const tx = { expense: { update: vi.fn() } };
  return {
    prisma: {
      expense: { findUnique: vi.fn() },
      $transaction: vi.fn(async (cb: (t: typeof tx) => unknown) => cb(tx)),
      __tx: tx,
    },
  };
});
vi.mock('../../../core/middleware/audit', () => ({ recordAudit: vi.fn() }));
vi.mock('../../transactions/transactions.service', () => ({
  transactionsService: { postEntry, clearByReference },
}));
vi.mock('../expenses.accounting', () => ({ postExpenseToGL, reverseExpenseFromGL }));

import { prisma } from '../../../config/database';
import { ExpensesService } from '../expenses.service';

const tx = (prisma as unknown as { __tx: any }).__tx;
const fakeReq = { user: { userId: 1 } } as unknown as import('express').Request;

const approvedExpense = {
  id: 7, code: 'EXP-2026-00007', category: 'FUEL',
  description: 'وقود', amount: 30, date: new Date('2026-06-01'),
  status: 'APPROVED', paymentMethod: 'CASH',
};

describe('ExpensesService.cancelApproval — dual-system cleanup (bug C4)', () => {
  let service: ExpensesService;

  beforeEach(() => {
    service = new ExpensesService();
    vi.clearAllMocks();
    tx.expense.update.mockResolvedValue({ ...approvedExpense, status: 'REVERSED' });
  });

  it('reverses the GL so the reversed expense leaves every total — single source, no legacy ledger', async () => {
    vi.mocked(prisma.expense.findUnique).mockResolvedValue(approvedExpense as any);

    await service.cancelApproval(7, fakeReq);

    // Dashboard/P&L now read the GL; reversing the GL entry removes the expense from all
    // totals. The legacy Transaction ledger was retired, so there is no parallel cleanup.
    expect(reverseExpenseFromGL).toHaveBeenCalledWith(tx, 7);
    expect(clearByReference).not.toHaveBeenCalled();
  });

  it('also reverses the double-entry GL (audit-preserving reversal)', async () => {
    vi.mocked(prisma.expense.findUnique).mockResolvedValue(approvedExpense as any);

    await service.cancelApproval(7, fakeReq);

    expect(reverseExpenseFromGL).toHaveBeenCalledOnce();
    expect(reverseExpenseFromGL).toHaveBeenCalledWith(tx, 7);
  });

  it('sets the expense status to REVERSED', async () => {
    vi.mocked(prisma.expense.findUnique).mockResolvedValue(approvedExpense as any);

    const result = await service.cancelApproval(7, fakeReq);

    expect(tx.expense.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 7 }, data: { status: 'REVERSED' } }),
    );
    expect(result).toMatchObject({ status: 'REVERSED' });
  });

  it('refuses to reverse a non-APPROVED expense', async () => {
    vi.mocked(prisma.expense.findUnique).mockResolvedValue({ ...approvedExpense, status: 'PENDING' } as any);

    await expect(service.cancelApproval(7, fakeReq)).rejects.toThrow('لا يمكن إلغاء اعتماد مصروف غير معتمد');
    expect(clearByReference).not.toHaveBeenCalled();
    expect(reverseExpenseFromGL).not.toHaveBeenCalled();
  });
});
