import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@config/database.js', () => ({
  prisma: {
    bankStatementImport:      { findUniqueOrThrow: vi.fn() },
    bankStatementTransaction: { count: vi.fn(), findMany: vi.fn(), groupBy: vi.fn(), aggregate: vi.fn() },
  },
}));

import { getWorkspace } from '../reconciliationEngine.js';
import { prisma } from '@config/database.js';

const db = prisma as unknown as {
  bankStatementImport:      { findUniqueOrThrow: ReturnType<typeof vi.fn> };
  bankStatementTransaction: {
    count: ReturnType<typeof vi.fn>; findMany: ReturnType<typeof vi.fn>;
    groupBy: ReturnType<typeof vi.fn>; aggregate: ReturnType<typeof vi.fn>;
  };
};

/**
 * Financial Accuracy Hotfix Pack v1 — البند 2.
 *
 * السيناريو الحي من الاستيراد #36 في بيانات التطوير: ملفٌ فيه 60 صفًا، لم يُدرَج منه
 * إلا 3 صفوف جديدة (57 تُخُطِّيت كمكررات). كانت المساحة تعرض إجماليات الملف كاملًا
 * (81,939.400 مدين) فوق قائمة تحوي ثلاث عمليات مجموعها 1,500.100 — تضخيم 54.6×.
 */
const FILE_DEBITS  = 81_939.400;
const FILE_CREDITS = 87_600.300;
const STORED_DEBITS  = 1_500.100;
const STORED_CREDITS = 0;

beforeEach(() => {
  vi.clearAllMocks();
  db.bankStatementImport.findUniqueOrThrow.mockResolvedValue({
    id: 36,
    bankName: 'GULF_BANK',
    fileName: 'gulf-august.xlsx',
    importedAt: new Date('2026-08-20T10:00:00.000Z'),
    totalRows: 60,
    totalDebits: FILE_DEBITS,
    totalCredits: FILE_CREDITS,
    accountKey: 'BANK:GULF_BANK',
  });
  db.bankStatementTransaction.count.mockResolvedValue(3);
  db.bankStatementTransaction.findMany.mockResolvedValue([]);
  db.bankStatementTransaction.groupBy.mockResolvedValue([{ reconcileStatus: 'UNMATCHED', _count: 3 }]);
  db.bankStatementTransaction.aggregate.mockResolvedValue({
    _sum: { debit: STORED_DEBITS, credit: STORED_CREDITS },
    _count: { _all: 3 },
  });
});

describe('getWorkspace — إجماليات المساحة تصف الصفوف المخزَّنة لا الملف', () => {
  it('استيراد تزايدي بـ60 صفًا و3 صفوف جديدة يعرض إجمالي الثلاثة', async () => {
    const ws = await getWorkspace({ importId: 36 });

    expect(ws.storedRows).toBe(3);
    expect(ws.storedDebits).toBe(STORED_DEBITS);
    expect(ws.storedCredits).toBe(STORED_CREDITS);
  });

  it('إجماليات الملف تبقى متاحة منفصلةً ولا تختلط بإجماليات المساحة', async () => {
    const ws = await getWorkspace({ importId: 36 });

    expect(ws.totalRows).toBe(60);
    expect(ws.fileDebits).toBe(FILE_DEBITS);
    expect(ws.fileCredits).toBe(FILE_CREDITS);
    expect(ws.storedDebits).not.toBe(ws.fileDebits);
  });

  it('إجماليات المساحة لا تتبع فلاتر الشاشة ولا الصفحة الحالية', async () => {
    await getWorkspace({ importId: 36, search: 'راتب', page: 2, pageSize: 25 });

    // تجميع الإجماليات يستعلم بـ importId وحده — بلا أي فلتر شاشة.
    expect(db.bankStatementTransaction.aggregate).toHaveBeenCalledWith(
      expect.objectContaining({ where: { importId: 36 } }),
    );
  });

  it('استيراد أول بلا مكررات: إجمالي المساحة = إجمالي الملف', async () => {
    db.bankStatementImport.findUniqueOrThrow.mockResolvedValue({
      id: 37, bankName: 'NBK', fileName: 'nbk.xlsx',
      importedAt: new Date('2026-08-21T10:00:00.000Z'),
      totalRows: 139, totalDebits: 87_963.100, totalCredits: 87_975, accountKey: 'BANK:NBK',
    });
    db.bankStatementTransaction.aggregate.mockResolvedValue({
      _sum: { debit: 87_963.100, credit: 87_975 }, _count: { _all: 139 },
    });

    const ws = await getWorkspace({ importId: 37 });
    expect(ws.storedDebits).toBe(ws.fileDebits);
    expect(ws.storedRows).toBe(ws.totalRows);
  });
});
