/**
 * Administrative Forms English Translation Completion v1 — **حارس الاستثناء والعزل**.
 *
 * عقد العمل معزول تمامًا عن قواميس النماذج الإدارية — **بيانات وكودًا**:
 *
 *   • العقد   → `dict.nationalities` / `dict.jobTitles`، يقرأها
 *              `forms/shared/contractTranslations.ts` وحده.
 *   • النماذج → `dict.forms.*`، يقرأها `lib/businessTerms.ts` وحده.
 *
 * هذا الملف يُفشل البناء إذا:
 *   1. رُبِط قالب العقد أو شاشته بالمُحلِّل/المخزن الجديد.
 *   2. أُضيفت آلية أو حقول ترجمة جديدة إلى مسار تصييره.
 *   3. تقاطعت مساحتا المفاتيح أو تسرّب قاموس إلى الآخر في أي اتجاه.
 *   4. تغيّر سلوك مساعداته القائمة أو بذوره أو سياسة سقوطها.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  BASE_JOB_TITLE_EN,
  BASE_NATIONALITY_EN,
  applyTranslationOverrides,
  getJobTitleEn,
  getNationalityEn,
} from '../forms/shared/contractTranslations';
import {
  BUSINESS_TERM_CATEGORIES,
  BUSINESS_TERM_SETTING_KEYS,
  EMPLOYMENT_CONTRACT_SETTING_KEYS,
  parseBusinessTermDictionaries,
  defaultBusinessTermDictionaries,
  resolveBusinessTerm,
} from '../lib/businessTerms';

const SRC = path.resolve(__dirname, '..');
const CONTRACT_FILES = [
  'forms/EmploymentContractTemplate.tsx',
  'pages/EmploymentContract.tsx',
];

/** كل رمز أضافته هذه الحزمة ويجب ألا يظهر في مسار عقد العمل. */
const PACK_SYMBOLS = [
  'useBusinessTerms',
  'resolveBusinessTerm',
  'businessTerms',
  'lib/businessTerms',
  'BUSINESS_TERM',
  'certificatePurpose',
  'dict.forms.',
];

describe('عقد العمل — لا تكامل مع آلية الترجمة الجديدة', () => {
  it.each(CONTRACT_FILES)('%s لا يشير إلى أي رمز من رموز الحزمة', (rel) => {
    const src = fs.readFileSync(path.join(SRC, rel), 'utf8');
    for (const symbol of PACK_SYMBOLS) {
      expect(src, `${rel} يجب ألا يحتوي ${symbol}`).not.toContain(symbol);
    }
  });

  it('قالب العقد ما زال يستخدم مساعداته الأصلية دون تغيير', () => {
    const src = fs.readFileSync(path.join(SRC, 'forms/EmploymentContractTemplate.tsx'), 'utf8');
    expect(src).toContain("import { getNationalityEn, getJobTitleEn } from './shared/contractTranslations'");
    expect(src).toContain('emp.jobTitleEn?.trim() || getJobTitleEn(emp.jobTitle)');
    expect(src).toContain('emp.nationalityEn?.trim() || getNationalityEn(emp.nationality)');
  });

  it('مسار تصيير العقد لم يكتسب أي حقل ترجمة جديد', () => {
    const src = fs.readFileSync(path.join(SRC, 'forms/EmploymentContractTemplate.tsx'), 'utf8');
    // الحقول الإنجليزية الوحيدة المسموح بها هي القائمة أصلًا في مسودة العقد.
    const translationFields = src.match(/\bemp\.[A-Za-z]*En\b/g) ?? [];
    expect(new Set(translationFields)).toEqual(
      new Set(['emp.fullNameEn', 'emp.jobTitleEn', 'emp.nationalityEn']),
    );
  });
});

describe('عقد العمل — سلوك مساعداته لم يتغيّر', () => {
  it('السقوط الأصلي محفوظ: تجاوز ← بذرة ← القيمة العربية', () => {
    applyTranslationOverrides({}, {});
    expect(getJobTitleEn('سائق شاحنة')).toBe(BASE_JOB_TITLE_EN['سائق شاحنة']);
    expect(getNationalityEn('هندي')).toBe(BASE_NATIONALITY_EN['هندي']);
    expect(getJobTitleEn('مهنة غير معروفة')).toBe('مهنة غير معروفة');
    expect(getJobTitleEn(null)).toBe('—');

    applyTranslationOverrides({ 'هندي': 'OVERRIDDEN' }, { 'سائق شاحنة': 'OVERRIDDEN JOB' });
    expect(getNationalityEn('هندي')).toBe('OVERRIDDEN');
    expect(getJobTitleEn('سائق شاحنة')).toBe('OVERRIDDEN JOB');
    // البذرة ما زالت تعمل للمفاتيح غير المتجاوَزة.
    expect(getJobTitleEn('محاسب')).toBe(BASE_JOB_TITLE_EN['محاسب']);

    applyTranslationOverrides({}, {}); // إعادة الحالة العامة كما وجدناها
  });

  it('البذور الأصلية لعقد العمل لم تُعدَّل بواسطة هذه الحزمة', () => {
    expect(BASE_JOB_TITLE_EN['سائق شاحنة']).toBe('HEAVY DRIVER');
    expect(BASE_NATIONALITY_EN['هندي']).toBe('INDIAN');
  });
});

