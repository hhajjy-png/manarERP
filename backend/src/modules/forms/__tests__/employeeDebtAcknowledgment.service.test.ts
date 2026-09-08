/**
 * إقرار دين موظف — عقد الخادم.
 *
 *  · نقطة نهاية **قراءة فقط**: تُرجع سجل الموظف ليملأ النموذج بيانات المدين تلقائيًا،
 *    ولا تكتب شيئًا — لا سجل مستند، ولا جدول جديد، ولا تعديل على سجل الموظف.
 *  · محميّة بنفس صلاحية النماذج الإدارية القائمة (`forms.read`) خلف `authenticate` —
 *    بلا مفتاح صلاحية جديد.
 *  · موظف غير موجود ⇒ خطأ 404 واضح، لا استجابة فارغة صامتة.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { FormsService } from '../forms.service';

vi.mock('../../../config/database', () => ({
  prisma: {
    employee: { findUnique: vi.fn() },
    payroll: { findFirst: vi.fn() },
    leave: { findFirst: vi.fn() },
    payrollAdvance: { findFirst: vi.fn() },
    performanceReview: { findFirst: vi.fn() },
    setting: { findUnique: vi.fn(), upsert: vi.fn() },
    $transaction: vi.fn(),
  },
}));

import { prisma } from '../../../config/database';

const EMPLOYEE = {
  id: 7,
  code: 'EMP-007',
  fullName: 'راجيش كومار',
  fullNameEn: 'RAJESH KUMAR',
  civilId: '292010100123',
  jobTitle: 'عامل تشغيل وصيانة',
  nationality: 'الهند',
  passportNumber: 'Z1234567',
  phone: '+965 5000 0000',
  email: 'rajesh@example.invalid',
  address: 'الفروانية',
};

describe('FormsService.getEmployeeDebtAcknowledgmentData', () => {
  let service: FormsService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new FormsService();
  });

  it('يُرجع سجل الموظف كما هو، بلا أي كتابة', async () => {
    vi.mocked(prisma.employee.findUnique).mockResolvedValue(EMPLOYEE as never);

    const result = await service.getEmployeeDebtAcknowledgmentData(7);

    expect(result).toEqual({ employee: EMPLOYEE });
    expect(prisma.employee.findUnique).toHaveBeenCalledWith({ where: { id: 7 } });
    // لا `update` ولا `create` على الموظف: النموذج لا يمسّ سجله إطلاقًا.
    expect(Object.keys(prisma.employee)).toEqual(['findUnique']);
  });

  it('موظف غير موجود ⇒ 404 برسالة عربية واضحة', async () => {
    vi.mocked(prisma.employee.findUnique).mockResolvedValue(null as never);

    await expect(service.getEmployeeDebtAcknowledgmentData(999)).rejects.toMatchObject({
      statusCode: 404,
      message: 'الموظف غير موجود',
    });
  });
});

describe('مسار إقرار دين موظف — الحماية والصلاحية', () => {
  const routes = readFileSync(join(__dirname, '..', 'forms.routes.ts'), 'utf8');

  it('مسجَّل خلف `authenticate` وبصلاحية النماذج القائمة `forms.read`', () => {
    expect(routes).toContain("router.use(authenticate);");
    const line = routes
      .split('\n')
      .find((l) => l.includes("'/employee-debt-acknowledgment/:employeeId'"));
    expect(line, 'المسار غير مسجَّل').toBeDefined();
    expect(line).toContain("requirePermission('forms.read')");
    expect(line).toContain('router.get(');
  });

  it('لا مفتاح صلاحية جديد لهذا النموذج — يُعاد استخدام مفاتيح النماذج القائمة', () => {
    const permissions = [...routes.matchAll(/requirePermission\('([^']+)'\)/g)].map((m) => m[1]);
    expect(new Set(permissions)).toEqual(new Set(['forms.read', 'forms.print']));
  });

  it('لا مسار كتابة لهذا النموذج — قراءة فقط', () => {
    const writeRoutes = [...routes.matchAll(/router\.(post|put|patch|delete)\('([^']+)'/g)].map((m) => m[2]);
    expect(writeRoutes).not.toContain('/employee-debt-acknowledgment/:employeeId');
    expect(writeRoutes.some((r) => r.includes('employee-debt-acknowledgment'))).toBe(false);
  });
});
