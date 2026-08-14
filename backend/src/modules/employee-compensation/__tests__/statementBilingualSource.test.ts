import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

/**
 * حارس دائم — **مصدر الاسم الإنجليزي في كشف مستحقات الموظف الشهرية**.
 *
 * الكشف صار ثنائي اللغة، فاحتاج الاسم الإنجليزي. القرار المحروس هنا: يُقرأ من الحقل
 * **القائم** `Employee.fullNameEn` — بلا عمود جديد، بلا هجرة، وبلا لقطة جديدة — وقراءةً
 * فقط. إن أُعيدت كتابته يومًا بحقل لقطة أو باستعلام يكتب، يسقط هذا الاختبار.
 *
 * (منع الكتابة على ملف الموظف محروس أصلًا في `moduleIsolation.test.ts`؛ هنا نثبت
 * الطرف الآخر: أن الحقل موجود في المخطّط سلفًا فلا هجرة يستلزمها هذا التغيير.)
 */
const SERVICE = fs.readFileSync(
  path.resolve(__dirname, '..', 'employeeCompensation.service.ts'),
  'utf8',
);

const SCHEMA = fs.readFileSync(
  path.resolve(__dirname, '..', '..', '..', '..', 'prisma', 'schema.prisma'),
  'utf8',
);

describe('كشف المستحقات الشهرية — مصدر الاسم الإنجليزي', () => {
  it('`fullNameEn` حقل قائم في نموذج الموظف — لا تغيير مخطّط ولا هجرة', () => {
    const model = SCHEMA.match(/model Employee \{[\s\S]*?\n\}/)?.[0] ?? '';
    expect(model).toContain('fullNameEn');
  });

  it('الكشف يقرأ الاسم الإنجليزي من ملف الموظف قراءةً فقط', () => {
    const statement = SERVICE.match(/async getStatementData\([\s\S]*?\n  \},/)?.[0] ?? '';
    expect(statement, 'لم يُعثر على getStatementData').not.toBe('');
    expect(statement).toContain('prisma.employee.findUnique');
    expect(statement).toContain('fullNameEn');
    for (const write of ['create', 'update', 'upsert', 'delete']) {
      expect(statement, `مسار الكشف يكتب: ${write}`).not.toContain(`prisma.employee.${write}`);
    }
  });

  it('الاسم الإنجليزي لا يدخل أي إجمالي — الأرقام مأخوذة من اللقطة كما هي', () => {
    const statement = SERVICE.match(/async getStatementData\([\s\S]*?\n  \},/)?.[0] ?? '';
    const totals = statement.match(/totals: \{[\s\S]*?\},/)?.[0] ?? '';
    expect(totals).toContain('grossEntitlements: c.grossEntitlements');
    expect(totals).toContain('totalDeductions: c.totalDeductions');
    expect(totals).toContain('netAmount: c.netAmount');
    expect(totals).not.toContain('fullNameEn');
  });
});
