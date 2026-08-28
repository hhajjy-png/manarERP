import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../config/database', () => ({
  prisma: {
    equipment: { findUnique: vi.fn(), findMany: vi.fn() },
    vehicleInsurancePolicy: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      aggregate: vi.fn(),
    },
    vehicleAccident: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      count: vi.fn(),
    },
  },
}));

vi.mock('../../../core/middleware/audit', () => ({ recordAudit: vi.fn() }));

import type { Request } from 'express';
import { prisma } from '../../../config/database';
import { VehicleInsuranceService } from '../vehicleInsurance.service';

/**
 * تأمين المركبات — سلوك **النطاق** لا سلوك Prisma: كل وصول لقاعدة البيانات مموَّه.
 *
 * ما تُثبته هذه الاختبارات تحديدًا:
 *   • الجدول الرئيسي يعرض **أحدث** وثيقة لكل مركبة ولا يكرّر المركبة.
 *   • التجديد يُنشئ سجلًا جديدًا ولا يُصدر أي `update` على الوثيقة السابقة.
 *   • الخدمة لا تكتب في أي جدول خارج جدولَي الوحدة — ولا في `equipment` إطلاقًا،
 *     وتحديدًا لا في `equipment.insuranceExpiry` المهجور (مركز انتهاء الوثائق صار يقرأ
 *     `endDate` للوثيقة الحالية من هنا، لا ذلك الحقل).
 *   • تصحيح تاريخ واحد يُفحَص مقابل التاريخ المحفوظ لا مقابل نفسه.
 *   • لا وجود لأي دالة حذف في سطح الخدمة.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
const p = prisma as any;

const req = { user: { userId: 3, username: 'equip.manager' } } as unknown as Request;

const utcDay = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d));

let policyId = 100;
function policyRow(over: Record<string, unknown> = {}) {
  return {
    id: ++policyId,
    equipmentId: 1,
    policyNumber: `P-${policyId}`,
    insurerName: 'الخليج للتأمين',
    coverageType: 'COMPREHENSIVE',
    startDate: utcDay(2026, 1, 1),
    endDate: utcDay(2026, 12, 31),
    cost: 250,
    notes: null,
    createdAt: utcDay(2026, 1, 1),
    updatedAt: utcDay(2026, 1, 1),
    equipment: { id: 1, code: 'EQ-01', name: 'قلاب', plateNumber: '1/12345' },
    ...over,
  };
}

const service = new VehicleInsuranceService();

beforeEach(() => {
  vi.clearAllMocks();
  policyId = 100;
  p.equipment.findUnique.mockResolvedValue({ id: 1 });
});

describe('listCurrentPolicies — وثيقة واحدة لكل مركبة', () => {
  it('يختار أحدث وثيقة لكل مركبة ولا يكرّر المركبة', async () => {
    // الخدمة تطلب الترتيب «الأحدث أولًا» من Prisma؛ المموِّه يعيده بذلك الترتيب.
    p.vehicleInsurancePolicy.findMany.mockResolvedValue([
      policyRow({ equipmentId: 1, policyNumber: 'NEW-1', endDate: utcDay(2027, 1, 1) }),
      policyRow({ equipmentId: 1, policyNumber: 'OLD-1', endDate: utcDay(2026, 1, 1) }),
      policyRow({
        equipmentId: 2,
        policyNumber: 'NEW-2',
        endDate: utcDay(2026, 6, 30),
        equipment: { id: 2, code: 'EQ-02', name: 'شيول', plateNumber: '2/54321' },
      }),
    ]);

    const rows = await service.listCurrentPolicies({ status: 'all' });

    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.equipmentId).sort()).toEqual([1, 2]);
    expect(rows.find((r) => r.equipmentId === 1)!.policyNumber).toBe('NEW-1');
  });

  it('يرتّب الأقرب انتهاءً أولًا كي تتصدّر المنتهية الشاشة', async () => {
    p.vehicleInsurancePolicy.findMany.mockResolvedValue([
      policyRow({ equipmentId: 1, endDate: utcDay(2030, 1, 1) }),
      policyRow({ equipmentId: 2, endDate: utcDay(2000, 1, 1), equipment: { id: 2, code: 'EQ-02', name: null, plateNumber: null } }),
    ]);

    const rows = await service.listCurrentPolicies({ status: 'all' });

    expect(rows[0].equipmentId).toBe(2);
    expect(rows[0].status).toBe('EXPIRED');
    expect(rows[0].daysRemaining).toBeLessThan(rows[1].daysRemaining);
  });

  it('يصفّي حسب شركة التأمين بلا حساسية لحالة الأحرف', async () => {
    p.vehicleInsurancePolicy.findMany.mockResolvedValue([
      policyRow({ equipmentId: 1, insurerName: 'Gulf Insurance' }),
      policyRow({ equipmentId: 2, insurerName: 'وربة للتأمين', equipment: { id: 2, code: 'EQ-02', name: null, plateNumber: null } }),
    ]);

    const rows = await service.listCurrentPolicies({ status: 'all', insurer: 'gulf insurance' });

    expect(rows).toHaveLength(1);
    expect(rows[0].insurerName).toBe('Gulf Insurance');
  });

  it('يصفّي حسب الحالة المحسوبة', async () => {
    p.vehicleInsurancePolicy.findMany.mockResolvedValue([
      policyRow({ equipmentId: 1, endDate: utcDay(2000, 1, 1) }),
      policyRow({ equipmentId: 2, endDate: utcDay(2099, 1, 1), equipment: { id: 2, code: 'EQ-02', name: null, plateNumber: null } }),
    ]);

    const expired = await service.listCurrentPolicies({ status: 'EXPIRED' });
    expect(expired).toHaveLength(1);
    expect(expired[0].equipmentId).toBe(1);

    const valid = await service.listCurrentPolicies({ status: 'VALID' });
    expect(valid).toHaveLength(1);
    expect(valid[0].equipmentId).toBe(2);
  });

  it('يبحث في رمز المعدة واسمها ولوحتها ورقم الوثيقة وشركة التأمين', async () => {
    p.vehicleInsurancePolicy.findMany.mockResolvedValue([
      policyRow({ equipmentId: 1, policyNumber: 'ZZZ-9' }),
      policyRow({ equipmentId: 2, policyNumber: 'AAA-1', equipment: { id: 2, code: 'EQ-02', name: null, plateNumber: null } }),
    ]);

    const byPolicy = await service.listCurrentPolicies({ status: 'all', search: 'zzz' });
    expect(byPolicy).toHaveLength(1);
    expect(byPolicy[0].policyNumber).toBe('ZZZ-9');

    const byPlate = await service.listCurrentPolicies({ status: 'all', search: '1/12345' });
    expect(byPlate).toHaveLength(1);
    expect(byPlate[0].equipmentId).toBe(1);
  });

  it('يعيد التواريخ بصيغة YYYY-MM-DD كي يبقى الفرز المعجمي في الواجهة صحيحًا', async () => {
    p.vehicleInsurancePolicy.findMany.mockResolvedValue([policyRow({ endDate: utcDay(2026, 12, 31) })]);
    const [row] = await service.listCurrentPolicies({ status: 'all' });
    expect(row.endDate).toBe('2026-12-31');
    expect(row.startDate).toBe('2026-01-01');
  });
});

describe('createPolicy — التجديد يُنشئ ولا يعدّل', () => {
  it('ينشئ سجلًا جديدًا ولا يُصدر أي update على وثيقة قائمة', async () => {
    p.vehicleInsurancePolicy.create.mockResolvedValue(policyRow({ policyNumber: 'RENEWED' }));

    await service.createPolicy(
      {
        equipmentId: 1,
        policyNumber: 'RENEWED',
        insurerName: 'الخليج للتأمين',
        coverageType: 'COMPREHENSIVE',
        startDate: utcDay(2027, 1, 1),
        endDate: utcDay(2027, 12, 31),
        cost: 300,
      },
      req,
    );

    expect(p.vehicleInsurancePolicy.create).toHaveBeenCalledTimes(1);
    expect(p.vehicleInsurancePolicy.update).not.toHaveBeenCalled();
  });

  it('لا يكتب في جدول المعدات إطلاقًا (insuranceExpiry المهجور يبقى بلا كاتب)', async () => {
    p.vehicleInsurancePolicy.create.mockResolvedValue(policyRow());

    await service.createPolicy(
      {
        equipmentId: 1,
        policyNumber: 'P-1',
        insurerName: 'وربة',
        coverageType: 'THIRD_PARTY',
        startDate: utcDay(2026, 1, 1),
        endDate: utcDay(2026, 12, 31),
        cost: 100,
      },
      req,
    );

    // القراءة وحدها مسموحة (التحقق من وجود المعدة) — لا `update` ولا `create`.
    expect(p.equipment.findUnique).toHaveBeenCalledTimes(1);
    expect((p.equipment as any).update).toBeUndefined();
  });

  it('يرفض معدة غير موجودة قبل أي كتابة', async () => {
    p.equipment.findUnique.mockResolvedValue(null);

    await expect(
      service.createPolicy(
        {
          equipmentId: 999,
          policyNumber: 'P-X',
          insurerName: 'وربة',
          coverageType: 'OTHER',
          startDate: utcDay(2026, 1, 1),
          endDate: utcDay(2026, 12, 31),
          cost: 0,
        },
        req,
      ),
    ).rejects.toThrow('المعدة المحددة غير موجودة');

    expect(p.vehicleInsurancePolicy.create).not.toHaveBeenCalled();
  });

  it('يقرّب التكلفة إلى ثلاث خانات (عقد الدينار الكويتي)', async () => {
    p.vehicleInsurancePolicy.create.mockResolvedValue(policyRow());

    await service.createPolicy(
      {
        equipmentId: 1,
        policyNumber: 'P-R',
        insurerName: 'وربة',
        coverageType: 'OTHER',
        startDate: utcDay(2026, 1, 1),
        endDate: utcDay(2026, 12, 31),
        cost: 123.45678,
      },
      req,
    );

    expect(p.vehicleInsurancePolicy.create.mock.calls[0][0].data.cost).toBe(123.457);
  });
});

describe('updatePolicy — تصحيح كتابي محروس', () => {
  it('يرفض تاريخ انتهاء أقدم من تاريخ البدء المحفوظ عند إرسال الانتهاء وحده', async () => {
    p.vehicleInsurancePolicy.findUnique.mockResolvedValue({
      id: 5,
      startDate: utcDay(2026, 6, 1),
      endDate: utcDay(2026, 12, 31),
      policyNumber: 'P-5',
      insurerName: 'وربة',
      coverageType: 'OTHER',
      cost: 10,
      notes: null,
    });

    await expect(service.updatePolicy(5, { endDate: utcDay(2026, 1, 1) }, req)).rejects.toThrow(
      'تاريخ انتهاء التأمين يجب أن يكون في أو بعد تاريخ البدء',
    );
    expect(p.vehicleInsurancePolicy.update).not.toHaveBeenCalled();
  });

  it('يقبل تصحيحًا صالحًا ويحدّث الحقول المُرسَلة وحدها', async () => {
    p.vehicleInsurancePolicy.findUnique.mockResolvedValue({
      id: 5,
      startDate: utcDay(2026, 1, 1),
      endDate: utcDay(2026, 12, 31),
      policyNumber: 'TYPO',
      insurerName: 'وربة',
      coverageType: 'OTHER',
      cost: 10,
      notes: null,
    });
    p.vehicleInsurancePolicy.update.mockResolvedValue(policyRow({ id: 5, policyNumber: 'FIXED' }));

    await service.updatePolicy(5, { policyNumber: 'FIXED' }, req);

    const data = p.vehicleInsurancePolicy.update.mock.calls[0][0].data;
    expect(data).toEqual({ policyNumber: 'FIXED' });
  });

  it('يرفض وثيقة غير موجودة', async () => {
    p.vehicleInsurancePolicy.findUnique.mockResolvedValue(null);
    await expect(service.updatePolicy(404, { policyNumber: 'X' }, req)).rejects.toThrow(
      'وثيقة التأمين غير موجودة',
    );
  });
});

describe('summary — مؤشرات أعلى الصفحة', () => {
  it('يحسب المؤشرات على الوثائق الحالية ويفصل نطاقات التنبيه', async () => {
    const today = new Date();
    const plus = (days: number) => {
      const d = new Date(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()));
      d.setUTCDate(d.getUTCDate() + days);
      return d;
    };

    p.vehicleInsurancePolicy.findMany.mockResolvedValue([
      policyRow({ equipmentId: 1, endDate: plus(-5), cost: 100 }),
      policyRow({ equipmentId: 2, endDate: plus(3), cost: 200, equipment: { id: 2, code: 'EQ-02', name: null, plateNumber: null } }),
      policyRow({ equipmentId: 3, endDate: plus(12), cost: 300, equipment: { id: 3, code: 'EQ-03', name: null, plateNumber: null } }),
      policyRow({ equipmentId: 4, endDate: plus(25), cost: 400, equipment: { id: 4, code: 'EQ-04', name: null, plateNumber: null } }),
      policyRow({ equipmentId: 5, endDate: plus(200), cost: 500, equipment: { id: 5, code: 'EQ-05', name: null, plateNumber: null } }),
    ]);
    p.vehicleInsurancePolicy.aggregate.mockResolvedValue({ _sum: { cost: 5000 }, _count: { _all: 12 } });
    p.vehicleAccident.count.mockResolvedValue(4);

    const s = await service.summary();

    expect(s.insuredVehicles).toBe(5);
    expect(s.expired).toBe(1);
    expect(s.expiringSoon).toBe(3);
    expect(s.due7).toBe(1);
    expect(s.due15).toBe(1);
    expect(s.due30).toBe(1);
    // إجمالي تكلفة الوثائق **الحالية** (وثيقة واحدة لكل مركبة)
    expect(s.totalCost).toBe(1500);
    // وإجمالي كل الوثائق المحفوظة تاريخيًا، منفصلًا وصريحًا
    expect(s.totalCostAllPolicies).toBe(5000);
    expect(s.totalPolicies).toBe(12);
    expect(s.totalAccidents).toBe(4);
  });

  it('يتعامل مع قاعدة فارغة بلا انفجار', async () => {
    p.vehicleInsurancePolicy.findMany.mockResolvedValue([]);
    p.vehicleInsurancePolicy.aggregate.mockResolvedValue({ _sum: { cost: null }, _count: { _all: 0 } });
    p.vehicleAccident.count.mockResolvedValue(0);

    const s = await service.summary();

    expect(s).toMatchObject({
      insuredVehicles: 0,
      expired: 0,
      expiringSoon: 0,
      totalCost: 0,
      totalCostAllPolicies: 0,
      totalPolicies: 0,
      totalAccidents: 0,
    });
  });
});

describe('سجل الحوادث', () => {
  it('يسجّل حادثًا ولا يمسّ أي جدول آخر', async () => {
    p.vehicleAccident.create.mockResolvedValue({
      id: 1,
      equipmentId: 1,
      accidentDate: utcDay(2026, 5, 5),
      description: 'اصطدام خفيف',
      repairCost: 75.5,
      notes: null,
      equipment: { id: 1, code: 'EQ-01', name: null, plateNumber: null },
    });

    await service.createAccident(
      { equipmentId: 1, accidentDate: utcDay(2026, 5, 5), description: 'اصطدام خفيف', repairCost: 75.5 },
      req,
    );

    expect(p.vehicleAccident.create).toHaveBeenCalledTimes(1);
    expect(p.vehicleInsurancePolicy.create).not.toHaveBeenCalled();
    expect(p.vehicleInsurancePolicy.update).not.toHaveBeenCalled();
  });

  it('يميّز «بلا تكلفة إصلاح» (null) عن «تكلفة صفر»', async () => {
    p.vehicleAccident.create.mockResolvedValue({ id: 2, equipmentId: 1, accidentDate: utcDay(2026, 5, 5), description: 'x', repairCost: null, notes: null });

    await service.createAccident({ equipmentId: 1, accidentDate: utcDay(2026, 5, 5), description: 'x' }, req);
    expect(p.vehicleAccident.create.mock.calls[0][0].data.repairCost).toBeNull();

    vi.clearAllMocks();
    p.equipment.findUnique.mockResolvedValue({ id: 1 });
    p.vehicleAccident.create.mockResolvedValue({ id: 3, equipmentId: 1, accidentDate: utcDay(2026, 5, 5), description: 'y', repairCost: 0, notes: null });

    await service.createAccident({ equipmentId: 1, accidentDate: utcDay(2026, 5, 5), description: 'y', repairCost: 0 }, req);
    expect(p.vehicleAccident.create.mock.calls[0][0].data.repairCost).toBe(0);
  });

  it('يمسح تكلفة الإصلاح صراحةً عند إرسال null', async () => {
    p.vehicleAccident.findUnique.mockResolvedValue({
      id: 9,
      accidentDate: utcDay(2026, 5, 5),
      description: 'x',
      repairCost: 50,
      notes: null,
    });
    p.vehicleAccident.update.mockResolvedValue({ id: 9 });

    await service.updateAccident(9, { repairCost: null }, req);

    expect(p.vehicleAccident.update.mock.calls[0][0].data).toEqual({ repairCost: null });
  });

  it('يرفض حادثًا غير موجود', async () => {
    p.vehicleAccident.findUnique.mockResolvedValue(null);
    await expect(service.updateAccident(404, { description: 'x' }, req)).rejects.toThrow('سجل الحادث غير موجود');
  });
});

describe('حدود الوحدة', () => {
  it('لا تعرض الخدمة أي دالة حذف — السجل التاريخي محفوظ بالتصميم', () => {
    const surface = Object.getOwnPropertyNames(VehicleInsuranceService.prototype);
    expect(surface.filter((m) => /delete|remove|destroy/i.test(m))).toEqual([]);
  });
});
