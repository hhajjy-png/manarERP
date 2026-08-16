import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

/**
 * حارس دائم — **عزل وحدة مستحقات الموظف الشهرية** (المتطلبان ٣١ و٢٩‑١٦).
 *
 * لا يمكن لاختبار سلوكي أن يثبت «غياب أثر جانبي» إثباتًا كاملًا: يستطيع أن يثبت أن
 * *هذا* المسار لم يكتب في الرواتب، لا أن **لا مسار** يفعل. لذلك يفحص هذا الملف
 * **المصدر نفسه**: أي استيراد من وحدة محظورة، أو أي وصول إلى نموذج Prisma خارج جداول
 * الوحدة الأربعة، يُسقط الاختبار — سواء أُضيف اليوم أو بعد سنة.
 *
 * هذا هو ما يجعل «الوحدة لا تُرحِّل إلى المحاسبة» ضمانةً محروسة لا نيّة مكتوبة في README.
 */

const MODULE_ROOT = path.resolve(__dirname, '..');

/** كل ملفات المصدر داخل الوحدة عدا الاختبارات. */
function sourceFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === '__tests__' ? [] : sourceFiles(full);
    return entry.isFile() && full.endsWith('.ts') ? [full] : [];
  });
}

const FILES = sourceFiles(MODULE_ROOT);

/** الوحدات التي يحرّم على هذه الوحدة استيراد أي شيء منها. */
const FORBIDDEN_MODULES = [
  'payroll',
  'salaries',
  'accounting',
  'transactions',
  'expenses',
  'cheques',
  'bankAccounts',
  'bankStatementImport',
  'payrollBankExport',
  'payrollBankImport',
  'invoices',
  'inventory',
  'contracts',
  'financial',
  'statements',
];

/**
 * نماذج Prisma المسموح للوحدة بلمسها.
 * `employee` مسموحة **للقراءة فقط** — يفرض ذلك الفحص المستقل أدناه.
 */
const ALLOWED_PRISMA_MODELS = [
  'employee',
  'employeeCompensationCalculation',
  'overtimeLine',
  // تفاصيل أيام العمل الإضافي — جدول تابع للحسبة وحدها، تُحذف صفوفه بحذفها (Cascade).
  // ليس سجل حضور (`Attendance`) ولا جدول دوام: لا يقرأ الحضور ولا يكتب فيه، ولا يعرف
  // عن الموظف شيئًا خارج حسبته الشهرية.
  'overtimeDayEntry',
  'compensationEarningLine',
  'compensationDeductionLine',
  // سجل المديونيات والسلف — جدولان يخصّان هذه الوحدة وحدها. ليست `PayrollAdvance`
  // ولا `Deduction`: لا تُنشئهما ولا تقرؤهما.
  'employeeCompensationDebt',
  'employeeCompensationDebtPayment',
  'auditLog', // عبر `recordAudit` وحده، لا مباشرةً
  // جدول الإعدادات العام — **مفتاح واحد مُنَمَّط باسم الوحدة** يحمل الافتراضي العام
  // لسعر ساعة الإضافي. لا جدول إعدادات ثانٍ للوحدة، ولا وصول إلى مفاتيح وحدات أخرى:
  // يفرض ذلك الفحصُ المستقل أدناه على نصّ المفتاح المستعمل.
  'setting',
  '$transaction',
];

/** نماذج مالية يجب ألّا تُلمس ولو بقراءة — أسماؤها تشبه نماذج الوحدة فتُخلط سهوًا. */
const FORBIDDEN_PRISMA_MODELS = [
  'payroll',
  'payrollLine',
  'payrollAdvance',
  'employeeAllowance',
  'employeeRecurringDeduction',
  'deduction',
  'bonus',
  'transaction',
  'journalEntry',
  'expense',
  'cheque',
  'employeeFinalSettlement',
  'employeeEntitlementLedger',
  // ── أُضيفت مع حزمة السجل اليومي ──
  // سجل الحضور وتقويم العطل يشبهان الآن جدول الوحدة شبهًا خادعًا: كلاهما «أيام موظف».
  // لكن `OvertimeDayEntry` بندُ حسبةٍ شهرية يُدخله المستخدم، لا واقعةُ حضور مقيسة، ولا
  // يُصنّف يومًا عطلةً رسمية من تلقاء نفسه (المتطلبان ٤٧ و٤٨). قراءتهما هنا كانت ستجعل
  // الوحدة تستنتج تصنيفًا قانونيًا من بيانات وحدة أخرى لا تملك ضمان دقّتها.
  'attendance',
  'holiday',
  'leave',
];

/** عمليات Prisma التي تكتب. */
const WRITE_OPS = ['create', 'createMany', 'update', 'updateMany', 'upsert', 'delete', 'deleteMany'];

