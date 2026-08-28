/**
 * مركز انتهاء الوثائق — إثبات «مصدر رسمي واحد لكل نوع وثيقة»
 * (Single Source of Truth Audit & Refactor v1).
 *
 * كل شيء هنا مُموَّه (Prisma وخدمة التأمين) فلا تُلمَس قاعدة بيانات: الاختبار يثبت
 * **من أين** يقرأ المركز، لا ما تحويه قاعدة التطوير اليوم.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@config/database', () => ({
  prisma: {
    employee:  { findMany: vi.fn() },
    equipment: { findMany: vi.fn() },
    contract:  { findMany: vi.fn() },
  },
}));

vi.mock('@modules/vehicleInsurance/vehicleInsurance.service', () => ({
  vehicleInsuranceService: { listCurrentExpiries: vi.fn() },
}));

import { prisma } from '@config/database';
import { vehicleInsuranceService } from '@modules/vehicleInsurance/vehicleInsurance.service';
import { ExpirationsService, CANONICAL_SOURCE } from '../expirations.service';
import { daysUntil, todayAsStoredDate } from '@core/utils/daysRemaining';

type Mock = ReturnType<typeof vi.fn>;
const db = prisma as unknown as {
  employee:  { findMany: Mock };
  equipment: { findMany: Mock };
  contract:  { findMany: Mock };
};
const insurance = vehicleInsuranceService as unknown as { listCurrentExpiries: Mock };

const svc = new ExpirationsService();

/** تاريخ مخزَّن كما يخزّنه `dateOnlySchema`: منتصف ليل UTC، بإزاحة أيام عن اليوم. */
function storedDate(offsetDays: number): Date {
  return new Date(todayAsStoredDate().getTime() + offsetDays * 86_400_000);
}

const iso = (offsetDays: number): string => storedDate(offsetDays).toISOString().slice(0, 10);

const EMPLOYEE = {
  id: 7, code: 'E-007', fullName: 'محمد علي',
  residencyExpiry: null as Date | null, passportExpiry: null as Date | null,
  licenseExpiry: null as Date | null, vehicleLicenseExpiry: null as Date | null,
};
const EQUIPMENT = { id: 3, code: 'EQ-003', name: 'قلاب', registrationExpiry: null as Date | null };
const POLICY = (offsetDays: number) => ({
  equipmentId: 3, equipmentCode: 'EQ-003', equipmentName: 'قلاب', endDate: storedDate(offsetDays),
});
const CONTRACT = (offsetDays: number) => ({
  id: 5, code: 'C-005', asphaltPlant: 'مصنع الشمال', endDate: storedDate(offsetDays),
});

function seed(opts: {
  employees?: unknown[];
  equipment?: unknown[];
  insurance?: unknown[];
  contracts?: unknown[];
} = {}) {
  db.employee.findMany.mockResolvedValue(opts.employees ?? []);
  db.equipment.findMany.mockResolvedValue(opts.equipment ?? []);
  db.contract.findMany.mockResolvedValue(opts.contracts ?? []);
  insurance.listCurrentExpiries.mockResolvedValue(opts.insurance ?? []);
}

beforeEach(() => vi.clearAllMocks());

// ── 1-2. المصدر الأصلي وحده يحكم، بلا كتابة ثانية ─────────────────────────────

describe('تعديل المصدر الأصلي ينعكس مباشرة بلا مزامنة', () => {
  it('تغيير تاريخ الجواز في سجل الموظف يغيّر الصف في المركز فورًا', async () => {
    seed({ employees: [{ ...EMPLOYEE, passportExpiry: storedDate(10) }] });
    const before = await svc.list({ urgency: 'all' });
    expect(before[0].expiryDate).toBe(iso(10));

    // الكتابة الوحيدة هي في المصدر — لا شيء يُكتب في المركز بينهما.
    seed({ employees: [{ ...EMPLOYEE, passportExpiry: storedDate(45) }] });
    const after = await svc.list({ urgency: 'all' });
    expect(after[0].expiryDate).toBe(iso(45));
    expect(after[0].daysRemaining).toBe(45);
  });

  it('لا يملك المركز أي مسار كتابة — الجداول تُفتح للقراءة وحدها', async () => {
    seed({ employees: [{ ...EMPLOYEE, residencyExpiry: storedDate(5) }] });
    await svc.list({ urgency: 'all' });
    await svc.summary();
    for (const model of [db.employee, db.equipment, db.contract]) {
      expect(Object.keys(model)).toEqual(['findMany']);
    }
  });
});

// ── 3-6. كل نوع من مصدره الرسمي ───────────────────────────────────────────────

