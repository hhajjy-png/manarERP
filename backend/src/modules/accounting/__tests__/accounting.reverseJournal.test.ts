import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../config/database', () => ({
  prisma: {
    journalEntry: { findUniqueOrThrow: vi.fn(), findFirst: vi.fn() },
    $transaction: vi.fn(),
  },
}));

vi.mock('../../../core/middleware/audit', () => ({ recordAudit: vi.fn() }));

import { prisma } from '../../../config/database';
import { recordAudit } from '../../../core/middleware/audit';
import { accountingService } from '../accounting.service';
import { runWithRequestActor } from '../../../core/context/requestContext';
import { AppError } from '../../../core/errors/AppError';
import type { Request } from 'express';

const p = prisma as unknown as {
  journalEntry: { findUniqueOrThrow: ReturnType<typeof vi.fn>; findFirst: ReturnType<typeof vi.fn> };
  $transaction: ReturnType<typeof vi.fn>;
};

const ORIGINAL = {
  id: 42,
  entryNumber: 'JRN-2024-00007',
  date: new Date(2024, 11, 15),
  status: 'POSTED',
  referenceType: 'MANUAL',
  lines: [
    { accountId: 1, description: 'مدين', debit: 100, credit: 0 },
    { accountId: 2, description: 'دائن', debit: 0, credit: 100 },
  ],
};

/** عميل معاملة وهمي: يلتقط ما يُكتب ويحاكي قراءة إعداد القفل. */
function makeTxClient(lockValue: string | null = null) {
  const created: Record<string, unknown>[] = [];
  const tx = {
    journalEntry: {
      findFirst: vi.fn().mockResolvedValue(null), // generateEntryNumber → أول رقم
      create: vi.fn().mockImplementation((arg) => { created.push(arg.data); return { id: 99, ...arg.data }; }),
    },
    setting: { findUnique: vi.fn().mockResolvedValue(lockValue ? { value: lockValue } : null) },
    auditLog: { create: vi.fn().mockResolvedValue({ id: 1 }) },
  };
  return { tx, created };
}

function fakeReq(user: { userId: number; roleName: string } | null, permissions: string[] = []): Request {
  return { user: user ?? undefined, permissions, ip: '127.0.0.1' } as unknown as Request;
}

beforeEach(() => {
  vi.clearAllMocks();
  p.journalEntry.findFirst.mockResolvedValue(null); // لا عكس سابق
});

describe('reverseJournalEntry — guards', () => {
  it('rejects reversing an entry that is not POSTED', async () => {
    p.journalEntry.findUniqueOrThrow.mockResolvedValue({ ...ORIGINAL, status: 'CANCELLED' });
    await expect(accountingService.reverseJournalEntry(42, {}, fakeReq(null))).rejects.toThrow(AppError);
    expect(p.$transaction).not.toHaveBeenCalled();
  });

  it('rejects reversing a reversal entry', async () => {
    p.journalEntry.findUniqueOrThrow.mockResolvedValue({ ...ORIGINAL, referenceType: 'MANUAL_REVERSAL' });
    await expect(accountingService.reverseJournalEntry(42, {}, fakeReq(null))).rejects.toThrow(/عكسي/);
  });

  it('rejects reversing a document-linked entry (invoice/expense/payroll)', async () => {
    p.journalEntry.findUniqueOrThrow.mockResolvedValue({ ...ORIGINAL, referenceType: 'INVOICE' });
    await expect(accountingService.reverseJournalEntry(42, {}, fakeReq(null))).rejects.toThrow(/مستند/);
  });

  it('rejects a second reversal of the same entry', async () => {
    p.journalEntry.findUniqueOrThrow.mockResolvedValue(ORIGINAL);
    p.journalEntry.findFirst.mockResolvedValue({ id: 5, entryNumber: 'JRN-2024-00050' });
    await expect(accountingService.reverseJournalEntry(42, {}, fakeReq(null))).rejects.toThrow(/معكوس بالفعل/);
    expect(p.$transaction).not.toHaveBeenCalled();
  });
});

describe('reverseJournalEntry — reversal date', () => {
  beforeEach(() => {
    p.journalEntry.findUniqueOrThrow.mockResolvedValue(ORIGINAL);
  });

  it('defaults the reversal date to the original entry date, not today', async () => {
    const { tx, created } = makeTxClient();
    p.$transaction.mockImplementation((cb: any) => cb(tx));

    await accountingService.reverseJournalEntry(42, {}, fakeReq(null));

    expect(created[0].date).toEqual(new Date(2024, 11, 15));
    expect(created[0].entryNumber).toBe('JRN-2024-00001'); // الرقم يتبع سنة القيد
    // الأطراف مقلوبة
    const lines = (created[0].lines as any).create;
    expect(lines[0]).toMatchObject({ accountId: 1, debit: 0, credit: 100 });
    expect(lines[1]).toMatchObject({ accountId: 2, debit: 100, credit: 0 });
  });

  it('uses an explicit reversalDate when supplied', async () => {
    const { tx, created } = makeTxClient();
    p.$transaction.mockImplementation((cb: any) => cb(tx));

    await accountingService.reverseJournalEntry(42, { reversalDate: new Date(2026, 6, 10) }, fakeReq(null));

    expect(created[0].date).toEqual(new Date(2026, 6, 10));
    expect(created[0].entryNumber).toBe('JRN-2026-00001');
  });

  it('records a full audit trail of the reversal', async () => {
    const { tx } = makeTxClient();
    p.$transaction.mockImplementation((cb: any) => cb(tx));

    await accountingService.reverseJournalEntry(42, { reason: 'تصحيح' }, fakeReq({ userId: 3, roleName: 'ACCOUNTANT' }));

    expect(recordAudit).toHaveBeenCalledWith(expect.objectContaining({ action: 'REVERSE', module: 'accounting', entityId: 42 }));
  });
});

describe('reverseJournalEntry — period lock', () => {
  beforeEach(() => {
    p.journalEntry.findUniqueOrThrow.mockResolvedValue(ORIGINAL);
  });

  it('blocks reversing into a locked period for a user without override', async () => {
    const { tx } = makeTxClient('2025-01-01'); // القفل يمنع ما قبل 2025
    p.$transaction.mockImplementation((cb: any) => cb(tx));

    await runWithRequestActor(fakeReq({ userId: 4, roleName: 'ACCOUNTANT' }), async () => {
      // العكس الافتراضي بتاريخ 2024 → مقفل
      await expect(accountingService.reverseJournalEntry(42, {}, fakeReq({ userId: 4, roleName: 'ACCOUNTANT' })))
        .rejects.toThrow(/مقفلة/);
    });
  });

  it('allows an override user and audits the override', async () => {
    const { tx } = makeTxClient('2025-01-01');
    p.$transaction.mockImplementation((cb: any) => cb(tx));

    await runWithRequestActor(fakeReq({ userId: 1, roleName: 'SYSTEM_ADMIN' }), async () => {
      await accountingService.reverseJournalEntry(42, {}, fakeReq({ userId: 1, roleName: 'SYSTEM_ADMIN' }));
    });
    expect(tx.auditLog.create).toHaveBeenCalledTimes(1); // سجل تجاوز القفل
  });
});
