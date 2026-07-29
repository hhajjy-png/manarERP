/**
 * Administrative Forms English Translation Completion v1 — العقد الذي تحرسه هذه
 * الاختبارات لطبقة الحلّ المركزية (`lib/businessTerms.ts`):
 *
 *   1. العربية لا تتغيّر أبدًا: القيمة المخزَّنة تُعرض كما هي.
 *   2. الإنجليزية تستخدم المكافئ المُهيّأ في «إعدادات الشركة».
 *   3. سياسة سقوط **واحدة** عند غياب الترجمة: القيمة العربية كما هي — لا اختراع.
 *   4. السجلات القديمة (بلا المفاتيح الجديدة) تبقى صالحة وتعود إلى البذور المدمجة.
 *   5. الإعداد التالف لا يُسقط الشاشة.
 */
import { describe, it, expect } from 'vitest';
import {
  BASE_BUSINESS_TERMS,
  BUSINESS_TERM_CATEGORIES,
  BUSINESS_TERM_SETTING_KEYS,
  dictionaryEditorRows,
  defaultBusinessTermDictionaries,
  parseBusinessTermDictionaries,
  resolveBusinessTerm,
  serializeBusinessTermRows,
} from '../businessTerms';

const DICTS = parseBusinessTermDictionaries([
  { key: 'dict.forms.jobTitles', value: JSON.stringify({ 'سائق شاحنة': 'Truck Driver' }) },
  { key: 'dict.forms.departments', value: JSON.stringify({ 'السائقين': 'Drivers' }) },
  { key: 'dict.forms.nationalities', value: JSON.stringify({ 'هندي': 'INDIAN' }) },
]);

describe('resolveBusinessTerm — المسمى الوظيفي والقسم (العيب المؤكَّد)', () => {
  it('العربية: يعرض القيمة المخزَّنة كما هي', () => {
    expect(resolveBusinessTerm(DICTS, 'jobTitle', 'سائق شاحنة', 'ar')).toBe('سائق شاحنة');
    expect(resolveBusinessTerm(DICTS, 'department', 'السائقين', 'ar')).toBe('السائقين');
  });

  it('الإنجليزية: يحلّ المكافئ الإنجليزي المُهيّأ', () => {
    expect(resolveBusinessTerm(DICTS, 'jobTitle', 'سائق شاحنة', 'en')).toBe('Truck Driver');
    expect(resolveBusinessTerm(DICTS, 'department', 'السائقين', 'en')).toBe('Drivers');
  });

  it('الجنسية تتبع نفس الآلية', () => {
    expect(resolveBusinessTerm(DICTS, 'nationality', 'هندي', 'ar')).toBe('هندي');
    expect(resolveBusinessTerm(DICTS, 'nationality', 'هندي', 'en')).toBe('INDIAN');
  });

  it('المسافات الزائدة في القيمة المخزَّنة لا تمنع المطابقة', () => {
    expect(resolveBusinessTerm(DICTS, 'jobTitle', '  سائق شاحنة  ', 'en')).toBe('Truck Driver');
  });
});

describe('سياسة السقوط المركزية — غياب الترجمة الإنجليزية', () => {
  it('لا ترجمة مُهيّأة ⇒ القيمة العربية كما هي (لا اختراع ترجمة)', () => {
    expect(resolveBusinessTerm(DICTS, 'department', 'قسم لا مقابل له', 'en')).toBe('قسم لا مقابل له');
  });

  it('ترجمة فارغة/مسافات فقط تُعامل كغياب ترجمة', () => {
    const dicts = parseBusinessTermDictionaries([
      { key: 'dict.forms.departments', value: JSON.stringify({ 'الورشة': '   ' }) },
    ]);
    expect(resolveBusinessTerm(dicts, 'department', 'الورشة', 'en')).toBe('الورشة');
  });

  it('قيمة فارغة ⇒ الشرطة، وبالشرطة المخصّصة عند طلبها', () => {
    expect(resolveBusinessTerm(DICTS, 'jobTitle', null, 'en')).toBe('—');
    expect(resolveBusinessTerm(DICTS, 'jobTitle', '', 'ar')).toBe('—');
    expect(resolveBusinessTerm(DICTS, 'certificatePurpose', undefined, 'en', '')).toBe('');
  });

  it('نفس السياسة لكل الفئات — لا استثناء لفئة واحدة', () => {
    for (const category of BUSINESS_TERM_CATEGORIES) {
      expect(resolveBusinessTerm(DICTS, category, 'قيمة غير مترجمة', 'en')).toBe('قيمة غير مترجمة');
      expect(resolveBusinessTerm(DICTS, category, 'قيمة غير مترجمة', 'ar')).toBe('قيمة غير مترجمة');
    }
  });
});

