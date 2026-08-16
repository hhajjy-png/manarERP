// @vitest-environment jsdom
/**
 * حارس دائم — **الكشف الرسمي المختصر لا يكشف الحسبة الداخلية** (المتطلبان ١١ و٢١).
 *
 * الخادم يحرس هذا بنيويًا (مسار `/statement` لا يرسل أجر الساعة ولا المعاملات ولا
 * المبلغ المستهدف أصلًا). هذا الاختبار يحرس الطرف الآخر: أن **القالب** لا يخترع تلك
 * القيم ولا يستوردها من مكان آخر، وأن الصفحتين المطبوعتين تقرأان من مسارَين مختلفَين
 * — فلا يتسرّب مسار التفاصيل إلى مستند يوقّعه الموظف.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { render } from '@testing-library/react';
import StatementTemplate from '../employee-compensation/StatementTemplate';
import type { StatementData } from '../employee-compensation/types';

const DATA: StatementData = {
  id: 1,
  year: 2026,
  month: 6,
  status: 'APPROVED',
  approvedAt: '2026-07-01T00:00:00.000Z',
  approvedByName: 'مدير الموارد البشرية',
  preparedByName: 'موظف الحسابات',
  employee: {
    code: 'E-001',
    fullName: 'موظف تجريبي',
    jobTitle: 'سائق',
    department: 'العمليات',
    nationality: 'كويتي',
    civilId: '290010100001',
  },
  basicSalary: 480,
  // ساعات وصلت عبر الحسبة العكسية — ويجب أن تُعرض كحسبة عادية تمامًا.
  overtime: [{ overtimeType: 'REGULAR', hours: 11, amount: 27.5 }],
  earnings: [{ label: 'مكافأة أداء', type: 'BONUS', amount: 50 }],
  deductions: [{ label: 'سلفة', type: 'ADVANCE', amount: 30 }],
  totals: {
    totalOvertimeAmount: 27.5,
    totalOtherEarnings: 50,
    grossEntitlements: 557.5,
    totalDeductions: 30,
    netAmount: 527.5,
  },
  notes: null,
};

describe('الكشف الرسمي المختصر — ما يعرضه', () => {
  // التسميات صارت ثنائية اللغة داخل نفس السطر («البند / Description»)، فنصّ السطر
  // موزَّع على عقد نصّية وعنصر `<bdi>`؛ `getByText` تقرأ العقد النصّية المباشرة وحدها،
  // فالفحص على نصّ الشجرة. المُتحقَّق منه هو نفسه: البنود ومبالغها وساعات الإضافي.
  it('يعرض البنود النهائية بمبالغها، وعدد ساعات العمل الإضافي ضمن نصّ البند', () => {
    const { container } = render(<StatementTemplate data={DATA} />);
    const text = (container.textContent ?? '').replace(/\s+/g, ' ');
    expect(text).toContain('موظف تجريبي');
    expect(text).toMatch(/عمل إضافي \/ Overtime — 11 ساعة/);
    expect(text).toContain('مكافأة أداء');
    expect(text).toContain('صافي المستحق / Net Entitlement');
  });
});

describe('الكشف الرسمي المختصر — ما لا يعرضه أبدًا', () => {
  it('لا أثر للحسبة العكسية ولا للمبلغ المستهدف ولا لفرق التقريب', () => {
    const { container } = render(<StatementTemplate data={DATA} />);
    const text = container.textContent ?? '';
    for (const forbidden of ['حسبة عكسية', 'المبلغ المستهدف', 'فرق التقريب', 'قبل التقريب']) {
      expect(text, `تسرّب «${forbidden}» إلى الكشف الرسمي`).not.toContain(forbidden);
    }
  });

  it('لا أجر ساعة ولا معامل ولا مرجع قانوني في مستند يوقّعه الموظف', () => {
    const { container } = render(<StatementTemplate data={DATA} />);
    const text = container.textContent ?? '';
    for (const forbidden of ['أجر الساعة', 'المعامل', 'المادة ٦٦', 'قانون العمل']) {
      expect(text, `تسرّب «${forbidden}» إلى الكشف الرسمي`).not.toContain(forbidden);
    }
  });

  it('القالب نفسه لا يقرأ أي حقل داخلي — الحارس على المصدر لا على النصّ المُصيَّر وحده', () => {
    const src = readFileSync('src/employee-compensation/StatementTemplate.tsx', 'utf8');
    // النصّ داخل التعليقات يذكرها للشرح؛ الحارس على الكود وحده.
    const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    for (const field of ['hourlyRate', 'multiplier', 'reverseTargetAmount', 'rawHoursBeforeCeiling', 'calculationMethod', 'legalReference', 'legalRulesVersion']) {
      expect(code, `القالب المختصر يقرأ الحقل الداخلي «${field}»`).not.toContain(field);
    }
  });

  /**
   * سعر الشركة والحد القانوني **بيانات حسبة داخلية** لا بنود كشف (المتطلب ٢٠).
   *
   * الخادم يحرسها بنيويًا (مسار `/statement` لا يرسلها أصلًا)، وهذا الحارس على الطرف
   * الآخر: أن القالب لا يخترعها ولا يستوردها من مكان آخر. الموظف يوقّع على «العمل
   * الإضافي: ١١ ساعة — ٢٧٫٥٠٠ د.ك»، لا على شرح كيف اختارت الشركة سعر ساعته.
   */
  it('لا سعر شركة ولا حد قانوني ولا إصدار سياسة في الكشف الموقَّع', () => {
    const { container } = render(<StatementTemplate data={DATA} />);
    const text = container.textContent ?? '';
    for (const forbidden of ['سعر الشركة', 'الحد القانوني', 'المستخدم فعليًا', 'سياسة الشركة']) {
      expect(text, `تسرّب «${forbidden}» إلى الكشف الرسمي`).not.toContain(forbidden);
    }

    const code = readFileSync('src/employee-compensation/StatementTemplate.tsx', 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*$/gm, '');
    for (const field of [
      'companyBaseRate',
      'companyDerivedRate',
      'effectiveRate',
      'statutoryMinimumRate',
      'rateSource',
      'companyOvertimeBaseRate',
      'companyOvertimePolicyVersion',
    ]) {
      expect(code, `القالب المختصر يقرأ «${field}»`).not.toContain(field);
    }
  });

  it('نوع `StatementData` نفسه لا يحمل أي حقل سعر — الحارس في النوع لا في القالب وحده', () => {
    const types = readFileSync('src/employee-compensation/types.ts', 'utf8');
    const statementType = types.match(/export interface StatementData \{[\s\S]*?\n\}/)?.[0] ?? '';
    expect(statementType, 'لم يُعثر على StatementData').not.toBe('');
    for (const field of ['effectiveRate', 'companyBaseRate', 'statutoryMinimumRate', 'rateSource']) {
      expect(statementType, `«${field}» داخل نوع الكشف الموقَّع`).not.toContain(field);
    }
  });
});