describe('خريطة المصادر الرسمية', () => {
  it('EQUIPMENT_REGISTRATION يأتي من سجل المعدة', async () => {
    seed({ equipment: [{ ...EQUIPMENT, registrationExpiry: storedDate(20) }] });
    const [row] = await svc.list({ urgency: 'all' });
    expect(row.category).toBe('EQUIPMENT_REGISTRATION');
    expect(row.sourceModule).toBe('equipment');
    expect(row.entityCode).toBe('EQ-003');
    expect(row.expiryDate).toBe(iso(20));
  });

  it('وثائق الموظف الأربع تأتي من سجل الموظف', async () => {
    seed({
      employees: [{
        ...EMPLOYEE,
        residencyExpiry: storedDate(1), passportExpiry: storedDate(2),
        licenseExpiry: storedDate(3), vehicleLicenseExpiry: storedDate(4),
      }],
    });
    const rows = await svc.list({ urgency: 'all' });
    expect(rows.map((r) => r.category)).toEqual([
      'EMPLOYEE_RESIDENCY', 'EMPLOYEE_PASSPORT', 'EMPLOYEE_DRIVING_LICENSE', 'EMPLOYEE_VEHICLE_LICENSE',
    ]);
    rows.forEach((r) => expect(r.sourceModule).toBe('employees'));
  });

  it('EQUIPMENT_INSURANCE يأتي من وحدة تأمين المركبات لا من حقل المعدة القديم', async () => {
    seed({ equipment: [EQUIPMENT], insurance: [POLICY(12)] });
    const [row] = await svc.list({ urgency: 'all' });
    expect(row.category).toBe('EQUIPMENT_INSURANCE');
    expect(row.sourceModule).toBe('vehicleInsurance');
    expect(row.expiryDate).toBe(iso(12));
    expect(insurance.listCurrentExpiries).toHaveBeenCalled();
  });

  it('لا يطلب `insuranceExpiry` من جدول المعدات إطلاقًا', async () => {
    seed();
    await svc.list({ urgency: 'all' });
    const select = db.equipment.findMany.mock.calls[0][0].select;
    expect(select).not.toHaveProperty('insuranceExpiry');
    expect(select).toHaveProperty('registrationExpiry', true);
  });

  it('CONTRACT_EXPIRY يأتي من سجل العقد', async () => {
    seed({ contracts: [CONTRACT(30)] });
    const [row] = await svc.list({ urgency: 'all' });
    expect(row.category).toBe('CONTRACT_EXPIRY');
    expect(row.sourceModule).toBe('contracts');
    expect(row.entityName).toBe('مصنع الشمال');
  });

  it('كل نوع وثيقة معروض يحمل المصدر الرسمي المعلن له', async () => {
    seed({
      employees: [{
        ...EMPLOYEE,
        residencyExpiry: storedDate(1), passportExpiry: storedDate(2),
        licenseExpiry: storedDate(3), vehicleLicenseExpiry: storedDate(4),
      }],
      equipment: [{ ...EQUIPMENT, registrationExpiry: storedDate(5) }],
      insurance: [POLICY(6)],
      contracts: [CONTRACT(7)],
    });
    const rows = await svc.list({ urgency: 'all' });
    expect(rows).toHaveLength(7);
    expect(new Set(rows.map((r) => r.category)).size).toBe(7);
    rows.forEach((r) => expect(r.sourceModule).toBe(CANONICAL_SOURCE[r.category]));
  });
});

// ── 7. التعارض يُحسم لصالح المصدر الرسمي ──────────────────────────────────────

describe('تعارض النسخة القديمة مع المصدر الرسمي', () => {
  it('يعرض تاريخ وثيقة التأمين حتى لو حمل سجل المعدة نسخة قديمة مختلفة', async () => {
    // النسخة القديمة موجودة على الصف لكنها ليست ضمن `select`، فلا تصل الخدمة أصلًا.
    seed({
      equipment: [{ ...EQUIPMENT, insuranceExpiry: storedDate(-400) }],
      insurance: [POLICY(200)],
    });
    const rows = await svc.list({ urgency: 'all' });
    expect(rows).toHaveLength(1);
    expect(rows[0].expiryDate).toBe(iso(200));
    expect(rows[0].urgency).toBe('ok');
  });
});

// ── 8. التواريخ الغائبة ───────────────────────────────────────────────────────

describe('غياب تاريخ الانتهاء', () => {
  it('لا يخترع تاريخًا ولا يستخدم بديلًا — الصف لا يظهر إطلاقًا', async () => {
    seed({
      employees: [{ ...EMPLOYEE, createdAt: storedDate(-100) }],
      equipment: [EQUIPMENT],
    });
    expect(await svc.list({ urgency: 'all' })).toEqual([]);
    seed({ employees: [{ ...EMPLOYEE, createdAt: storedDate(-100) }], equipment: [EQUIPMENT] });
    expect((await svc.summary()).total).toBe(0);
  });
});