describe('عزل الوحدة — لا استيراد من أي وحدة مالية', () => {
  it('لا يستورد أي ملف في الوحدة من الرواتب أو المحاسبة أو أي وحدة مالية', () => {
    const violations: string[] = [];
    for (const file of FILES) {
      const src = fs.readFileSync(file, 'utf8');
      for (const match of src.matchAll(/from\s+['"]([^'"]+)['"]/g)) {
        const spec = match[1];
        if (!spec.includes('modules/') && !spec.includes('../')) continue;
        for (const forbidden of FORBIDDEN_MODULES) {
          if (spec.includes(`modules/${forbidden}`) || spec.includes(`../${forbidden}/`)) {
            violations.push(`${path.relative(MODULE_ROOT, file)} → ${spec}`);
          }
        }
      }
    }
    expect(violations, `استيراد محظور من وحدة مالية:\n${violations.join('\n')}`).toEqual([]);
  });
});

describe('عزل الوحدة — لا كتابة خارج جداولها الأربعة', () => {
  it('كل وصول إلى Prisma يقع على نموذج مسموح', () => {
    const violations: string[] = [];
    for (const file of FILES) {
      const src = fs.readFileSync(file, 'utf8');
      for (const match of src.matchAll(/\b(?:prisma|tx)\.([A-Za-z$][A-Za-z0-9_$]*)/g)) {
        const model = match[1];
        if (!ALLOWED_PRISMA_MODELS.includes(model)) {
          violations.push(`${path.relative(MODULE_ROOT, file)} → prisma.${model}`);
        }
      }
    }
    expect(violations, `وصول إلى نموذج خارج نطاق الوحدة:\n${violations.join('\n')}`).toEqual([]);
  });

  it('لا وصول — ولو بقراءة — إلى أي نموذج مالي خارج الوحدة', () => {
    const violations: string[] = [];
    for (const file of FILES) {
      const src = fs.readFileSync(file, 'utf8');
      for (const match of src.matchAll(/(?:prisma|tx|db)\.([A-Za-z$][A-Za-z0-9_$]*)/g)) {
        if (FORBIDDEN_PRISMA_MODELS.includes(match[1])) {
          violations.push(`${path.relative(MODULE_ROOT, file)} → prisma.${match[1]}`);
        }
      }
    }
    expect(violations, `وصول إلى نموذج مالي محظور:\n${violations.join('\n')}`).toEqual([]);
  });

  it('لا عملية كتابة واحدة على نموذج الموظف — قراءة فقط', () => {
    const violations: string[] = [];
    for (const file of FILES) {
      const src = fs.readFileSync(file, 'utf8');
      for (const match of src.matchAll(/\b(?:prisma|tx)\.employee\.([A-Za-z]+)/g)) {
        if (WRITE_OPS.includes(match[1])) {
          violations.push(`${path.relative(MODULE_ROOT, file)} → prisma.employee.${match[1]}`);
        }
      }
    }
    expect(violations, `كتابة على ملف الموظف:\n${violations.join('\n')}`).toEqual([]);
  });
});

describe('عزل الوحدة — الإعدادات بمفتاح الوحدة وحده', () => {
  it('لا يقرأ ولا يكتب أي مفتاح إعدادات خارج نطاق `employeeCompensation.`', () => {
    const violations: string[] = [];
    for (const file of FILES) {
      const src = fs.readFileSync(file, 'utf8');
      if (!/\b(?:prisma|tx)\.setting\b/.test(src)) continue;
      // كل مفتاح إعدادات في الوحدة يجب أن يأتي من الثابت المركزي، لا نصًّا حرفيًا.
      for (const match of src.matchAll(/key:\s*'([^']+)'/g)) {
        violations.push(`${path.relative(MODULE_ROOT, file)} → مفتاح إعدادات مكتوب نصًّا: ${match[1]}`);
      }
      if (!src.includes('COMPANY_OVERTIME_RATE_SETTING_KEY')) {
        violations.push(`${path.relative(MODULE_ROOT, file)} → يلمس جدول الإعدادات بلا الثابت المركزي`);
      }
    }
    expect(violations, violations.join('\n')).toEqual([]);
  });

  it('الثابت المركزي نفسه منمَّط باسم الوحدة', async () => {
    const policy = await import('../policy/companyOvertimePolicy');
    expect(policy.COMPANY_OVERTIME_RATE_SETTING_KEY.startsWith('employeeCompensation.')).toBe(true);
    expect(policy.COMPANY_OVERTIME_SETTING_GROUP).toBe('employeeCompensation');
  });
});

/**
 * القانون وسياسة الشركة **مفهومان لا يُخلطان** (المتطلب ١٠).
 *
 * الحارس هنا ليس أسلوبيًا: خلطهما يعني أن يبدو تعديل سعر إداري كأنه تعديل لنصّ القانون،
 * وأن يحمل إصدارٌ واحد معنيين متناقضين فيفقد كلٌّ منهما قدرته على شرح حسبة قديمة.
 */
