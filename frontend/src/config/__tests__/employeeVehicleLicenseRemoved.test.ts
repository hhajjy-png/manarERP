// @vitest-environment jsdom
/**
 * Remove Employee Vehicle License Expiry v1 — إثبات اختفاء البند من واجهة الموظفين.
 *
 * الشاشات كلها مقودة بالبيانات: جدول الموظفين ونموذج الإضافة/التعديل ولوحة التفاصيل
 * وتصدير Excel تُبنى جميعًا من `MODULES.employees.columns` و`.fields` في `ResourcePage`.
 * فحص هذين المصفوفين يغطي كل تلك السطوح دفعةً واحدة، بلا رسم مكوّن.
 */
import { describe, it, expect } from 'vitest';
import { MODULES } from '../modules';
import { IMPORT_ENTITY_MAP } from '../importEntities';
import { t } from '../../lib/i18n';

const employees = MODULES.employees;

describe('صفحة الموظفين لم تعد تعرض تاريخ انتهاء رخصة المركبة', () => {
  it('لا عمود `vehicleLicenseExpiry` في جدول الموظفين (ولا في تصديره)', () => {
    expect(employees.columns.map((c) => c.key)).not.toContain('vehicleLicenseExpiry');
  });

  it('لا حقل `vehicleLicenseExpiry` في نموذج الإضافة/التعديل', () => {
    expect(employees.fields.map((f) => f.name)).not.toContain('vehicleLicenseExpiry');
  });

  it('لا أثر للبند في أي عنوان أو مفتاح ترجمة داخل إعداد الموظفين', () => {
    const blob = JSON.stringify([
      employees.columns.map((c) => [c.key, c.label]),
      employees.fields.map((f) => [f.name, f.label]),
    ]);
    expect(blob).not.toContain('vehicleLicenseExpiry');
    expect(blob).not.toContain('vehicle_license_expiry');
  });

  it('بقية وثائق الموظف لم تُمس — الإقامة والجواز ورخصة القيادة', () => {
    const fields = employees.fields.map((f) => f.name);
    expect(fields).toEqual(expect.arrayContaining(['residencyExpiry', 'passportExpiry', 'licenseExpiry']));
    const cols = employees.columns.map((c) => c.key);
    expect(cols).toEqual(expect.arrayContaining(['residencyExpiry', 'passportExpiry', 'licenseExpiry']));
  });

  it('رقم لوحة المركبة بيانات موظف فبقي — الإزالة طالت تاريخ الانتهاء وحده', () => {
    expect(employees.fields.map((f) => f.name)).toContain('vehiclePlate');
  });
});

describe('قالب استيراد الموظفين لم يعد يعرض العمود', () => {
  it('لا مفتاح `vehicleLicenseExpiry` في أعمدة قالب الموظفين', () => {
    const cols = IMPORT_ENTITY_MAP.employees.columns;
    expect(cols.map((c) => c.key)).not.toContain('vehicleLicenseExpiry');
    expect(cols.map((c) => c.labelAr).join('|')).not.toContain('رخصة المركبة');
  });

  it('أعمدة الوثائق الأخرى باقية في القالب', () => {
    const keys = IMPORT_ENTITY_MAP.employees.columns.map((c) => c.key);
    expect(keys).toEqual(expect.arrayContaining(['residencyExpiry', 'passportExpiry', 'licenseExpiry']));
  });
});

describe('مركز انتهاء الوثائق لا يعرف النوع', () => {
  // مفتاح مفقود يُرجعه `t` كما هو (`DICT[lang][key] ?? DICT.ar[key] ?? key`)،
  // فتساوي الناتج بالمفتاح هو إثبات الغياب في اللغتين معًا.
  const ORPHANS = [
    'decx.cat.employee_vehicle_license',
    'col.vehicle_license_expiry',
    'field.vehicle_license_expiry',
  ];

  it('لا مفاتيح ترجمة يتيمة للنوع المحذوف في العربية ولا الإنجليزية', () => {
    for (const key of ORPHANS) {
      expect(t(key, 'ar')).toBe(key);
      expect(t(key, 'en')).toBe(key);
    }
  });

  it('تسمية «تسجيل معدة» باقية — هي واجهة متابعة انتهاء المركبة الوحيدة', () => {
    expect(t('decx.cat.equipment_registration', 'ar')).not.toBe('decx.cat.equipment_registration');
    expect(t('decx.cat.equipment_registration', 'en')).not.toBe('decx.cat.equipment_registration');
  });
});
