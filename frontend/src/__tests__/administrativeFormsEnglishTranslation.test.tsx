// @vitest-environment jsdom
/**
 * Administrative Forms English Translation Completion v1 — العقد الذي تحرسه هذه
 * الاختبارات على مستوى النماذج نفسها:
 *
 *   1. الوضع العربي لم يتغيّر: المسمى الوظيفي والقسم بالعربي كما هما.
 *   2. الوضع الإنجليزي يحلّ المكافئ المُهيّأ من قاموس «إعدادات الشركة».
 *   3. غياب الترجمة يتبع سياسة السقوط المركزية (العربية كما هي).
 *   4. تُغطى كل النماذج الإدارية المشمولة، لا نموذجًا واحدًا.
 *   5. المعاينة الدقيقة/PDF تستهلك **نفس** القيمة المحلولة (نستنسخ نفس العقدة).
 *   6. لا خريطة ترجمة عربي→إنجليزي داخل أي نموذج.
 *
 * عقد العمل خارج النطاق تمامًا — حارسه في `employmentContractExclusionGuard.test.ts`.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import '@testing-library/jest-dom';
import fs from 'node:fs';
import path from 'node:path';

import { useSettings } from '../stores/settingsStore';
import { parseBusinessTermDictionaries } from '../lib/businessTerms';
import { applyTranslationOverrides } from '../forms/shared/contractTranslations';
import { composeFromNode } from '../printing/composeDocument';
import { getPageSpec } from '../printing/pageSpec';

import LeaveRequestTemplate from '../forms/LeaveRequestTemplate';
import ReturnToWorkTemplate from '../forms/ReturnToWorkTemplate';
import ResignationTemplate from '../forms/ResignationTemplate';
import SalaryAdvanceTemplate from '../forms/SalaryAdvanceTemplate';
import EmployeeWarningTemplate from '../forms/EmployeeWarningTemplate';
import PerformanceEvaluationTemplate from '../forms/PerformanceEvaluationTemplate';
import SalaryCertificateTemplate from '../forms/SalaryCertificateTemplate';
import ToWhomItMayConcernTemplate from '../forms/ToWhomItMayConcernTemplate';
import PurchaseRequestTemplate from '../forms/PurchaseRequestTemplate';

/** القاموس المُهيّأ الذي يفترضه العميل في مراجعته البصرية. */
const CONFIGURED = [
  { key: 'dict.forms.jobTitles', value: JSON.stringify({ 'سائق شاحنة': 'Truck Driver' }) },
  { key: 'dict.forms.departments', value: JSON.stringify({ 'السائقين': 'Drivers' }) },
  { key: 'dict.forms.nationalities', value: JSON.stringify({ 'هندي': 'Indian' }) },
];

const EMPLOYEE = {
  id: 1,
  code: 'E-001',
  fullName: 'محمد أحمد',
  fullNameEn: 'MOHAMMED AHMED',
  civilId: '290010112345',
  jobTitle: 'سائق شاحنة',
  department: 'السائقين',
  nationality: 'هندي',
  salary: 350,
  hireDate: '2020-01-01',
};

/** كل نموذج إداري مشمول + كيف يُركَّب بأقل الخصائص الممكنة. */
const FORMS: { name: string; render: (lang: 'ar' | 'en') => JSX.Element }[] = [
  { name: 'LeaveRequest', render: (lang) => <LeaveRequestTemplate employee={EMPLOYEE} latestLeave={null} lang={lang} /> },
  { name: 'ReturnToWork', render: (lang) => <ReturnToWorkTemplate employee={EMPLOYEE} latestLeave={null} lang={lang} /> },
  { name: 'Resignation', render: (lang) => <ResignationTemplate employee={EMPLOYEE} lang={lang} /> },
  { name: 'SalaryAdvance', render: (lang) => <SalaryAdvanceTemplate employee={EMPLOYEE} latestAdvance={null} lang={lang} /> },
  { name: 'EmployeeWarning', render: (lang) => <EmployeeWarningTemplate employee={EMPLOYEE} lang={lang} /> },
  { name: 'PerformanceEvaluation', render: (lang) => <PerformanceEvaluationTemplate employee={EMPLOYEE} latestReview={null} lang={lang} /> },
  { name: 'SalaryCertificate', render: (lang) => <SalaryCertificateTemplate employee={EMPLOYEE} latestPayroll={null} lang={lang} /> },
  { name: 'ToWhomItMayConcern', render: (lang) => <ToWhomItMayConcernTemplate employee={EMPLOYEE} latestPayroll={null} lang={lang} /> },
];

function loadDictionaries(rows: { key: string; value: string }[]) {
  useSettings.getState().setBusinessTerms(parseBusinessTermDictionaries(rows));
}

