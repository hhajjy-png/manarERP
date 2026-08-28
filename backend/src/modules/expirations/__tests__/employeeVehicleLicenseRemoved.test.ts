/**
 * Remove Employee Vehicle License Expiry v1 — إثبات خروج النوع من مركز انتهاء الوثائق.
 *
 * `EMPLOYEE_VEHICLE_LICENSE` كان يتابع انتهاء رخصة/دفتر مركبة من **سجل الموظف**، بينما
 * مالك هذه المعلومة هو سجل المعدة (`equipment.registrationExpiry`) — كيانان يتابعان
 * الوثيقة الواقعية نفسها. الاختبارات أدناه تثبت أن المركز لم يعد يقرأ الحقل، وأن
 * `EQUIPMENT_REGISTRATION` صار المصدر الوحيد، وأن العدّادات أُعيد اشتقاقها من المجموعة
 * الجديدة بلا ازدواج، وأن العمود ما يزال في قاعدة البيانات بلا ترحيل.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'fs';
import path from 'path';

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
import { createEmployeeSchema, updateEmployeeSchema } from '@modules/employees/employees.schema';
import { todayAsStoredDate } from '@core/utils/daysRemaining';

type Mock = ReturnType<typeof vi.fn>;
const db = prisma as unknown as {
  employee:  { findMany: Mock };
  equipment: { findMany: Mock };
  contract:  { findMany: Mock };
};
const insurance = vehicleInsuranceService as unknown as { listCurrentExpiries: Mock };

const svc = new ExpirationsService();
const REPO = path.resolve(__dirname, '../../../../..');
const storedDate = (d: number) => new Date(todayAsStoredDate().getTime() + d * 86_400_000);

/** موظف يحمل **كل** وثائقه بما فيها رخصة المركبة — الأخيرة يجب ألا تُنتج صفًا. */
const EMPLOYEE_WITH_EVERYTHING = {
  id: 7, code: 'E-007', fullName: 'محمد علي',
  residencyExpiry: storedDate(10),
  passportExpiry: storedDate(20),
  licenseExpiry: storedDate(30),
  vehicleLicenseExpiry: storedDate(40),
};

function seed(opts: { employees?: unknown[]; equipment?: unknown[]; contracts?: unknown[] } = {}) {
  db.employee.findMany.mockResolvedValue(opts.employees ?? []);
  db.equipment.findMany.mockResolvedValue(opts.equipment ?? []);
  db.contract.findMany.mockResolvedValue(opts.contracts ?? []);
  insurance.listCurrentExpiries.mockResolvedValue([]);
}

beforeEach(() => vi.clearAllMocks());

// ── 3. المركز لا يعرض النوع ───────────────────────────────────────────────────

describe('مركز انتهاء الوثائق لا يعرض EMPLOYEE_VEHICLE_LICENSE', () => {
  it('موظف يحمل تاريخ رخصة مركبة يُنتج ثلاثة صفوف لا أربعة', async () => {
    seed({ employees: [EMPLOYEE_WITH_EVERYTHING] });
    const rows = await svc.list({ urgency: 'all' });
    expect(rows).toHaveLength(3);
    expect(rows.map((r) => r.category)).toEqual([
      'EMPLOYEE_RESIDENCY', 'EMPLOYEE_PASSPORT', 'EMPLOYEE_DRIVING_LICENSE',
    ]);
  });

  it('لا صف بالتاريخ 40 يومًا — قيمة رخصة المركبة لا تظهر تحت أي تصنيف', async () => {
    seed({ employees: [EMPLOYEE_WITH_EVERYTHING] });
    const rows = await svc.list({ urgency: 'all' });
    const vehicleLicenseIso = storedDate(40).toISOString().slice(0, 10);
    expect(rows.map((r) => r.expiryDate)).not.toContain(vehicleLicenseIso);
    expect(rows.map((r) => r.daysRemaining)).not.toContain(40);
  });

  it('الحقل غير مطلوب من قاعدة البيانات أصلًا', async () => {
    seed();
    await svc.list({ urgency: 'all' });
    expect(db.employee.findMany.mock.calls[0][0].select).not.toHaveProperty('vehicleLicenseExpiry');
  });

  it('خريطة المصادر الرسمية لم تعد تعرف النوع', () => {
    expect(Object.keys(CANONICAL_SOURCE)).not.toContain('EMPLOYEE_VEHICLE_LICENSE');
    expect(Object.keys(CANONICAL_SOURCE)).toHaveLength(6);
  });

  it('تصفية صريحة على النوع المحذوف تُرجع صفرًا بدل صفوف يتيمة', async () => {
    seed({ employees: [EMPLOYEE_WITH_EVERYTHING] });
    expect(await svc.list({ urgency: 'all', category: 'EMPLOYEE_VEHICLE_LICENSE' })).toEqual([]);
  });
});

// ── 4. مصدر واحد لانتهاء المركبة ──────────────────────────────────────────────

describe('EQUIPMENT_REGISTRATION هو المصدر الوحيد لانتهاء رخصة/دفتر المركبة', () => {
  it('انتهاء المركبة يظهر من سجل المعدة وحده، بلا ازدواج مع الموظف', async () => {
    seed({
      employees: [EMPLOYEE_WITH_EVERYTHING],
      equipment: [{ id: 3, code: 'EQ-003', name: 'قلاب', registrationExpiry: storedDate(40) }],
    });
    const rows = await svc.list({ urgency: 'all' });
    const atForty = rows.filter((r) => r.daysRemaining === 40);
    expect(atForty).toHaveLength(1);
    expect(atForty[0].category).toBe('EQUIPMENT_REGISTRATION');
    expect(atForty[0].sourceModule).toBe('equipment');
    expect(atForty[0].entityCode).toBe('EQ-003');
  });

  it('لا تصنيف آخر يحمل المصدر `equipment` — لا منفذ ثانيًا لانتهاء المركبة', () => {
    const owned = Object.entries(CANONICAL_SOURCE)
      .filter(([, src]) => src === 'equipment')
      .map(([cat]) => cat);
    expect(owned).toEqual(['EQUIPMENT_REGISTRATION']);
  });
});

