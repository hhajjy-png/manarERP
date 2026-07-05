// Per-entity business warning rules (Smart Import Validation Phase 1).
// Pure functions: (normalized, raw, now) → ImportWarning[]. No side effects, no DB,
// no dependency on bankStatementImport.

import { ENUMS } from '../../../config/constants';
import { formatCurrency } from '../../../shared/utils/currency';
import type { ImportWarning } from '../import.types';
import { asDate, daysUntil, rawField, strOf, warn, SOON_DAYS } from './helpers';

type Row = Record<string, unknown>;

const EMPLOYEE_STATUS = ENUMS.employeeStatus as readonly string[];

// Conservative payroll base-salary band (KWD). Deliberately wide to avoid false positives.
const BASE_SALARY_LOW = 30;
const BASE_SALARY_HIGH = 10_000;
// Conservative employee monthly-salary band (KWD).
const EMP_SALARY_HIGH = 10_000;
// Expense "unusually high" threshold (KWD) — conservative to avoid noise.
const EXPENSE_HIGH = 50_000;
const MIN_AGE_YEARS = 16;
const MAX_AGE_YEARS = 100;
// Dates further than this many days into the past/future are flagged as "far off".
const FAR_OFF_DAYS = 730; // ~2 years

/** Whole years between `from` and `to` (floor). */
function yearsBetween(from: Date, to: Date): number {
  return Math.floor((to.getTime() - from.getTime()) / (365.25 * 86_400_000));
}

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

  // ── Phase 2A cross-field ──
  const birth = asDate(n.birthDate);
  if (birth) {
    if (birth.getTime() > now.getTime()) {
      w.push(warn('FUTURE_DATE', 'warning',
        'تاريخ الميلاد في المستقبل',
        'Birth date is in the future',
        { field: 'birthDate' }));
    } else {
      const age = yearsBetween(birth, now);
      if (age < MIN_AGE_YEARS) {
        w.push(warn('AGE_TOO_LOW', 'warning',
          `العمر المحسوب (${age} سنة) أقل من ${MIN_AGE_YEARS}`,
          `Computed age (${age}) is under ${MIN_AGE_YEARS}`,
          { field: 'birthDate', suggestedFix: 'تحقّق من تاريخ الميلاد' }));
      } else if (age > MAX_AGE_YEARS) {
        w.push(warn('AGE_OUT_OF_RANGE', 'info',
          `العمر المحسوب (${age} سنة) غير معتاد`,
          `Computed age (${age}) is unusually high`,
          { field: 'birthDate' }));
      }
    }
  }
  // residency expiring before passport — suspicious (info), NOT invalid
  if (p && r && r.getTime() < p.getTime()) {
    w.push(warn('DATE_ORDER_SUSPICIOUS', 'info',
      'انتهاء الإقامة قبل انتهاء الجواز — تحقّق من التواريخ',
      'Residency expiry precedes passport expiry — verify the dates',
      { field: 'residencyExpiry' }));
  }
  // salary present but zero
  if (n.salary !== undefined && n.salary !== null && Number(n.salary) === 0) {
    w.push(warn('AMOUNT_ZERO_SUSPICIOUS', 'warning',
      'الراتب الشهري يساوي صفر',
      'Monthly salary is zero',
      { field: 'salary' }));
  } else if (Number(n.salary) > EMP_SALARY_HIGH) {
    w.push(warn('VALUE_OUT_OF_RANGE', 'info',
      `الراتب الشهري (${Number(n.salary)}) خارج النطاق المعتاد`,
      `Monthly salary (${Number(n.salary)}) is outside the usual range`,
      { field: 'salary' }));
  }

  return w;
}

