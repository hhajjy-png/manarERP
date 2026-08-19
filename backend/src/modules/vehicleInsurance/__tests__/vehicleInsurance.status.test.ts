import { describe, it, expect } from 'vitest';
import {
  INSURANCE_ALERT_DAYS,
  coverageTypeAr,
  daysUntilExpiry,
  insuranceStatusOf,
  insuranceUrgency,
  todayUtcMidnight,
} from '../vehicleInsurance.status';

/**
 * تأمين المركبات — منطق حالة الوثيقة.
 *
 * ما تُثبته هذه الاختبارات تحديدًا:
 *   • وثيقة تنتهي **اليوم** ليست منتهية (المشكلة التي يفتحها طرح طابع زمني حيّ من
 *     تاريخ مخزَّن عند منتصف ليل UTC — كانت ستُحسَب «منتهية منذ يوم» بعد 00:00).
 *   • حدود النطاقات 7 / 15 / 30 شاملة (يوم 7 = نطاق السبعة، لا نطاق الخمسة عشر).
 *   • ساعة اليوم لا تغيّر النتيجة إطلاقًا — الحساب على حبيبة اليوم لا الثانية.
 */

/** تاريخ DATE-ONLY كما يخزّنه `dateOnlySchema` — منتصف ليل UTC. */
const utcDay = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d));

/** «الآن» بتوقيت محلي — الساعة متغيّرة عمدًا لإثبات عدم تأثيرها. */
const localNow = (y: number, m: number, d: number, h = 12) => new Date(y, m - 1, d, h, 34, 56, 789);

describe('todayUtcMidnight', () => {
  it('يطبّع اليوم التقويمي المحلي إلى منتصف ليل UTC', () => {
    const t = todayUtcMidnight(localNow(2026, 8, 18, 23));
    expect(t.toISOString()).toBe('2026-08-18T00:00:00.000Z');
  });

  it('لا يتأثر بساعة اليوم', () => {
    const early = todayUtcMidnight(localNow(2026, 8, 18, 0));
    const late = todayUtcMidnight(localNow(2026, 8, 18, 23));
    expect(early.getTime()).toBe(late.getTime());
  });
});

describe('daysUntilExpiry', () => {
  it('يعيد صفرًا لوثيقة تنتهي اليوم', () => {
    expect(daysUntilExpiry(utcDay(2026, 8, 18), localNow(2026, 8, 18))).toBe(0);
  });

  it('يعيد رقمًا موجبًا لوثيقة مستقبلية', () => {
    expect(daysUntilExpiry(utcDay(2026, 8, 25), localNow(2026, 8, 18))).toBe(7);
    expect(daysUntilExpiry(utcDay(2026, 9, 17), localNow(2026, 8, 18))).toBe(30);
  });

  it('يعيد رقمًا سالبًا لوثيقة منتهية', () => {
    expect(daysUntilExpiry(utcDay(2026, 8, 17), localNow(2026, 8, 18))).toBe(-1);
    expect(daysUntilExpiry(utcDay(2026, 7, 19), localNow(2026, 8, 18))).toBe(-30);
  });

  it('يتخطّى حدود الشهر والسنة بصحّة', () => {
    expect(daysUntilExpiry(utcDay(2027, 1, 1), localNow(2026, 12, 31))).toBe(1);
    expect(daysUntilExpiry(utcDay(2026, 3, 1), localNow(2026, 2, 28))).toBe(1); // 2026 ليست كبيسة
  });

  it('لا يتأثر بساعة اليوم — نفس النتيجة صباحًا ومساءً', () => {
    const end = utcDay(2026, 8, 18);
    expect(daysUntilExpiry(end, localNow(2026, 8, 18, 0))).toBe(0);
    expect(daysUntilExpiry(end, localNow(2026, 8, 18, 23))).toBe(0);
  });
});

describe('insuranceUrgency', () => {
  it('أي عدد أيام سالب = منتهية', () => {
    expect(insuranceUrgency(-1)).toBe('EXPIRED');
    expect(insuranceUrgency(-365)).toBe('EXPIRED');
  });

  it('تنتهي اليوم تدخل النطاق الحرج لا نطاق المنتهية', () => {
    expect(insuranceUrgency(0)).toBe('DUE_7');
  });

  it('حدود النطاقات شاملة', () => {
    expect(insuranceUrgency(INSURANCE_ALERT_DAYS.critical)).toBe('DUE_7');
    expect(insuranceUrgency(INSURANCE_ALERT_DAYS.critical + 1)).toBe('DUE_15');
    expect(insuranceUrgency(INSURANCE_ALERT_DAYS.warning)).toBe('DUE_15');
    expect(insuranceUrgency(INSURANCE_ALERT_DAYS.warning + 1)).toBe('DUE_30');
    expect(insuranceUrgency(INSURANCE_ALERT_DAYS.notice)).toBe('DUE_30');
    expect(insuranceUrgency(INSURANCE_ALERT_DAYS.notice + 1)).toBe('VALID');
  });

  it('الحدود المطلوبة في الحزمة هي 7 و15 و30', () => {
    expect(INSURANCE_ALERT_DAYS).toEqual({ critical: 7, warning: 15, notice: 30 });
  });
});

describe('insuranceStatusOf', () => {
  it('يطوي نطاقات التنبيه الثلاثة إلى «ينتهي قريبًا»', () => {
    expect(insuranceStatusOf('DUE_7')).toBe('EXPIRING_SOON');
    expect(insuranceStatusOf('DUE_15')).toBe('EXPIRING_SOON');
    expect(insuranceStatusOf('DUE_30')).toBe('EXPIRING_SOON');
  });

  it('يحفظ الطرفين كما هما', () => {
    expect(insuranceStatusOf('EXPIRED')).toBe('EXPIRED');
    expect(insuranceStatusOf('VALID')).toBe('VALID');
  });
});

describe('coverageTypeAr', () => {
  it('يترجم أنواع التغطية الثلاثة', () => {
    expect(coverageTypeAr('COMPREHENSIVE')).toBe('شامل');
    expect(coverageTypeAr('THIRD_PARTY')).toBe('ضد الغير');
    expect(coverageTypeAr('OTHER')).toBe('آخر');
  });

  it('يمرّر أي قيمة غير معروفة كما هي بدل إخفائها', () => {
    expect(coverageTypeAr('LEGACY_VALUE')).toBe('LEGACY_VALUE');
  });
});
