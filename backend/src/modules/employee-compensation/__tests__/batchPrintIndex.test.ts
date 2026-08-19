import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../config/database', () => ({
  prisma: {
    employee: { findUnique: vi.fn(), findMany: vi.fn() },
    employeeCompensationCalculation: { findUnique: vi.fn(), findMany: vi.fn() },
    overtimeLine: { findMany: vi.fn() },
    overtimeDayEntry: { findMany: vi.fn() },
    setting: { findUnique: vi.fn() },
    $transaction: vi.fn(),
  },
}));

vi.mock('../../../core/middleware/audit', () => ({ recordAudit: vi.fn() }));

import { prisma } from '../../../config/database';
import { employeeCompensationService as service } from '../employeeCompensation.service';

/* eslint-disable @typescript-eslint/no-explicit-any */
const p = prisma as any;

/**
 * مصدرا الطباعة الجماعية على الخادم — **قراءة خالصة**.
 *
 * ما تُثبته هذه الاختبارات تحديدًا:
 *  · الفهرس يُبنى من جدول الحسبات لا من قائمة الموظفين: موظف بلا حسبة واحدة لا يظهر،
 *    وسنةٌ بلا حسبة لا تُعرض. هذا هو ما يمنع حوارًا يقود إلى شاشة طباعة فارغة.
 *  · كشوف السنة تصل مرتّبة تصاعديًا بالشهر، ومبنيّة بنفس دالة الكشف الفردي — لا
 *    مصدر ثانٍ للأرقام ولا صيغة ثانية للبيانات.
 *  · لا مسار من المسارين يكتب شيئًا: لا `create` ولا `update` ولا `delete` ولا
 *    معاملة، على أي جدول.
 */
describe('listPrintIndex — فهرس الطباعة الجماعية', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('لا يعرض إلا الموظفين الذين لهم حسبات، وسنواتهم وحدها تنازليًا', async () => {
    p.employeeCompensationCalculation.findMany.mockResolvedValue([
      { employeeId: 5, year: 2025 },
      { employeeId: 5, year: 2026 },
      { employeeId: 9, year: 2026 },
    ]);
    p.employee.findMany.mockResolvedValue([
      { id: 5, code: 'E-005', fullName: 'أحمد', jobTitle: 'سائق', status: 'ACTIVE' },
      { id: 9, code: 'E-009', fullName: 'سالم', jobTitle: null, status: 'TERMINATED' },
    ]);

    const result = await service.listPrintIndex();

    // الاستعلام عن الموظفين محصور بمن ظهر في جدول الحسبات — لا قائمة موظفين كاملة.
    expect(p.employee.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: { in: [5, 9] } } }),
    );
    expect(result.employees).toHaveLength(2);
    expect(result.employees[0]).toMatchObject({ id: 5, code: 'E-005', years: [2026, 2025] });
    expect(result.employees[1]).toMatchObject({ id: 9, years: [2026] });
  });

  it('لا حسبات في النظام ⇒ فهرس فارغ بلا أي استعلام عن الموظفين', async () => {
    p.employeeCompensationCalculation.findMany.mockResolvedValue([]);

    expect(await service.listPrintIndex()).toEqual({ employees: [] });
    expect(p.employee.findMany).not.toHaveBeenCalled();
  });

  it('لا يكتب شيئًا', async () => {
    p.employeeCompensationCalculation.findMany.mockResolvedValue([]);
    await service.listPrintIndex();

    expect(p.$transaction).not.toHaveBeenCalled();
    expect(p.employeeCompensationCalculation.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ select: { employeeId: true, year: true } }),
    );
  });
});

describe('getYearStatements — كشوف السنة للطباعة الجماعية', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('يطلب أشهر السنة مرتّبة تصاعديًا ويبني كل كشف بدالة الكشف الفردي', async () => {
    p.employee.findUnique.mockResolvedValue({ id: 5, code: 'E-005', fullName: 'أحمد' });
    p.employeeCompensationCalculation.findMany.mockResolvedValue([{ id: 101 }, { id: 102 }]);

    // نراقب المصدر المشترك بدل تمويه `loadCalculation` الداخلية: المقصود إثبات أن
    // الدفعة تمرّ به لكل شهر، لا إعادة اختبار محتوى الكشف نفسه (له اختباراته).
    const spy = vi
      .spyOn(service, 'getStatementData')
      .mockImplementation(async (id: number) => ({ id, month: id - 100 }) as never);

    const result = await service.getYearStatements(5, 2026);

    expect(p.employeeCompensationCalculation.findMany).toHaveBeenCalledWith({
      where: { employeeId: 5, year: 2026 },
      select: { id: true },
      orderBy: { month: 'asc' },
    });
    expect(spy).toHaveBeenCalledTimes(2);
    expect(result).toMatchObject({ employeeId: 5, year: 2026 });
    expect(result.statements.map((s: { id: number }) => s.id)).toEqual([101, 102]);

    spy.mockRestore();
  });

  it('سنة بلا حسبات ⇒ قائمة فارغة، بلا شهر مُختلَق لإكمال اثني عشر', async () => {
    p.employee.findUnique.mockResolvedValue({ id: 5, code: 'E-005', fullName: 'أحمد' });
    p.employeeCompensationCalculation.findMany.mockResolvedValue([]);

    const result = await service.getYearStatements(5, 2019);

    expect(result.statements).toEqual([]);
  });

  it('موظف غير موجود ⇒ خطأ صريح لا قائمة فارغة صامتة', async () => {
    p.employee.findUnique.mockResolvedValue(null);

    await expect(service.getYearStatements(404, 2026)).rejects.toThrow();
  });
});
