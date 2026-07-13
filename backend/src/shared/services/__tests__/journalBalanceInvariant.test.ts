import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../config/database', () => ({ prisma: { $transaction: vi.fn() } }));

import { createBalancedJournal } from '../gl.service';
import { validateJournalBalance } from '../../../modules/accounting/accounting.utils';

/**
 * ثابت توازن القيد — من «فلس كامل مسموح» إلى دقّة الدينار.
 *
 * كان الحارسان (المركزي في `gl.service` واليدوي في `accounting.utils`) يقارنان بـ
 * `Math.abs(d - c) > 0.001` — أي أنهما **يسمحان بفارق يساوي أصغر وحدة نقدية في الدينار**.
 * قيد مختلّ بفلس واحد كان يمرّ صامتًا ويستقرّ في الأستاذ العام. وكان الحارس اليدوي يجمع
 * **بلا تقريب** أصلًا، فيقيس تمثيلًا ثنائيًا لا مبالغ.
 *
 * القاعدة الآن: قرّب الطرفين بالسياسة القانونية، ثم قارن بتسامح تنفيذي (1e-6) لضجيج
 * الثنائي وحده.
 */

/** عميل معاملة وهمي — يلتقط ما يُكتب ويسمح بمرور قفل الفترة (بلا فاعل ⇒ يمرّ). */
function makeTx() {
  return {
    journalEntry: {
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({ id: 1 }),
    },
    setting: { findUnique: vi.fn().mockResolvedValue(null) }, // لا قفل فترة
    auditLog: { create: vi.fn() },
  };
}

const line = (debit: number, credit: number) => ({
  accountId: 1,
  debit,
  credit,
  description: 'سطر',
});

let tx: ReturnType<typeof makeTx>;
beforeEach(() => {
  vi.clearAllMocks();
  tx = makeTx();
});

const post = (lines: { accountId: number; debit: number; credit: number; description: string }[]) =>
  createBalancedJournal(tx as never, {
    date: new Date(2026, 6, 1),
    description: 'قيد',
    referenceType: 'TEST',
    referenceId: 1,
    lines,
  });

describe('الحارس المركزي — createBalancedJournal', () => {
  it('قيد متوازن تمامًا يمرّ ويُكتب', async () => {
    await post([line(100, 0), line(0, 100)]);
    expect(tx.journalEntry.create).toHaveBeenCalledTimes(1);
  });

  it('ضجيج الثنائي يمرّ — 0.1 + 0.2 مقابل 0.3 ليس اختلالًا', async () => {
    await post([line(0.1, 0), line(0.2, 0), line(0, 0.3)]);
    expect(tx.journalEntry.create).toHaveBeenCalledTimes(1);
  });

  it('**فارق فلس واحد (0.001) يُرفض** — وكان يمرّ قبل هذه الحزمة', async () => {
    await expect(post([line(100.001, 0), line(0, 100)])).rejects.toThrow(/غير متوازن/);
    expect(tx.journalEntry.create).not.toHaveBeenCalled(); // يُرفض **قبل** الكتابة
  });

  it('فارق فلسين (0.002) يُرفض', async () => {
    await expect(post([line(100.002, 0), line(0, 100)])).rejects.toThrow(/غير متوازن/);
    expect(tx.journalEntry.create).not.toHaveBeenCalled();
  });

  it('فارق كبير يُرفض', async () => {
    await expect(post([line(150, 0), line(0, 100)])).rejects.toThrow(/غير متوازن/);
  });

  it('المبالغ الكسرية المتوازنة تمرّ (تقريب متطابق على الطرفين)', async () => {
    // 33.333 + 33.333 + 33.334 = 100.000
    await post([line(33.333, 0), line(33.333, 0), line(33.334, 0), line(0, 100)]);
    expect(tx.journalEntry.create).toHaveBeenCalledTimes(1);
  });
});

describe('حارس القيد اليدوي — validateJournalBalance', () => {
  it('قيد متوازن يمرّ', () => {
    expect(() => validateJournalBalance([{ debit: 50 }, { credit: 50 }])).not.toThrow();
  });

  it('ضجيج الثنائي يمرّ', () => {
    expect(() => validateJournalBalance([{ debit: 0.1 }, { debit: 0.2 }, { credit: 0.3 }])).not.toThrow();
  });

  it('**فارق فلس واحد يُرفض** — الحارسان صارا بمعيار واحد', () => {
    expect(() => validateJournalBalance([{ debit: 100.001 }, { credit: 100 }])).toThrow(/غير متوازن/);
  });

  it('فارق فلسين يُرفض', () => {
    expect(() => validateJournalBalance([{ debit: 100.002 }, { credit: 100 }])).toThrow(/غير متوازن/);
  });

  it('السطر الواحد ما زال مرفوضًا — قاعدة قائمة لم تُمسّ', () => {
    expect(() => validateJournalBalance([{ debit: 100 }])).toThrow(/سطرين على الأقل/);
  });
});