export function equipmentWarnings(n: Row, _raw: Row, now: Date): ImportWarning[] {
  const w: ImportWarning[] = [];
  w.push(...expiryWarnings('registrationExpiry', 'دفتر المركبة', asDate(n.registrationExpiry), now));

  const year = n.manufactureYear != null ? Number(n.manufactureYear) : undefined;
  if (year !== undefined && Number.isFinite(year) && year > now.getFullYear() + 1) {
    w.push(warn('YEAR_INVALID', 'warning',
      `سنة الصنع (${year}) في المستقبل`,
      `Manufacture year (${year}) is in the future`,
      { field: 'manufactureYear' }));
  }
  const purchase = asDate(n.purchaseDate);
  if (purchase && year !== undefined && Number.isFinite(year) && purchase.getFullYear() < year) {
    w.push(warn('DATE_ORDER_SUSPICIOUS', 'info',
      `تاريخ الشراء (${purchase.getFullYear()}) قبل سنة الصنع (${year})`,
      `Purchase date (${purchase.getFullYear()}) precedes manufacture year (${year})`,
      { field: 'purchaseDate' }));
  }
  return w;
}

export function invoiceWarnings(n: Row, _raw: Row, now: Date): ImportWarning[] {
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
  // issueDate too far in the future
  if (issue && daysUntil(issue, now) > FAR_OFF_DAYS) {
    w.push(warn('DATE_FAR_OFF', 'warning',
      'تاريخ الفاتورة أبعد من سنتين في المستقبل',
      'Invoice date is more than two years in the future',
      { field: 'issueDate' }));
  }
  return w;
}

export function contractWarnings(n: Row, _raw: Row, now: Date): ImportWarning[] {
  const w: ImportWarning[] = [];
  if (n.price === undefined || n.price === null) {
    w.push(warn('MISSING_IMPORTANT_OPTIONAL', 'info',
      'سعر العقد غير محدّد',
      'Contract price is missing',
      { field: 'price' }));
  } else if (Number(n.price) === 0) {
    w.push(warn('AMOUNT_ZERO_SUSPICIOUS', 'warning',
      'سعر العقد يساوي صفر',
      'Contract price is zero',
      { field: 'price' }));
  }
  const end = asDate(n.endDate);
  if (end) {
    const days = daysUntil(end, now);
    if (days < 0) {
      w.push(warn('DATE_EXPIRED', 'danger',
        `العقد منتهٍ منذ ${Math.abs(days)} يوم`,
        `Contract expired ${Math.abs(days)} day(s) ago`,
        { field: 'endDate', suggestedFix: 'تحقّق من حالة العقد وتاريخ انتهائه' }));
    } else if (days <= SOON_DAYS) {
      w.push(warn('DATE_EXPIRING_SOON', 'warning',
        `العقد ينتهي خلال ${days} يوم`,
        `Contract ends in ${days} day(s)`,
        { field: 'endDate' }));
    }
  }
  return w;
}

export function expenseWarnings(n: Row, _raw: Row, now: Date): ImportWarning[] {
  const w: ImportWarning[] = [];
  const amount = Number(n.amount);
  if (Number.isFinite(amount) && amount > EXPENSE_HIGH) {
    w.push(warn('VALUE_OUT_OF_RANGE', 'info',
      `المبلغ (${amount}) مرتفع بشكل غير معتاد`,
      `Amount (${amount}) is unusually high`,
      { field: 'amount', suggestedFix: 'تحقّق من صحة المبلغ' }));
  }
  const date = asDate(n.date);
  if (date) {
    const days = daysUntil(date, now);
    if (days > FAR_OFF_DAYS || days < -FAR_OFF_DAYS) {
      w.push(warn('DATE_FAR_OFF', 'warning',
        'تاريخ المصروف أبعد من سنتين في الماضي/المستقبل',
        'Expense date is more than two years in the past/future',
        { field: 'date' }));
    }
  }
  return w;
}

export function payrollWarnings(n: Row, _raw: Row, _now: Date): ImportWarning[] {
  const w: ImportWarning[] = [];
  if (Number(n.netSalary) < 0) {
    w.push(warn('NET_NEGATIVE', 'warning',
      `صافي الراتب سالب (${formatCurrency(n.netSalary)})`,
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