describe('عزل البيانات — مساحتا مفاتيح منفصلتان', () => {
  it('لا تقاطع بين مفاتيح النماذج الإدارية ومفاتيح عقد العمل', () => {
    const formKeys = BUSINESS_TERM_CATEGORIES.map((c) => BUSINESS_TERM_SETTING_KEYS[c]);
    for (const contractKey of EMPLOYMENT_CONTRACT_SETTING_KEYS) {
      expect(formKeys).not.toContain(contractKey);
    }
  });

  it('وحدة النماذج الإدارية لا تستورد وحدة عقد العمل إطلاقًا', () => {
    const src = fs.readFileSync(path.join(SRC, 'lib/businessTerms.ts'), 'utf8');
    // لا استيراد فعلي (الذكر في التعليقات التوثيقية مسموح ومقصود).
    expect(src).not.toMatch(/^\s*import[\s\S]*?from\s+'[^']*contractTranslations'/m);
    expect(src).not.toContain('BASE_JOB_TITLE_EN');
    expect(src).not.toContain('BASE_NATIONALITY_EN');
  });

  it('بذور المجموعتين مستقلتان — تغيير إحداهما لا يعني الأخرى', () => {
    const forms = defaultBusinessTermDictionaries();
    expect(forms.jobTitle['سائق شاحنة']).toBe('Truck Driver');
    expect(BASE_JOB_TITLE_EN['سائق شاحنة']).toBe('HEAVY DRIVER');
    expect(forms.jobTitle).not.toBe(BASE_JOB_TITLE_EN);
    expect(forms.nationality).not.toBe(BASE_NATIONALITY_EN);
  });
});

describe('عزل ثنائي الاتجاه — تعديل أحد القاموسين لا يمسّ الآخر', () => {
  it('اتجاه ١: تعديل قواميس النماذج الإدارية لا يغيّر ما يطبعه عقد العمل', () => {
    applyTranslationOverrides({}, {}); // حالة العقد الافتراضية
    const contractJobBefore = getJobTitleEn('سائق شاحنة');
    const contractNatBefore = getNationalityEn('هندي');

    // «المستخدم» يحرّر كل قواميس النماذج الإدارية بقيم صادمة.
    const formRows = BUSINESS_TERM_CATEGORIES.map((c) => ({
      key: BUSINESS_TERM_SETTING_KEYS[c],
      value: JSON.stringify({ 'سائق شاحنة': 'FORMS ONLY JOB', 'هندي': 'FORMS ONLY NAT' }),
    }));
    const dicts = parseBusinessTermDictionaries(formRows);
    expect(resolveBusinessTerm(dicts, 'jobTitle', 'سائق شاحنة', 'en')).toBe('FORMS ONLY JOB');

    // العقد لم يتحرك.
    expect(getJobTitleEn('سائق شاحنة')).toBe(contractJobBefore);
    expect(getNationalityEn('هندي')).toBe(contractNatBefore);
    expect(getJobTitleEn('سائق شاحنة')).toBe('HEAVY DRIVER');
    expect(getNationalityEn('هندي')).toBe('INDIAN');
  });

  it('اتجاه ٢: تعديل قاموس عقد العمل لا يغيّر ما تعرضه النماذج الإدارية', () => {
    // «المستخدم» يحرّر قاموس العقد بقيم صادمة.
    applyTranslationOverrides({ 'هندي': 'CONTRACT ONLY NAT' }, { 'سائق شاحنة': 'CONTRACT ONLY JOB' });
    expect(getJobTitleEn('سائق شاحنة')).toBe('CONTRACT ONLY JOB');

    // نفس الإعدادات المخزَّنة تصل إلى النماذج الإدارية: مفاتيح العقد مُهمَلة تمامًا.
    const dicts = parseBusinessTermDictionaries([
      { key: 'dict.nationalities', value: JSON.stringify({ 'هندي': 'CONTRACT ONLY NAT' }) },
      { key: 'dict.jobTitles', value: JSON.stringify({ 'سائق شاحنة': 'CONTRACT ONLY JOB' }) },
    ]);
    expect(resolveBusinessTerm(dicts, 'jobTitle', 'سائق شاحنة', 'en')).toBe('Truck Driver');
    expect(resolveBusinessTerm(dicts, 'nationality', 'هندي', 'en')).toBe('Indian');
    expect(dicts).toEqual(defaultBusinessTermDictionaries());

    applyTranslationOverrides({}, {}); // إعادة الحالة العامة كما وجدناها
  });
});