// ── 9. عقد الأيام المتبقية موحّد ──────────────────────────────────────────────

describe('daysRemaining — عقد واحد لكل الأنواع', () => {
  it('أمس = -1، اليوم = 0، غدًا = +1 لكل نوع وثيقة', async () => {
    const cases: Array<[number, string]> = [[-1, 'expired'], [0, '7'], [1, '7']];
    for (const [offset, band] of cases) {
      seed({
        employees: [{
          ...EMPLOYEE,
          residencyExpiry: storedDate(offset), passportExpiry: storedDate(offset),
          licenseExpiry: storedDate(offset), vehicleLicenseExpiry: storedDate(offset),
        }],
        equipment: [{ ...EQUIPMENT, registrationExpiry: storedDate(offset) }],
        insurance: [POLICY(offset)],
        contracts: [CONTRACT(offset)],
      });
      const rows = await svc.list({ urgency: 'all' });
      expect(rows).toHaveLength(7);
      rows.forEach((r) => {
        expect(r.daysRemaining).toBe(offset);
        expect(r.daysRemaining).toBe(daysUntil(storedDate(offset)));
        expect(r.urgency).toBe(band);
      });
    }
  });
});

// ── 10-11. البطاقات والجدول من مجموعة واحدة ───────────────────────────────────

describe('KPI والجدول', () => {
  // منتهية (-3) · 7 أيام (5) · 30 يومًا (25) · 60 يومًا (50) · 90 يومًا (80) · ساريتان (500، 900)
  const fullSeed = () => seed({
    employees: [{
      ...EMPLOYEE,
      residencyExpiry: storedDate(-3), passportExpiry: storedDate(5),
      licenseExpiry: storedDate(25), vehicleLicenseExpiry: storedDate(500),
    }],
    equipment: [{ ...EQUIPMENT, registrationExpiry: storedDate(50) }],
    insurance: [POLICY(80)],
    contracts: [CONTRACT(900)],
  });

  it('summary.total يساوي عدد صفوف الجدول بلا فلاتر', async () => {
    fullSeed();
    const rows = await svc.list({ urgency: 'all' });
    fullSeed();
    const s = await svc.summary();
    expect(s.total).toBe(rows.length);
    expect(s.total).toBe(7);
  });

  it('النطاقات الستة تجمع إلى total، و actionable = total − ok', async () => {
    fullSeed();
    const s = await svc.summary();
    expect(s.expired + s.days7 + s.days30 + s.days60 + s.days90 + s.ok).toBe(s.total);
    expect(s.actionable).toBe(s.total - s.ok);
    expect(s).toMatchObject({
      expired: 1, days7: 1, days30: 1, days60: 1, days90: 1, ok: 2, actionable: 5, total: 7,
    });
  });

  it('عدّاد كل بطاقة يطابق عدد صفوف الجدول تحت الفلتر نفسه', async () => {
    const bands = ['expired', '7', '30', '60', '90', 'ok'] as const;
    const counts: Record<string, number> = {};
    for (const b of bands) {
      fullSeed();
      counts[b] = (await svc.list({ urgency: b })).length;
    }
    fullSeed();
    const s = await svc.summary();
    expect(counts).toEqual({
      expired: s.expired, '7': s.days7, '30': s.days30, '60': s.days60, '90': s.days90, ok: s.ok,
    });
  });

  it('البحث والتصفية لا يغيّران مصدر البيانات — نفس الاستعلامات حرفيًا', async () => {
    fullSeed();
    await svc.list({ urgency: 'all' });
    const baseline = {
      employee:  JSON.stringify(db.employee.findMany.mock.calls[0]),
      equipment: JSON.stringify(db.equipment.findMany.mock.calls[0]),
      contract:  JSON.stringify(db.contract.findMany.mock.calls[0]),
    };
    vi.clearAllMocks();

    fullSeed();
    const filtered = await svc.list({ urgency: 'expired', category: 'EMPLOYEE_RESIDENCY', search: 'محمد' });
    expect(JSON.stringify(db.employee.findMany.mock.calls[0])).toBe(baseline.employee);
    expect(JSON.stringify(db.equipment.findMany.mock.calls[0])).toBe(baseline.equipment);
    expect(JSON.stringify(db.contract.findMany.mock.calls[0])).toBe(baseline.contract);
    expect(insurance.listCurrentExpiries).toHaveBeenCalledTimes(1);
    expect(filtered).toHaveLength(1);
    expect(filtered[0].category).toBe('EMPLOYEE_RESIDENCY');
  });
});
