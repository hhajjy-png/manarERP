import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../config/database', () => ({ prisma: {} }));

import { Prisma } from '@prisma/client';
import { createBalancedJournal, isEntryNumberCollision } from '../gl.service';

/**
 * حارس تعارض ترقيم القيد (entryNumber) صار مركزيًا داخل createBalancedJournal نفسها
 * (Project Cleanup & Architecture Remediation Pack v1، Phase 1.1) — كان مكرَّرًا سابقًا
 * في invoices.service.ts فقط، وغائبًا تمامًا عن payroll.accounting.ts وexpenses.accounting.ts.
 * هذه الاختبارات تُثبت أن كل مستدعٍ لـ createBalancedJournal يرث الحماية تلقائيًا الآن.
 */

function makeP2002(target: string[] | string) {
  return new Prisma.PrismaClientKnownRequestError('Unique constraint failed on the fields', {
    code: 'P2002',
    clientVersion: '5.18.0',
    meta: { target },
  });
}

const BALANCED = [
  { accountId: 1, debit: 100, credit: 0, description: 'مدين' },
  { accountId: 2, debit: 0, credit: 100, description: 'دائن' },
];

function makeTx(createImpl: () => Promise<{ id: number }>) {
  return {
    journalEntry: {
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockImplementation(createImpl),
    },
  };
}

beforeEach(() => vi.clearAllMocks());

describe('createBalancedJournal — entryNumber collision retry (shared across all callers)', () => {
  it('retries once and succeeds when the first attempt collides on entryNumber', async () => {
    let calls = 0;
    const tx = makeTx(async () => {
      calls++;
      if (calls === 1) throw makeP2002(['entryNumber']);
      return { id: 1 };
    });

    await createBalancedJournal(tx as never, {
      date: new Date(2026, 6, 10),
      description: 'قيد راتب',
      referenceType: 'PAYROLL',
      referenceId: 1,
      lines: BALANCED,
    });

    expect(tx.journalEntry.create).toHaveBeenCalledTimes(2);
  });

  it('exhausts 3 attempts and throws when the collision never clears', async () => {
    const tx = makeTx(async () => {
      throw makeP2002(['entryNumber']);
    });

    await expect(
      createBalancedJournal(tx as never, {
        date: new Date(2026, 6, 10),
        description: 'قيد مصروف',
        referenceType: 'EXPENSE',
        referenceId: 1,
        lines: BALANCED,
      }),
    ).rejects.toSatisfy((e: unknown) => isEntryNumberCollision(e));

    expect(tx.journalEntry.create).toHaveBeenCalledTimes(3);
  });

  it('does not retry on an unrelated unique-constraint conflict', async () => {
    const tx = makeTx(async () => {
      throw makeP2002(['referenceType', 'referenceId']);
    });

    await expect(
      createBalancedJournal(tx as never, {
        date: new Date(2026, 6, 10),
        description: 'قيد فاتورة',
        referenceType: 'INVOICE',
        referenceId: 1,
        lines: BALANCED,
      }),
    ).rejects.toThrow(/Unique constraint/);

    expect(tx.journalEntry.create).toHaveBeenCalledTimes(1);
  });

  it('does not retry on a non-collision business error (e.g. AppError from a caller)', async () => {
    const businessError = new Error('نوع مرجع غير صالح');
    const tx = makeTx(async () => {
      throw businessError;
    });

    await expect(
      createBalancedJournal(tx as never, {
        date: new Date(2026, 6, 10),
        description: 'قيد',
        referenceType: 'INVOICE',
        referenceId: 1,
        lines: BALANCED,
      }),
    ).rejects.toBe(businessError);

    expect(tx.journalEntry.create).toHaveBeenCalledTimes(1);
  });
});
