import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../config/database', () => ({ prisma: {} }));

import { createBalancedJournal, reverseGL, generateEntryNumber } from '../gl.service';
import { resolvePayrollPostingDate } from '../../../modules/payroll/payroll.accounting';

/**
 * انحدارات تاريخ الترحيل.
 *
 * كانت ثلاثة مواضع تشتقّ التاريخ من ساعة الجهاز بدل تاريخ المستند:
 *   1. قيد الرواتب (`new Date()` بدل شهر/سنة الراتب).
 *   2. القيد العكسي (`new Date()` بدل تاريخ القيد الأصلي).
 *   3. رقم القيد (`JRN-<سنة اليوم>` بدل `JRN-<سنة القيد>`).
 * الاختبارات تعمل خارج سياق طلب HTTP، فحارس قفل الفترة يمرّ دون قراءة إعدادات.
 */

function makeTx() {
  return {
    journalEntry: {
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({ id: 1 }),
    },
  };
}

const BALANCED = [
  { accountId: 1, debit: 100, credit: 0, description: 'مدين' },
  { accountId: 2, debit: 0, credit: 100, description: 'دائن' },
];

const createdEntry = (tx: ReturnType<typeof makeTx>) => tx.journalEntry.create.mock.calls[0][0].data;

beforeEach(() => vi.clearAllMocks());

describe('generateEntryNumber', () => {
  it('derives the year prefix from the entry date, not from today', async () => {
    const tx = { journalEntry: { findFirst: vi.fn().mockResolvedValue(null) } };
    const number = await generateEntryNumber(tx as never, new Date(2024, 11, 15));
    expect(number).toBe('JRN-2024-00001');
    expect(tx.journalEntry.findFirst.mock.calls[0][0].where.entryNumber.startsWith).toBe('JRN-2024-');
  });

  it('continues the sequence within the entry year', async () => {
    const tx = { journalEntry: { findFirst: vi.fn().mockResolvedValue({ entryNumber: 'JRN-2024-00041' }) } };
    expect(await generateEntryNumber(tx as never, new Date(2024, 0, 5))).toBe('JRN-2024-00042');
  });

  it('numbers a current-year entry independently of historical years', async () => {
    const tx = { journalEntry: { findFirst: vi.fn().mockResolvedValue(null) } };
    expect(await generateEntryNumber(tx as never, new Date(2026, 6, 10))).toBe('JRN-2026-00001');
  });
});

describe('createBalancedJournal', () => {
  it('posts a 2024-dated document into 2024, with a 2024 entry number', async () => {
    const tx = makeTx();
    const issueDate = new Date(2024, 11, 15);

    await createBalancedJournal(tx as never, {
      date: issueDate,
      description: 'فاتورة مبيعات',
      referenceType: 'INVOICE',
      referenceId: 5,
      lines: BALANCED,
    });

    const entry = createdEntry(tx);
    expect(entry.date).toBe(issueDate);
    expect(entry.date.getFullYear()).toBe(2024);
    expect(entry.entryNumber).toBe('JRN-2024-00001');
  });

  it('rejects an unbalanced entry before writing anything', async () => {
    const tx = makeTx();
    await expect(
      createBalancedJournal(tx as never, {
        date: new Date(2024, 0, 1),
        description: 'غير متوازن',
        referenceType: 'INVOICE',
        referenceId: 1,
        lines: [{ accountId: 1, debit: 100, credit: 0, description: 'x' }],
      }),
    ).rejects.toThrow(/غير متوازن/);
    expect(tx.journalEntry.create).not.toHaveBeenCalled();
  });
});

describe('reverseGL', () => {
  const original = {
    id: 1,
    date: new Date(2024, 11, 15),
    lines: [
      { accountId: 1, debit: 100, credit: 0, description: 'مدين' },
      { accountId: 2, debit: 0, credit: 100, description: 'دائن' },
    ],
  };

  function reversalTx() {
    return {
      journalEntry: {
        // 1) القيد الأصلي  2) فحص وجود عكس سابق  3) توليد الرقم
        findFirst: vi.fn()
          .mockResolvedValueOnce(original)
          .mockResolvedValueOnce(null)
          .mockResolvedValueOnce(null),
        create: vi.fn().mockResolvedValue({ id: 2 }),
      },
    };
  }

  it('dates the reversal on the original entry date, not today', async () => {
    const tx = reversalTx();
    await reverseGL(tx as never, 'EXPENSE', 7, 'EXPENSE_REVERSAL');

    const entry = createdEntry(tx);
    expect(entry.date).toEqual(new Date(2024, 11, 15));
    expect(entry.date.getFullYear()).toBe(2024);
    // ويتبع الرقم سنة القيد لا سنة اليوم.
    expect(entry.entryNumber).toBe('JRN-2024-00001');
  });

  it('swaps debit and credit', async () => {
    const tx = reversalTx();
    await reverseGL(tx as never, 'EXPENSE', 7, 'EXPENSE_REVERSAL');
    const lines = createdEntry(tx).lines.create;
    expect(lines[0]).toMatchObject({ accountId: 1, debit: 0, credit: 100 });
    expect(lines[1]).toMatchObject({ accountId: 2, debit: 100, credit: 0 });
  });

  it('honours an explicit reversalDate when the correction belongs to a later period', async () => {
    const tx = reversalTx();
    const explicit = new Date(2026, 6, 10);
    await reverseGL(tx as never, 'EXPENSE', 7, 'EXPENSE_REVERSAL', { reversalDate: explicit });

    const entry = createdEntry(tx);
    expect(entry.date).toBe(explicit);
    expect(entry.entryNumber).toBe('JRN-2026-00001');
  });

  it('does nothing when the original was never posted', async () => {
    const tx = { journalEntry: { findFirst: vi.fn().mockResolvedValue(null), create: vi.fn() } };
    await reverseGL(tx as never, 'EXPENSE', 7, 'EXPENSE_REVERSAL');
    expect(tx.journalEntry.create).not.toHaveBeenCalled();
  });

  it('does not create a second reversal', async () => {
    const tx = {
      journalEntry: {
        findFirst: vi.fn().mockResolvedValueOnce(original).mockResolvedValueOnce({ id: 99 }),
        create: vi.fn(),
      },
    };
    await reverseGL(tx as never, 'EXPENSE', 7, 'EXPENSE_REVERSAL');
    expect(tx.journalEntry.create).not.toHaveBeenCalled();
  });
});

describe('resolvePayrollPostingDate', () => {
  it('uses the last day of the payroll month when no payment date is given', () => {
    expect(resolvePayrollPostingDate({ month: 12, year: 2024 })).toEqual(new Date(2024, 11, 31));
  });

  it('handles February in a leap year', () => {
    expect(resolvePayrollPostingDate({ month: 2, year: 2024 })).toEqual(new Date(2024, 1, 29));
  });

  it('handles February in a non-leap year', () => {
    expect(resolvePayrollPostingDate({ month: 2, year: 2025 })).toEqual(new Date(2025, 1, 28));
  });

  it('prefers an explicit payment date', () => {
    const paid = new Date(2025, 0, 5);
    expect(resolvePayrollPostingDate({ month: 12, year: 2024 }, paid)).toBe(paid);
  });

  it('falls back to the month end when the payment date is null', () => {
    expect(resolvePayrollPostingDate({ month: 6, year: 2026 }, null)).toEqual(new Date(2026, 5, 30));
  });
});
