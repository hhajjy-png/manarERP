import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../config/database', () => ({
  prisma: {
    vehicleInsurancePolicy: { findMany: vi.fn() },
  },
}));

import { prisma } from '../../../config/database';
import { buildVehicleInsuranceReport } from '../vehicleInsuranceReport';

/**
 * تقرير تأمين المركبات — Vehicle Insurance Management v1.
 *
 * ما تُثبته هذه الاختبارات تحديدًا: أن التقرير يستهلك جدول الوثائق وحده، وأن فلتر
 * الحالة يعمل على الحالة **المحسوبة** لا على عمود مخزَّن، وأن صفّ المجاميع يجمع
 * الصفوف المعروضة بعد الفلترة لا كل الوثائق.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
const p = prisma as any;

const shiftDays = (days: number): Date => {
  const now = new Date();
  const d = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
  d.setUTCDate(d.getUTCDate() + days);
  return d;
};

let id = 0;
function row(over: Record<string, unknown> = {}) {
  return {
    id: ++id,
    equipmentId: 1,
    policyNumber: `P-${id}`,
    insurerName: 'الخليج للتأمين',
    coverageType: 'COMPREHENSIVE',
    startDate: shiftDays(-300),
    endDate: shiftDays(100),
    cost: 100,
    notes: null,
    equipment: { code: 'EQ-01', name: 'قلاب', plateNumber: '1/12345' },
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  id = 0;
});

describe('buildVehicleInsuranceReport', () => {
  it('يعرض كل الوثائق عند غياب الفلتر ويجمع تكلفتها', async () => {
    p.vehicleInsurancePolicy.findMany.mockResolvedValue([
      row({ cost: 100, endDate: shiftDays(-10) }),
      row({ cost: 250.5, endDate: shiftDays(5) }),
      row({ cost: 300, endDate: shiftDays(400) }),
    ]);

    const out = await buildVehicleInsuranceReport({});

    expect(out.rows).toHaveLength(3);
    expect(out.totalsRow).toEqual({ equipmentCode: 'الإجمالي', cost: 650.5 });
    expect(out.title).toContain('جميع الوثائق');
  });

  it('يصفّي المنتهية على الحالة المحسوبة، والمجاميع تتبع المعروض', async () => {
    p.vehicleInsurancePolicy.findMany.mockResolvedValue([
      row({ cost: 100, endDate: shiftDays(-10) }),
      row({ cost: 900, endDate: shiftDays(400) }),
    ]);

    const out = await buildVehicleInsuranceReport({ status: 'EXPIRED' });

    expect(out.rows).toHaveLength(1);
    expect(out.rows[0].status).toBe('منتهي');
    expect(out.totalsRow).toEqual({ equipmentCode: 'الإجمالي', cost: 100 });
    expect(out.title).toContain('المنتهية');
  });

  it('يصفّي «تنتهي قريبًا» فيشمل نطاقات 7 و15 و30 معًا', async () => {
    p.vehicleInsurancePolicy.findMany.mockResolvedValue([
      row({ endDate: shiftDays(3) }),
      row({ endDate: shiftDays(12) }),
      row({ endDate: shiftDays(28) }),
      row({ endDate: shiftDays(90) }),
      row({ endDate: shiftDays(-1) }),
    ]);

    const out = await buildVehicleInsuranceReport({ status: 'EXPIRING_SOON' });

    expect(out.rows).toHaveLength(3);
    expect(out.rows.every((r) => r.status === 'ينتهي قريبًا')).toBe(true);
  });

  it('يتجاهل أي قيمة حالة غير معروفة ويعود إلى «الجميع» بدل إرجاع جدول فارغ', async () => {
    p.vehicleInsurancePolicy.findMany.mockResolvedValue([row(), row()]);
    const out = await buildVehicleInsuranceReport({ status: 'GARBAGE' });
    expect(out.rows).toHaveLength(2);
  });

  it('يترجم نوع التغطية ويعرض التواريخ بصيغة العرض DD/MM/YYYY', async () => {
    p.vehicleInsurancePolicy.findMany.mockResolvedValue([
      row({ coverageType: 'THIRD_PARTY', startDate: new Date(Date.UTC(2026, 0, 15)), endDate: new Date(Date.UTC(2026, 11, 31)) }),
    ]);

    const out = await buildVehicleInsuranceReport({});

    expect(out.rows[0].coverageType).toBe('ضد الغير');
    expect(out.rows[0].startDate).toBe('15/01/2026');
    expect(out.rows[0].endDate).toBe('31/12/2026');
  });

  it('يعدّ المركبات لا الوثائق في العنوان الفرعي', async () => {
    p.vehicleInsurancePolicy.findMany.mockResolvedValue([
      row({ equipmentId: 1 }),
      row({ equipmentId: 1 }),
      row({ equipmentId: 2 }),
    ]);

    const out = await buildVehicleInsuranceReport({});

    expect(out.subtitle).toContain('عدد الوثائق: 3');
    expect(out.subtitle).toContain('عدد المركبات: 2');
  });

  it('لا يقرأ أي جدول خارج جدول الوثائق', async () => {
    p.vehicleInsurancePolicy.findMany.mockResolvedValue([]);
    await buildVehicleInsuranceReport({});
    expect(Object.keys(p)).toEqual(['vehicleInsurancePolicy']);
    expect(p.vehicleInsurancePolicy.findMany).toHaveBeenCalledTimes(1);
  });
});
