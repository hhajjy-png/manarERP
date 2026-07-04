// Per-entity business warning rules (Smart Import Validation Phase 1).
// Pure functions: (normalized, raw, now) → ImportWarning[]. No side effects, no DB,
// no dependency on bankStatementImport.

import { ENUMS } from '../../../config/constants';
import type { ImportWarning } from '../import.types';
import { asDate, daysUntil, rawField, strOf, warn, SOON_DAYS } from './helpers';

type Row = Record<string, unknown>;

const EMPLOYEE_STATUS = ENUMS.employeeStatus as readonly string[];

// Conservative payroll base-salary band (KWD). Deliberately wide to avoid false positives.
const BASE_SALARY_LOW = 30;
const BASE_SALARY_HIGH = 10_000;

/** Emits DATE_EXPIRED (danger) or DATE_EXPIRING_SOON (warning) for a single date field. */
function expiryWarnings(field: string, labelAr: string, d: Date | null, now: Date): ImportWarning[] {
  if (!d) return [];
  const days = daysUntil(d, now);
  if (days < 0) {
    return [warn('DATE_EXPIRED', 'danger',
      `${labelAr}: منتهية منذ ${Math.abs(days)} يوم`,
      `${field}: expired ${Math.abs(days)} day(s) ago`,
      { field, suggestedFix: 'حدّث تاريخ الانتهاء أو تحقّق من الوثيقة' })];
  }
  if (days <= SOON_DAYS) {
    return [warn('DATE_EXPIRING_SOON', 'warning',
      `${labelAr}: تنتهي خلال ${days} يوم`,
      `${field}: expires in ${days} day(s)`,
      { field })];
  }
  return [];
}

export function employeeWarnings(n: Row, raw: Row, now: Date): ImportWarning[] {
  const w: ImportWarning[] = [];
  const p = asDate(n.passportExpiry);
  const r = asDate(n.residencyExpiry);
  const l = asDate(n.licenseExpiry);
  const v = asDate(n.vehicleLicenseExpiry);

  // IDENTICAL_DATES — passport == residency, both present
  if (p && r && p.getTime() === r.getTime()) {
    w.push(warn('IDENTICAL_DATES', 'warning',
      'تاريخ انتهاء الجواز والإقامة متطابقان — قد يكون خطأ في ملف Excel',
      'Passport and residency expiry are identical — possible source-file error',
      { field: 'residencyExpiry', suggestedFix: 'راجع التاريخين في ملف Excel وتأكّد من استقلالهما' }));
  }

  // DATE_EXPIRED / DATE_EXPIRING_SOON for each document date
  w.push(...expiryWarnings('passportExpiry', 'الجواز', p, now));
  w.push(...expiryWarnings('residencyExpiry', 'الإقامة', r, now));
  w.push(...expiryWarnings('licenseExpiry', 'رخصة القيادة', l, now));
  w.push(...expiryWarnings('vehicleLicenseExpiry', 'رخصة المركبة', v, now));

  // ENUM_DEFAULTED — raw status provided but unknown (validator silently defaults to ACTIVE)
  const rawStatus = rawField(raw, ['status', 'حالة الموظف']);
  if (rawStatus && !EMPLOYEE_STATUS.includes(rawStatus)) {
    w.push(warn('ENUM_DEFAULTED', 'warning',
      `حالة الموظف "${rawStatus}" غير معروفة — تم اعتمادها ACTIVE`,
      `Unknown employee status "${rawStatus}" — defaulted to ACTIVE`,
      { field: 'status', suggestedFix: `استخدم إحدى: ${EMPLOYEE_STATUS.join(' / ')}` }));
  }

  // MISSING_IMPORTANT_OPTIONAL — civilId / nationality
  const missing: string[] = [];
  if (!strOf(n.civilId)) missing.push('الرقم المدني');
  if (!strOf(n.nationality)) missing.push('الجنسية');
  if (missing.length) {
    w.push(warn('MISSING_IMPORTANT_OPTIONAL', 'info',
      `حقول مهمة فارغة: ${missing.join('، ')}`,
      `Missing important optional field(s): ${missing.join(', ')}`));
  }

  return w;
}

export function equipmentWarnings(n: Row, _raw: Row, now: Date): ImportWarning[] {
  return expiryWarnings('registrationExpiry', 'دفتر المركبة', asDate(n.registrationExpiry), now);
}

export function invoiceWarnings(n: Row, _raw: Row, _now: Date): ImportWarning[] {
  const w: ImportWarning[] = [];
  const issue = asDate(n.issueDate);
  const due = asDate(n.dueDate);
  if (issue && due && due.getTime() < issue.getTime()) {
    w.push(warn('DATE_RANGE_INVALID', 'warning',
      'تاريخ الاستحقاق قبل تاريخ الفاتورة',
      'Due date is before the issue date',
      { field: 'dueDate', suggestedFix: 'تأكّد أن تاريخ الاستحقاق بعد أو يساوي تاريخ الإصدار' }));
  }
  if (Number(n.total) === 0) {
    w.push(warn('AMOUNT_ZERO_SUSPICIOUS', 'warning',
      'إجمالي الفاتورة يساوي صفر',
      'Invoice total is zero',
      { field: 'total' }));
  }
  return w;
}

export function contractWarnings(n: Row, _raw: Row, now: Date): ImportWarning[] {
  const w: ImportWarning[] = [];
  if (n.price !== undefined && n.price !== null && Number(n.price) === 0) {
    w.push(warn('AMOUNT_ZERO_SUSPICIOUS', 'warning',
      'سعر العقد يساوي صفر',
      'Contract price is zero',
      { field: 'price' }));
  }
  const end = asDate(n.endDate);
  if (end) {
    const days = daysUntil(end, now);
    if (days >= 0 && days <= SOON_DAYS) {
      w.push(warn('DATE_EXPIRING_SOON', 'warning',
        `العقد ينتهي خلال ${days} يوم`,
        `Contract ends in ${days} day(s)`,
        { field: 'endDate' }));
    }
  }
  return w;
}

export function payrollWarnings(n: Row, _raw: Row, _now: Date): ImportWarning[] {
  const w: ImportWarning[] = [];
  if (Number(n.netSalary) < 0) {
    w.push(warn('NET_NEGATIVE', 'warning',
      `صافي الراتب سالب (${Number(n.netSalary).toFixed(3)})`,
      'Computed net salary is negative',
      { field: 'netSalary', suggestedFix: 'راجع الخصومات والسلف مقابل الإجمالي' }));
  }
  const base = Number(n.baseSalary);
  if (base > 0 && (base < BASE_SALARY_LOW || base > BASE_SALARY_HIGH)) {
    w.push(warn('VALUE_OUT_OF_RANGE', 'info',
      `الراتب الأساسي (${base}) خارج النطاق المعتاد`,
      `Base salary (${base}) is outside the usual range`,
      { field: 'baseSalary', suggestedFix: 'تحقّق من صحة قيمة الراتب الأساسي' }));
  }
  return w;
}
