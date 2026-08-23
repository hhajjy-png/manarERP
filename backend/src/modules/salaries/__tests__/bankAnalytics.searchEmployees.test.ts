import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../config/database', () => ({
  prisma: { employee: { findMany: vi.fn() } },
}));

import { bankAnalyticsService } from '../salaries.bankAnalytics.service';
import { prisma } from '../../../config/database';
import { ENUMS } from '../../../config/constants';

const db = prisma as unknown as { employee: { findMany: ReturnType<typeof vi.fn> } };

/**
 * Financial Accuracy Hotfix Pack v1 — البند 4.
 *
 * كان الفلتر `status: 'active'` والقيمة المخزَّنة `'ACTIVE'`. مقارنة النصوص في SQLite
 * حساسة لحالة الأحرف، فكان بحث الموظفين في تحليل رواتب البنك يعيد قائمة فارغة دائمًا.
 */

beforeEach(() => {
  vi.clearAllMocks();
  db.employee.findMany.mockResolvedValue([
    { id: 1, code: 'E-001', fullName: 'حسن العلي', fullNameEn: 'Hassan', civilId: '2900101', bankAccount: 'KW01' },
  ]);
});

describe('bankAnalyticsService.searchEmployees', () => {
  it('يفلتر بالقيمة المخزَّنة ACTIVE بحالتها الصحيحة (الانحدار المُصلَح)', async () => {
    await bankAnalyticsService.searchEmployees('حسن');

    const where = db.employee.findMany.mock.calls[0]![0].where;
    expect(where.status).toBe('ACTIVE');
    expect(where.status).not.toBe('active');
  });

  it('القيمة المستخدَمة موجودة فعلًا في تعداد حالات الموظف', () => {
    expect(ENUMS.employeeStatus).toContain('ACTIVE');
    expect(ENUMS.employeeStatus).not.toContain('active');
  });

  it('يعيد الموظفين المطابقين بدل قائمة فارغة', async () => {
    const rows = await bankAnalyticsService.searchEmployees('حسن');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ code: 'E-001', fullName: 'حسن العلي' });
  });

  it('يبحث في الرقم والاسم العربي والإنجليزي والرقم المدني', async () => {
    await bankAnalyticsService.searchEmployees('2900');

    const where = db.employee.findMany.mock.calls[0]![0].where;
    expect(where.OR.map((b: Record<string, unknown>) => Object.keys(b)[0])).toEqual([
      'code', 'fullName', 'fullNameEn', 'civilId',
    ]);
  });

  it('لا يستعلم إطلاقًا عند بحث فارغ', async () => {
    expect(await bankAnalyticsService.searchEmployees('   ')).toEqual([]);
    expect(db.employee.findMany).not.toHaveBeenCalled();
  });
});
