import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { createInvoiceSchema, updateInvoiceSchema, addPaymentSchema } from '../../../modules/invoices/invoices.schema';
import { createEmployeeSchema, attendanceSchema, updateAttendanceSchema, leaveSchema } from '../../../modules/employees/employees.schema';
import { createMaintenanceSchema } from '../../../modules/maintenance/maintenance.schema';
import { createContractSchema } from '../../../modules/contracts/contracts.schema';
import { periodQuerySchema, resolvePeriod } from '../periodFilter';

/**
 * API Date Hardening Pack v1 — تغطية عابرة للوحدات.
 *
 * `dateOnly.test.ts` يثبت سلوك المدقّق المشترك بمعزل. هنا: أن كل مخطط API متصل به
 * فعليًا يحمل نفس السلوك على أشكال حمولة واقعية، وأن ما لا يجب أن يتأثر لم يتأثر —
 * فلاتر المدى الزمني، وحقول DATETIME الحقيقية (checkIn/checkOut).
 */

describe('L) أشكال حمولة صالحة فعليًا من الواجهة — ما تزال تُتحقَّق منها', () => {
  // ملاحظة: issueDate هنا يجب ألا يكون في المستقبل — قاعدة عمل مسبقة الوجود
  // (isNotFutureIssueDate) لا علاقة لها بالتشديد، فنستخدم تاريخًا ماضيًا آمنًا.
  it('فاتورة كاملة بصيغة new Date(iso).toISOString() (محاكاة تسلسل axios لكائن Date)', () => {
    const r = createInvoiceSchema.safeParse({
      body: {
        invoiceNumber: 'MN-INV-2026-0001',
        direction: 'SALES',
        customerId: 1,
        issueDate: new Date('2026-07-02').toISOString(),
        dueDate: new Date('2026-07-31').toISOString(),
        deliveryDate: null,
        items: [{ description: 'نقل أسفلت', quantity: 1, unit: 'طن', unitPrice: 10 }],
      },
    });
    expect(r.success).toBe(true);
  });

  it('تعديل فاتورة — issueDate/dueDate بصيغة YYYY-MM-DD خالصة من DateInput', () => {
    const r = updateInvoiceSchema.safeParse({
      body: { issueDate: '2026-07-02', dueDate: '2026-07-31' },
    });
    expect(r.success).toBe(true);
  });

  it('تحصيل دفعة فاتورة — date اختيارية بصيغة قانونية', () => {
    expect(addPaymentSchema.safeParse({ body: { amount: 50, date: '2026-07-02' } }).success).toBe(true);
    expect(addPaymentSchema.safeParse({ body: { amount: 50 } }).success).toBe(true); // محذوفة → تبقى اختيارية
  });

  it('موظف جديد — تواريخ انتهاء متعددة بصيغة YYYY-MM-DD', () => {
    const r = createEmployeeSchema.safeParse({
      body: {
        code: 'E-001',
        fullName: 'أحمد',
        passportExpiry: '2030-01-01',
        residencyExpiry: '2028-06-15',
        birthDate: '1990-05-20',
        hireDate: '2020-01-01',
      },
    });
    expect(r.success).toBe(true);
  });

  it('صيانة معدة — date/nextDueDate بصيغة new Date(v).toISOString() (نمط Maintenance.tsx الحالي)', () => {
    const r = createMaintenanceSchema.safeParse({
      body: {
        equipmentId: 1,
        type: 'PREVENTIVE',
        description: 'صيانة دورية',
        date: new Date('2026-08-02').toISOString(),
        nextDueDate: new Date('2026-11-02').toISOString(),
      },
    });
    expect(r.success).toBe(true);
  });

  it('عقد جديد — startDate/endDate بصيغة قانونية، ومرفوض إن كانت غامضة', () => {
    const ok = createContractSchema.safeParse({
      body: { code: 'C-1', asphaltPlant: 'مصنع 1', startDate: '2026-01-01', endDate: '2026-12-31' },
    });
    expect(ok.success).toBe(true);

    const ambiguous = createContractSchema.safeParse({
      body: { code: 'C-1', asphaltPlant: 'مصنع 1', startDate: '01/02/2026' },
    });
    expect(ambiguous.success).toBe(false);
  });
});