describe('فصل مسارَي الطباعة', () => {
  it('صفحة الكشف تقرأ /statement وصفحة التفاصيل تقرأ /detailed — لا تبادل', () => {
    const statementPage = readFileSync('src/pages/EmployeeCompensationStatement.tsx', 'utf8');
    const detailedPage = readFileSync('src/pages/EmployeeCompensationDetailed.tsx', 'utf8');
    // النداء مكتوب على سطرين (`compensationApi\n  .statement(`)، فالمطابقة تتسامح مع المسافات.
    const calls = (src: string, method: string) => new RegExp(`compensationApi\\s*\\.\\s*${method}\\s*\\(`).test(src);
    expect(calls(statementPage, 'statement')).toBe(true);
    expect(calls(statementPage, 'detailed')).toBe(false);
    expect(calls(detailedPage, 'detailed')).toBe(true);
    expect(calls(detailedPage, 'statement')).toBe(false);
  });

  it('القالب المختصر لا يُستورد في صفحة التفاصيل ولا العكس', () => {
    const statementPage = readFileSync('src/pages/EmployeeCompensationStatement.tsx', 'utf8');
    const detailedPage = readFileSync('src/pages/EmployeeCompensationDetailed.tsx', 'utf8');
    expect(statementPage).toContain('StatementTemplate');
    expect(statementPage).not.toContain('DetailedReportTemplate');
    expect(detailedPage).toContain('DetailedReportTemplate');
    expect(detailedPage).not.toContain('StatementTemplate');
  });
});

describe('عزل الوحدة في الواجهة', () => {
  it('لا صفحة في الوحدة تستدعي مسار رواتب أو محاسبة', () => {
    const files = [
      'src/pages/EmployeeCompensation.tsx',
      'src/pages/EmployeeCompensationFile.tsx',
      'src/pages/EmployeeCompensationMonth.tsx',
      'src/pages/EmployeeCompensationStatement.tsx',
      'src/pages/EmployeeCompensationDetailed.tsx',
      'src/employee-compensation/api.ts',
    ];
    for (const file of files) {
      const code = readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
      for (const forbidden of ['/payroll', '/salaries', '/accounting', '/transactions', '/expenses', '/cheques']) {
        expect(code, `${file} يستدعي ${forbidden}`).not.toContain(`'${forbidden}`);
      }
    }
  });

  it('كل نداءات الوحدة تمرّ بـ compensationApi لا بـ api مباشرةً', () => {
    for (const file of [
      'src/pages/EmployeeCompensation.tsx',
      'src/pages/EmployeeCompensationFile.tsx',
      'src/pages/EmployeeCompensationMonth.tsx',
    ]) {
      const code = readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
      expect(code, `${file} ينادي api.* مباشرةً`).not.toMatch(/\bapi\.(get|post|put|delete)\(/);
    }
  });
});