describe('parseBusinessTermDictionaries — توافق خلفي مع السجلات القائمة', () => {
  it('إعدادات لا تحوي أي مفتاح قاموس ⇒ البذور المدمجة كاملة', () => {
    const dicts = parseBusinessTermDictionaries([{ key: 'finance.currencyDisplayLanguage', value: 'arabic' }]);
    expect(dicts).toEqual(defaultBusinessTermDictionaries());
    expect(resolveBusinessTerm(dicts, 'jobTitle', 'سائق شاحنة', 'en')).toBe(BASE_BUSINESS_TERMS.jobTitle['سائق شاحنة']);
  });

  it('سجل جزئي (فئتان فقط) يبقى صالحًا ولا يفقد أي إدخال', () => {
    const partial = [
      { key: 'dict.forms.nationalities', value: JSON.stringify({ 'مصري': 'EGYPTIAN', 'قيمة مخصّصة': 'CUSTOM' }) },
      { key: 'dict.forms.jobTitles', value: JSON.stringify({ 'محاسب': 'ACCOUNTANT' }) },
    ];
    const dicts = parseBusinessTermDictionaries(partial);
    expect(resolveBusinessTerm(dicts, 'nationality', 'قيمة مخصّصة', 'en')).toBe('CUSTOM');
    expect(resolveBusinessTerm(dicts, 'jobTitle', 'محاسب', 'en')).toBe('ACCOUNTANT');
    // الفئات غير الموجودة في السجل تعود لبذورها بلا خطأ.
    expect(resolveBusinessTerm(dicts, 'department', 'السائقين', 'en')).toBe('Drivers');
  });

  it('السجل القديم (قاموس عقد العمل وحده) لا يُغيّر شيئًا في النماذج الإدارية', () => {
    const legacyOnly = [
      { key: 'dict.nationalities', value: JSON.stringify({ 'هندي': 'CONTRACT ONLY' }) },
      { key: 'dict.jobTitles', value: JSON.stringify({ 'سائق شاحنة': 'CONTRACT ONLY JOB' }) },
    ];
    expect(parseBusinessTermDictionaries(legacyOnly)).toEqual(defaultBusinessTermDictionaries());
  });

  it('القاموس المحفوظ جزئيًا لا يمحو البذور المدمجة (دمج إضافي)', () => {
    const dicts = parseBusinessTermDictionaries([
      { key: 'dict.forms.nationalities', value: JSON.stringify({ 'هندي': 'INDIAN OVERRIDE' }) },
    ]);
    expect(resolveBusinessTerm(dicts, 'nationality', 'هندي', 'en')).toBe('INDIAN OVERRIDE');
    expect(resolveBusinessTerm(dicts, 'nationality', 'مصري', 'en')).toBe('Egyptian');
  });

  it('قيمة إعداد تالفة أو غير كائن ⇒ البذور، بلا استثناء', () => {
    for (const bad of ['{not json', '[]', 'null', '', '   ']) {
      const dicts = parseBusinessTermDictionaries([{ key: 'dict.forms.departments', value: bad }]);
      expect(resolveBusinessTerm(dicts, 'department', 'السائقين', 'en')).toBe('Drivers');
    }
  });

  it('كل فئة لها مفتاح Setting فريد داخل مساحة `dict.forms.*`', () => {
    const keys = BUSINESS_TERM_CATEGORIES.map((c) => BUSINESS_TERM_SETTING_KEYS[c]);
    expect(new Set(keys).size).toBe(keys.length);
    for (const key of keys) expect(key.startsWith('dict.forms.')).toBe(true);
  });
});

describe('محرّر «إعدادات الشركة» — الاستمرارية والحفظ', () => {
  const DEPT_KEY = BUSINESS_TERM_SETTING_KEYS.department;
  const DEPT_BASE = BASE_BUSINESS_TERMS.department;

  it('يعرض المحفوظ إن وُجد، وإلا البذور المدمجة', () => {
    const stored = [{ key: DEPT_KEY, value: JSON.stringify({ 'الورشة': 'Workshop' }) }];
    expect(dictionaryEditorRows(stored, DEPT_KEY, DEPT_BASE)).toEqual([{ ar: 'الورشة', en: 'Workshop' }]);
    expect(dictionaryEditorRows([], DEPT_KEY, DEPT_BASE)).toEqual(
      Object.entries(DEPT_BASE).map(([ar, en]) => ({ ar, en })),
    );
  });

  it('المحرّر يقرأ من المفتاح المُمرَّر وحده — قاموس مجموعة أخرى لا يسرّب إليه', () => {
    const contractRows = [{ key: 'dict.jobTitles', value: JSON.stringify({ 'سائق شاحنة': 'HEAVY DRIVER' }) }];
    expect(dictionaryEditorRows(contractRows, BUSINESS_TERM_SETTING_KEYS.jobTitle, BASE_BUSINESS_TERMS.jobTitle)).toEqual(
      Object.entries(BASE_BUSINESS_TERMS.jobTitle).map(([ar, en]) => ({ ar, en })),
    );
  });

  it('الحفظ يحافظ على العربي والإنجليزي معًا ويُسقط الصفوف بلا قيمة عربية', () => {
    const rows = [
      { ar: '  السائقين ', en: ' Drivers ' },
      { ar: '', en: 'Orphan' },
      { ar: 'الورشة', en: '' },
    ];
    const map = serializeBusinessTermRows(rows);
    expect(map).toEqual({ 'السائقين': 'Drivers', 'الورشة': '' });
    // دورة كاملة: حفظ ← إعادة قراءة ← حلّ.
    const dicts = parseBusinessTermDictionaries([
      { key: 'dict.forms.departments', value: JSON.stringify(map) },
    ]);
    expect(resolveBusinessTerm(dicts, 'department', 'السائقين', 'en')).toBe('Drivers');
    // إدخال بلا ترجمة يبقى محفوظًا ويتبع سياسة السقوط.
    expect(resolveBusinessTerm(dicts, 'department', 'الورشة', 'en')).toBe('الورشة');
  });
});