describe('M) فلاتر المدى الزمني (from/to) لم تتأثر — تبقى محكومة بـ periodFilter.ts', () => {
  it('periodQuerySchema يقبل from/to كنص خام دون تشديد DATE-ONLY', () => {
    const r = periodQuerySchema.safeParse({ fromDate: '2026-08-01', toDate: '2026-08-31' });
    expect(r.success).toBe(true);
  });

  it('resolvePeriod يبني نفس حدود المدى المحلي كما قبل هذه الحزمة', () => {
    const range = resolvePeriod({ fromDate: '2026-08-01', toDate: '2026-08-31' });
    expect(range.hasRange).toBe(true);
    expect(range.flow?.gte).toBeInstanceOf(Date);
    expect(range.flow?.lte).toBeInstanceOf(Date);
  });

  it('عدم وجود from/to يبقى "كل الفترات" دون قيد', () => {
    expect(resolvePeriod({}).hasRange).toBe(false);
  });
});

describe('N) حقول DATETIME الحقيقية لم تتأثر — checkIn/checkOut يحتفظان بوقتهما الفعلي', () => {
  it('attendanceSchema.checkIn/checkOut يقبلان وقتًا حقيقيًا غير منتصف الليل', () => {
    const r = attendanceSchema.safeParse({
      body: {
        employeeId: 1,
        date: '2026-08-02',
        checkIn: `2026-08-02T08:30:00.000Z`,
        checkOut: `2026-08-02T16:45:00.000Z`,
      },
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.body.checkIn?.getUTCHours()).toBe(8);
      expect(r.data.body.checkIn?.getUTCMinutes()).toBe(30);
      expect(r.data.body.checkOut?.getUTCHours()).toBe(16);
      expect(r.data.body.checkOut?.getUTCMinutes()).toBe(45);
    }
  });

  it('updateAttendanceSchema.checkIn/checkOut كذلك — لم تُحوَّل إلى DATE-ONLY', () => {
    const r = updateAttendanceSchema.safeParse({
      body: { checkIn: '2026-08-02T08:30:00.000Z' },
    });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.body.checkIn?.getUTCHours()).toBe(8);
  });

  it('attendanceSchema.date (DATE-ONLY حقيقي) يرفض صيغة غامضة رغم أن checkIn/checkOut بجواره لم يتشدّدا', () => {
    const r = attendanceSchema.safeParse({
      body: { employeeId: 1, date: '02/08/2026' },
    });
    expect(r.success).toBe(false);
  });

  it('leaveSchema.startDate/endDate (DATE-ONLY) تُشدَّد كسائر الحقول', () => {
    expect(leaveSchema.safeParse({
      body: { employeeId: 1, type: 'ANNUAL', startDate: '2026-08-01', endDate: '2026-08-05' },
    }).success).toBe(true);
    expect(leaveSchema.safeParse({
      body: { employeeId: 1, type: 'ANNUAL', startDate: '01/08/2026', endDate: '2026-08-05' },
    }).success).toBe(false);
  });
});

describe('حارس: لا مخطط DATE-ONLY مُشدَّد ما يزال يستخدم z.coerce.date() الخام', () => {
  const HARDENED_FILES = [
    'modules/cheques/cheques.schema.ts',
    'modules/invoices/invoices.schema.ts',
    'modules/equipment/equipment.schema.ts',
    'modules/employees/employees.schema.ts',
    'modules/employee-entitlements/entitlements.schema.ts',
    'modules/employee-entitlements/finalSettlement.schema.ts',
    'modules/holidays/holidays.schema.ts',
    'modules/payments/payments.schema.ts',
    'modules/payroll/payroll.schema.ts',
    'modules/expenses/expenses.schema.ts',
    'modules/prices/prices.schema.ts',
    'modules/maintenance/maintenance.schema.ts',
    'modules/contracts/contracts.schema.ts',
    'modules/transactions/transactions.controller.ts',
    'modules/accounting/accounting.controller.ts',
  ];

  // الاستثناء الوحيد المتعمَّد: checkIn/checkOut يحملان وقتًا فعليًا (DATETIME)، لا DATE-ONLY.
  const ALLOWED_RAW_COERCE_LINES = [/checkIn: z\.coerce\.date\(\)/, /checkOut: z\.coerce\.date\(\)/];

  it('كل ملف مخطط مُشدَّد خالٍ من z.coerce.date() خارج استثناء checkIn/checkOut الموثَّق', () => {
    const srcRoot = path.resolve(__dirname, '../../..');
    for (const rel of HARDENED_FILES) {
      const content = fs.readFileSync(path.join(srcRoot, rel), 'utf8');
      const codeLines = content.split('\n').filter((l) => !l.trim().startsWith('//'));
      const lines = codeLines.filter((l) => /z\.coerce\.date\(/.test(l));
      const unexpected = lines.filter((l) => !ALLOWED_RAW_COERCE_LINES.some((re) => re.test(l)));
      expect(unexpected, `unexpected raw z.coerce.date() in ${rel}:\n${unexpected.join('\n')}`).toHaveLength(0);
    }
  });
});