describe('النماذج الإدارية — الوضع العربي لم يتغيّر', () => {
  beforeEach(() => loadDictionaries(CONFIGURED));
  afterEach(cleanup);

  it.each(FORMS)('$name بالعربي يعرض «سائق شاحنة» و«السائقين»', ({ render: renderForm }) => {
    render(renderForm('ar'));
    expect(screen.getAllByText('سائق شاحنة').length).toBeGreaterThan(0);
    expect(screen.getAllByText('السائقين').length).toBeGreaterThan(0);
    expect(screen.queryByText('Truck Driver')).toBeNull();
    expect(screen.queryByText('Drivers')).toBeNull();
  });
});

describe('النماذج الإدارية — الوضع الإنجليزي يحلّ الترجمة المُهيّأة', () => {
  beforeEach(() => loadDictionaries(CONFIGURED));
  afterEach(cleanup);

  it.each(FORMS)('$name بالإنجليزي يعرض Truck Driver / Drivers', ({ render: renderForm }) => {
    render(renderForm('en'));
    expect(screen.getAllByText('Truck Driver').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Drivers').length).toBeGreaterThan(0);
    expect(screen.queryByText('سائق شاحنة')).toBeNull();
    expect(screen.queryByText('السائقين')).toBeNull();
  });
});

describe('فئات ديناميكية إضافية اكتشفها التدقيق', () => {
  beforeEach(() => loadDictionaries(CONFIGURED));
  afterEach(cleanup);

  it('الجنسية تُترجَم في شهادة الراتب و«لمن يهمه الأمر»', () => {
    render(<SalaryCertificateTemplate employee={EMPLOYEE} latestPayroll={null} lang="en" />);
    expect(screen.getAllByText('Indian').length).toBeGreaterThan(0);
    cleanup();
    render(<ToWhomItMayConcernTemplate employee={EMPLOYEE} latestPayroll={null} lang="en" />);
    expect(screen.getAllByText('Indian').length).toBeGreaterThan(0);
  });

  it('غرض الشهادة يتبع نفس القاموس عند تهيئته', () => {
    loadDictionaries([
      ...CONFIGURED,
      { key: 'dict.forms.certificatePurposes', value: JSON.stringify({ 'لفتح حساب بنكي': 'To open a bank account' }) },
    ]);
    render(<ToWhomItMayConcernTemplate employee={EMPLOYEE} latestPayroll={null} lang="en" printFields={{ certPurpose: 'لفتح حساب بنكي' }} />);
    expect(screen.getAllByText('To open a bank account').length).toBeGreaterThan(0);
  });

  it('قسم طلب الشراء (إدخال يدوي) يمرّ عبر نفس قاموس الأقسام', () => {
    const pf = {
      requestNumber: 'PR-1', date: '2026-01-01', requiredDate: '2026-01-05',
      requesterName: 'AHMED', department: 'السائقين', priority: 'HIGH' as const,
      reason: '', items: [], notes: '', requestedBy: '', reviewedBy: '', approvedBy: '',
    };
    render(<PurchaseRequestTemplate printFields={pf} lang="en" />);
    expect(screen.getAllByText('Drivers').length).toBeGreaterThan(0);
    cleanup();
    render(<PurchaseRequestTemplate printFields={pf} lang="ar" />);
    expect(screen.getAllByText('السائقين').length).toBeGreaterThan(0);
  });

  it('تجاوز الطباعة اليدوي في شهادة الراتب يمرّ عبر نفس المُحلِّل', () => {
    render(
      <SalaryCertificateTemplate
        employee={EMPLOYEE}
        latestPayroll={null}
        lang="en"
        printOverrides={{ jobTitle: 'سائق شاحنة', department: 'قسم غير مُهيّأ' }}
      />,
    );
    expect(screen.getAllByText('Truck Driver').length).toBeGreaterThan(0);
    // بلا ترجمة مُهيّأة ⇒ النص كما أُدخل (نفس سياسة السقوط، لا اختراع).
    expect(screen.getAllByText('قسم غير مُهيّأ').length).toBeGreaterThan(0);
  });
});

describe('عزل عن قاموس عقد العمل — على مستوى التصيير', () => {
  afterEach(() => {
    cleanup();
    applyTranslationOverrides({}, {});
  });

  it('تعديل قاموس عقد العمل لا يظهر إطلاقًا في نموذج إداري إنجليزي', () => {
    loadDictionaries(CONFIGURED);
    applyTranslationOverrides({ 'هندي': 'CONTRACT NAT' }, { 'سائق شاحنة': 'CONTRACT JOB' });

    render(<SalaryCertificateTemplate employee={EMPLOYEE} latestPayroll={null} lang="en" />);
    expect(screen.getAllByText('Truck Driver').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Indian').length).toBeGreaterThan(0);
    expect(screen.queryByText('CONTRACT JOB')).toBeNull();
    expect(screen.queryByText('CONTRACT NAT')).toBeNull();
  });

  it('صفوف إعدادات تحمل مفاتيح عقد العمل وحدها ⇒ النماذج تبقى على بذورها', () => {
    loadDictionaries([
      { key: 'dict.jobTitles', value: JSON.stringify({ 'سائق شاحنة': 'CONTRACT JOB' }) },
      { key: 'dict.nationalities', value: JSON.stringify({ 'هندي': 'CONTRACT NAT' }) },
    ]);
    render(<LeaveRequestTemplate employee={EMPLOYEE} latestLeave={null} lang="en" />);
    expect(screen.getAllByText('Truck Driver').length).toBeGreaterThan(0);
    expect(screen.queryByText('CONTRACT JOB')).toBeNull();
  });
});

describe('سياسة السقوط المركزية داخل النماذج', () => {
  afterEach(cleanup);

  it('بلا ترجمة مُهيّأة إطلاقًا ⇒ النموذج الإنجليزي يعرض القيمة العربية كما هي', () => {
    loadDictionaries([
      { key: 'dict.forms.jobTitles', value: JSON.stringify({}) },
      { key: 'dict.forms.departments', value: JSON.stringify({}) },
    ]);
    render(<LeaveRequestTemplate employee={{ ...EMPLOYEE, jobTitle: 'مهنة نادرة', department: 'قسم نادر' }} latestLeave={null} lang="en" />);
    expect(screen.getAllByText('مهنة نادرة').length).toBeGreaterThan(0);
    expect(screen.getAllByText('قسم نادر').length).toBeGreaterThan(0);
  });

  it('قيمة غائبة ⇒ شرطة، في اللغتين', () => {
    loadDictionaries(CONFIGURED);
    const blank = { ...EMPLOYEE, jobTitle: null, department: null };
    render(<ResignationTemplate employee={blank} lang="en" />);
    expect(screen.getAllByText('—').length).toBeGreaterThan(0);
  });
});

describe('تطابق الشاشة / المعاينة الدقيقة / PDF', () => {
  beforeEach(() => loadDictionaries(CONFIGURED));
  afterEach(cleanup);

  it('المستند المُركَّب من نفس العقدة المطبوعة يحمل القيمة المحلولة ذاتها', () => {
    const { container } = render(
      <div>
        <SalaryCertificateTemplate employee={EMPLOYEE} latestPayroll={null} lang="en" />
      </div>,
    );
    const node = container.firstElementChild as HTMLElement;
    const composed = composeFromNode({
      node,
      pageSpec: getPageSpec('a4-portrait'),
      title: 'Salary Certificate',
      lang: 'en',
    });
    // نفس القيمة المحلولة — لا ترجمة ثانية خاصة بالطباعة.
    expect(composed).toContain('Truck Driver');
    expect(composed).toContain('Drivers');
    expect(composed).not.toContain('سائق شاحنة');
    expect(composed).not.toContain('السائقين');
  });
});

describe('حارس معماري — لا ترجمة محلية داخل أي نموذج', () => {
  const FORMS_DIR = path.resolve(__dirname, '../forms');
  const TEMPLATE_FILES = fs
    .readdirSync(FORMS_DIR)
    .filter((f) => f.endsWith('Template.tsx') && f !== 'EmploymentContractTemplate.tsx');

  it('لا مفتاح كائن عربي (خريطة عربي→إنجليزي) في أي قالب نموذج', () => {
    const offenders: string[] = [];
    for (const file of TEMPLATE_FILES) {
      const lines = fs.readFileSync(path.join(FORMS_DIR, file), 'utf8').split('\n');
      lines.forEach((line, i) => {
        if (/^\s*'[؀-ۿ][^']*'\s*:/.test(line)) offenders.push(`${file}:${i + 1}`);
      });
    }
    expect(offenders).toEqual([]);
  });

  it('النماذج المهاجَرة تستهلك المُحلِّل المركزي، لا مساعدات عقد العمل', () => {
    const MIGRATED = [
      'LeaveRequestTemplate', 'ReturnToWorkTemplate', 'ResignationTemplate',
      'SalaryAdvanceTemplate', 'EmployeeWarningTemplate', 'PerformanceEvaluationTemplate',
      'SalaryCertificateTemplate', 'ToWhomItMayConcernTemplate', 'PurchaseRequestTemplate',
    ];
    for (const name of MIGRATED) {
      const src = fs.readFileSync(path.join(FORMS_DIR, `${name}.tsx`), 'utf8');
      expect(src, name).toContain('useBusinessTerms');
      expect(src, name).not.toContain('getJobTitleEn');
      expect(src, name).not.toContain('getNationalityEn');
    }
  });
});