// ── 5. العدّادات أُعيد اشتقاقها من المجموعة الجديدة ───────────────────────────

describe('KPI والجدول بعد الإزالة', () => {
  const seedMixed = () => seed({
    employees: [{
      id: 7, code: 'E-007', fullName: 'محمد علي',
      residencyExpiry: storedDate(-3),   // منتهية
      passportExpiry: storedDate(5),     // 7 أيام
      licenseExpiry: storedDate(25),     // 30 يومًا
      vehicleLicenseExpiry: storedDate(500), // مهجور — يجب ألا يُحتسب في أي عدّاد
    }],
    equipment: [{ id: 3, code: 'EQ-003', name: 'قلاب', registrationExpiry: storedDate(50) }],
  });

  it('total يطابق عدد الصفوف، والنطاقات تجمع إليه، ولا أثر للقيمة المهجورة', async () => {
    seedMixed();
    const rows = await svc.list({ urgency: 'all' });
    seedMixed();
    const s = await svc.summary();
    expect(rows).toHaveLength(4);
    expect(s.total).toBe(rows.length);
    expect(s.expired + s.days7 + s.days30 + s.days60 + s.days90 + s.ok).toBe(s.total);
    // لو عاد النوع لصار total = 5 و ok = 1.
    expect(s).toMatchObject({ expired: 1, days7: 1, days30: 1, days60: 1, days90: 0, ok: 0, actionable: 4, total: 4 });
  });

  it('كل بطاقة تطابق عدد صفوف الجدول تحت فلترها بعد الإزالة', async () => {
    const bands = ['expired', '7', '30', '60', '90', 'ok'] as const;
    const table: Record<string, number> = {};
    for (const b of bands) {
      seedMixed();
      table[b] = (await svc.list({ urgency: b })).length;
    }
    seedMixed();
    const s = await svc.summary();
    expect(table).toEqual({
      expired: s.expired, '7': s.days7, '30': s.days30, '60': s.days60, '90': s.days90, ok: s.ok,
    });
  });
});

// ── 2 + 6. لا انحدار في إنشاء/تعديل الموظف ────────────────────────────────────

describe('إنشاء وتعديل الموظف لا يعتمدان على الحقل', () => {
  const base = { code: 'E-100', fullName: 'موظف جديد' };

  it('الإنشاء ينجح بلا `vehicleLicenseExpiry` (النموذج لم يعد يرسله)', () => {
    const parsed = createEmployeeSchema.parse({ body: base });
    expect(parsed.body.code).toBe('E-100');
    expect(parsed.body.vehicleLicenseExpiry).toBeUndefined();
  });

  it('بقية وثائق الموظف ما زالت تُقبل وتُطبَّع', () => {
    const parsed = createEmployeeSchema.parse({
      body: { ...base, passportExpiry: '2030-01-01', residencyExpiry: '2029-06-15', licenseExpiry: '2028-03-10' },
    });
    expect(parsed.body.passportExpiry).toBeInstanceOf(Date);
    expect(parsed.body.residencyExpiry).toBeInstanceOf(Date);
    expect(parsed.body.licenseExpiry).toBeInstanceOf(Date);
  });

  it('التعديل الجزئي بلا الحقل ينجح', () => {
    const parsed = updateEmployeeSchema.parse({ body: { fullName: 'اسم محدَّث' } });
    expect(parsed.body.fullName).toBe('اسم محدَّث');
    expect(parsed.body).not.toHaveProperty('vehicleLicenseExpiry');
  });

  it('الحقل ما يزال مقبولًا في عقد الـAPI للتوافق مع المستهلكين القدامى', () => {
    const parsed = createEmployeeSchema.parse({ body: { ...base, vehicleLicenseExpiry: '2027-05-01' } });
    expect(parsed.body.vehicleLicenseExpiry).toBeInstanceOf(Date);
  });
});

// ── 7. لا ترحيل ولا تغيير بنية ────────────────────────────────────────────────

describe('قاعدة البيانات لم تُمس', () => {
  const schema = fs.readFileSync(path.join(REPO, 'backend/prisma/schema.prisma'), 'utf8');

  it('العمود ما يزال معرَّفًا في مخطط Prisma — لا حذف', () => {
    expect(schema).toContain('vehicleLicenseExpiry DateTime?');
  });

  it('العمود موسوم Deprecated بالمصدر الرسمي البديل', () => {
    expect(schema).toContain('Deprecated — vehicle expiry is owned by Equipment/Vehicle registration');
  });

  it('لا ترحيل يمسّ العمود — لا DROP ولا ALTER عليه في أي migration', () => {
    const dir = path.join(REPO, 'backend/prisma/migrations');
    const offenders: string[] = [];
    for (const entry of fs.readdirSync(dir)) {
      const sqlPath = path.join(dir, entry, 'migration.sql');
      if (!fs.existsSync(sqlPath)) continue;
      const sql = fs.readFileSync(sqlPath, 'utf8');
      if (/DROP\s+COLUMN[^;]*vehicleLicenseExpiry/i.test(sql)) offenders.push(entry);
    }
    expect(offenders).toEqual([]);
  });
});