describe('فصل سياسة الشركة عن نصّ القانون', () => {
  const policyFile = path.join(MODULE_ROOT, 'policy', 'companyOvertimePolicy.ts');
  const legalSource = fs.readFileSync(path.join(MODULE_ROOT, 'legal', 'kuwaitLabourLaw.ts'), 'utf8');
  const policySource = fs.readFileSync(policyFile, 'utf8');

  it('ملف القانون لا يعرف شيئًا عن سعر الشركة', () => {
    expect(legalSource).not.toContain('COMPANY_OVERTIME');
    expect(legalSource).not.toContain('companyOvertimePolicy');
  });

  it('ملف السياسة لا يعيد تعريف إصدار القانون ولا معامله الحصري (١٫٢٥)', () => {
    expect(policySource).not.toContain('LEGAL_RULES_VERSION =');
    const code = policySource.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    expect(code, 'معامل المادة ٦٦ مكتوب داخل سياسة الشركة').not.toContain('1.25');
  });

  it('الإصداران منفصلان اسمًا وقيمة', async () => {
    const legal = await import('../legal/kuwaitLabourLaw');
    const policy = await import('../policy/companyOvertimePolicy');
    expect(policy.COMPANY_OVERTIME_POLICY_VERSION).not.toBe(legal.LEGAL_RULES_VERSION);
  });
});

describe('مركزية القواعد القانونية — لا قيمة مبعثرة', () => {
  const legalFile = path.join(MODULE_ROOT, 'legal', 'kuwaitLabourLaw.ts');
  const nonLegalSources = FILES.filter((f) => f !== legalFile);

  it('المعاملات القانونية (1.25 / 1.5 / 2) لا تظهر خارج ملف القواعد', () => {
    const violations: string[] = [];
    for (const file of nonLegalSources) {
      const code = fs
        .readFileSync(file, 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/\/\/.*$/gm, '');
      // رقم معامل حرفي مسنَد أو مضروب — لا مجرّد ظهوره داخل نص.
      if (/multiplier\s*[:=]\s*[\d.]+/.test(code)) violations.push(path.relative(MODULE_ROOT, file));
    }
    expect(violations, `معامل قانوني مكتوب خارج legal/:\n${violations.join('\n')}`).toEqual([]);
  });

  it('قاسم أجر الساعة يُستورَد من خط الأساس الموثَّق ولا يُعاد تعريفه رقمًا', () => {
    const legal = fs.readFileSync(legalFile, 'utf8');
    expect(legal).toContain("from '../../employees/entitlements.calc'");
    // لا يوجد إسناد رقمي مباشر للقاسم — القيمة تأتي من المصدر المستورَد وحده.
    expect(legal).not.toMatch(/MONTHLY_WAGE_DAYS_DIVISOR\s*=\s*\d/);
  });

  it('لا ملف خارج legal/ يحسب أجر الساعة بقسمة حرفية', () => {
    const violations: string[] = [];
    for (const file of nonLegalSources) {
      if (file.endsWith(path.join('engine', 'hourlyRate.ts'))) continue; // يستهلك الثابت، ولا يعرّفه
      const code = fs.readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
      if (/\/\s*(208|240|26)\b/.test(code)) violations.push(path.relative(MODULE_ROOT, file));
    }
    expect(violations, `قسمة على قاسم أجر مكتوبة يدويًا:\n${violations.join('\n')}`).toEqual([]);
  });
});

describe('عزل الوحدة — لا صلاحيات مستعارة', () => {
  it('كل مسار محروس بمفتاح `employeeCompensation.*` لا بمفتاح رواتب', () => {
    const routes = fs.readFileSync(path.join(MODULE_ROOT, 'employeeCompensation.routes.ts'), 'utf8');
    const permissions = [...routes.matchAll(/requirePermission\('([^']+)'\)/g)].map((m) => m[1]);
    expect(permissions.length).toBeGreaterThan(0);
    for (const key of permissions) {
      expect(key.startsWith('employeeCompensation.')).toBe(true);
    }
  });

  it('لا مسار بلا حارس صلاحية', () => {
    const routes = fs.readFileSync(path.join(MODULE_ROOT, 'employeeCompensation.routes.ts'), 'utf8');
    const guards = ['READ', 'CREATE', 'UPDATE', 'DELETE', 'APPROVE', 'PRINT'];
    const routeLines = routes
      .split('\n')
      .filter((l) => /^router\.(get|post|put|delete|patch)\(/.test(l.trim()));
    expect(routeLines.length).toBeGreaterThan(0);
    for (const line of routeLines) {
      expect(guards.some((g) => line.includes(`, ${g},`)), `مسار بلا حارس: ${line.trim()}`).toBe(true);
    }
  });
});
