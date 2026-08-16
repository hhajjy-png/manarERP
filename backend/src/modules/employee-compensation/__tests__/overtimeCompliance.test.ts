/**
 * اختبارات محرّك الالتزام القانوني للعمل الإضافي (السجل اليومي).
 *
 * كلها على دوال **خالصة** بلا قاعدة بيانات ولا خادم: ما يُختبر هنا هو القاعدة القانونية
 * نفسها لا توصيلها. أي تغيير يخفّف حدًّا أو يخلط نوعًا بآخر يُسقط اختبارًا باسمه.
 */
import { describe, it, expect } from 'vitest';
import {
  allocateAmountAcrossDays,
  deriveOvertimeLinesFromDays,
  evaluateOvertimeCompliance,
  isValidIsoDate,
  validateOvertimeDays,
  weekStartOf,
  OVERTIME_LIMITS,
  type OvertimeDayInput,
} from '../engine';

/** مختصر لبناء يوم. */
const d = (date: string, hours: number, overtimeType: OvertimeDayInput['overtimeType'] = 'REGULAR') =>
  ({ date, overtimeType, hours });

const codes = (findings: readonly { code: string }[]) => findings.map((f) => f.code);

// أغسطس ٢٠٢٦: ٠٢/٠٨ أحد (بداية أسبوع عمل)، ٠٦/٠٨ خميس، ٠٧/٠٨ جمعة، ٠٩/٠٨ أحد.

describe('§52 — القواعد اليومية', () => {
  it('ساعة واحدة إضافي عادي: مطابقة', () => {
    const r = evaluateOvertimeCompliance({ monthDays: [d('2026-08-03', 1)] });
    expect(r.compliant).toBe(true);
    expect(r.regular.monthHours).toBe(1);
    expect(r.regular.monthDays).toBe(1);
  });

  it('ساعتان إضافي عادي — الحد بالضبط: مطابقة', () => {
    const r = evaluateOvertimeCompliance({ monthDays: [d('2026-08-03', 2)] });
    expect(r.compliant).toBe(true);
    expect(codes(r.violations)).not.toContain('REGULAR_DAILY_HOURS_EXCEEDED');
  });

  it('ثلاث ساعات إضافي عادي في يوم واحد: مخالفة قانونية تمنع الاعتماد', () => {
    const r = evaluateOvertimeCompliance({ monthDays: [d('2026-08-03', 3)] });
    expect(r.compliant).toBe(false);
    const v = r.violations.find((x) => x.code === 'REGULAR_DAILY_HOURS_EXCEEDED');
    expect(v).toBeDefined();
    expect(v?.basis).toBe('STATUTORY');
    expect(v?.limit).toBe(2);
    expect(v?.actual).toBe(3);
    expect(v?.date).toBe('2026-08-03');
  });

  it('يرفض تاريخًا مكرَّرًا بنفس النوع (المتطلب ٢٥)', () => {
    const errs = validateOvertimeDays([d('2026-08-03', 2), d('2026-08-03', 1)], 2026, 8);
    expect(codes(errs)).toContain('DUPLICATE_DAY_TYPE');
  });

  /**
   * تغيّر مقصود عن النسخة الأولى من هذه الحزمة: كانت تسمح بنوعين في اليوم نفسه.
   * ذلك كان يفتح باب **صرف مزدوج** لساعات اليوم الواحد بمعاملين مختلفين.
   */
  it('يرفض تصنيف اليوم الواحد بنوعين (تناقض منطقي)', () => {
    const errs = validateOvertimeDays(
      [d('2026-08-03', 2), d('2026-08-03', 4, 'OFFICIAL_HOLIDAY')],
      2026,
      8,
    );
    expect(codes(errs)).toContain('SAME_DAY_TYPE_CONFLICT');
    expect(errs.find((e) => e.code === 'SAME_DAY_TYPE_CONFLICT')?.legalAmbiguity).toBeUndefined();
  });

  it('عطلة رسمية + راحة أسبوعية في اليوم نفسه: يُرفض ويُوسم غموضًا قانونيًا', () => {
    const errs = validateOvertimeDays(
      [d('2026-08-07', 6, 'WEEKLY_REST'), d('2026-08-07', 6, 'OFFICIAL_HOLIDAY')],
      2026,
      8,
    );
    const conflict = errs.find((e) => e.code === 'SAME_DAY_TYPE_CONFLICT');
    expect(conflict).toBeDefined();
    // لا يُفترض ترجيح ولا جمع معاملين — تُعرض المسألة بوصفها قرارًا يحتاج مالك المنتج.
    expect(conflict?.legalAmbiguity).toBe(true);
    expect(conflict?.messageAr).toContain('لم يحسمها النصّ');
  });

  it('يوم بصفر ساعات لا يُنشئ تعارض تصنيف وهميًا', () => {
    const errs = validateOvertimeDays(
      [d('2026-08-03', 2), d('2026-08-03', 0, 'OFFICIAL_HOLIDAY')],
      2026,
      8,
    );
    expect(codes(errs)).not.toContain('SAME_DAY_TYPE_CONFLICT');
  });

  it('أنواع مختلفة في تواريخ مختلفة تمرّ بلا اعتراض', () => {
    const errs = validateOvertimeDays(
      [d('2026-08-03', 2), d('2026-08-07', 6, 'WEEKLY_REST'), d('2026-08-10', 4, 'OFFICIAL_HOLIDAY')],
      2026,
      8,
    );
    expect(errs).toEqual([]);
  });

  it('يرفض تاريخًا خارج شهر الحسبة (المتطلب ٢٦)', () => {
    expect(codes(validateOvertimeDays([d('2026-07-31', 2)], 2026, 8))).toContain('DATE_OUTSIDE_MONTH');
    expect(codes(validateOvertimeDays([d('2026-09-01', 2)], 2026, 8))).toContain('DATE_OUTSIDE_MONTH');
    expect(validateOvertimeDays([d('2026-08-31', 2)], 2026, 8)).toEqual([]);
  });

  it('يرفض تاريخًا تقويميًا غير موجود بدل أن يُدحرجه', () => {
    expect(isValidIsoDate('2026-02-30')).toBe(false);
    expect(isValidIsoDate('2026-02-28')).toBe(true);
    expect(codes(validateOvertimeDays([d('2026-02-30', 1)], 2026, 2))).toContain('INVALID_DATE');
  });

  it('مجموع الأيام = ساعات السطر الشهري (المتطلب ٥)', () => {
    const days = [d('2026-08-03', 2), d('2026-08-05', 2), d('2026-08-06', 1), d('2026-08-10', 2)];
    const lines = deriveOvertimeLinesFromDays(days);
    expect(lines).toHaveLength(1);
    expect(lines[0].overtimeType).toBe('REGULAR');
    expect(lines[0].hours).toBe(7);
  });

  it('لا ينزلق اليوم بسبب المنطقة الزمنية: ٠٣/٠٨ يبقى ٠٣/٠٨', () => {
    const r = evaluateOvertimeCompliance({ monthDays: [d('2026-08-03', 3)] });
    expect(r.violations[0].date).toBe('2026-08-03');
    expect(r.violations[0].messageAr).toContain('03/08/2026');
  });
});

describe('§53 — القواعد الأسبوعية', () => {
  const week = ['2026-08-02', '2026-08-03', '2026-08-04', '2026-08-05'];

  it('يوم واحد في الأسبوع: مطابق', () => {
    expect(evaluateOvertimeCompliance({ monthDays: [d(week[0], 2)] }).compliant).toBe(true);
  });

  it('يومان: مطابق', () => {
    expect(
      evaluateOvertimeCompliance({ monthDays: [d(week[0], 2), d(week[1], 2)] }).compliant,
    ).toBe(true);
  });

  it('ثلاثة أيام — الحد بالضبط: مطابق', () => {
    const r = evaluateOvertimeCompliance({
      monthDays: [d(week[0], 2), d(week[1], 2), d(week[2], 2)],
    });
    expect(r.compliant).toBe(true);
  });

  it('اليوم الرابع في الأسبوع نفسه: مخالفة', () => {
    const r = evaluateOvertimeCompliance({
      monthDays: [d(week[0], 2), d(week[1], 2), d(week[2], 2), d(week[3], 2)],
    });
    expect(r.compliant).toBe(false);
    const v = r.violations.find((x) => x.code === 'REGULAR_WEEKLY_DAYS_EXCEEDED');
    expect(v?.basis).toBe('STATUTORY');
    expect(v?.actual).toBe(4);
    expect(v?.limit).toBe(3);
  });

  it('أسبوع العمل يبدأ الأحد', () => {
    expect(weekStartOf('2026-08-05')).toBe('2026-08-02'); // أربعاء → الأحد قبله
    expect(weekStartOf('2026-08-02')).toBe('2026-08-02'); // الأحد نفسه
    expect(weekStartOf('2026-08-08')).toBe('2026-08-02'); // السبت → آخر الأسبوع
    expect(weekStartOf('2026-08-09')).toBe('2026-08-09'); // الأحد التالي
  });

  it('§39 — أسبوع يعبر حدّ الشهر يُفحص كاملًا', () => {
    // ٣٠/٠٨ أحد. الأسبوع: ٣٠،٣١/٠٨ + ٠١،٠٢/٠٩ = ٤ أيام في أسبوع تقويمي واحد.
    const r = evaluateOvertimeCompliance({
      monthDays: [d('2026-08-30', 2), d('2026-08-31', 2)],
      otherDaysThisYear: [d('2026-09-01', 2), d('2026-09-02', 2)],
    });
    expect(r.compliant).toBe(false);
    expect(codes(r.violations)).toContain('REGULAR_WEEKLY_DAYS_EXCEEDED');
  });

  it('§39 — الشهران منفصلان لا يخلقان مخالفة إن كانا في أسبوعين مختلفين', () => {
    const r = evaluateOvertimeCompliance({
      monthDays: [d('2026-08-24', 2), d('2026-08-25', 2), d('2026-08-26', 2)],
      otherDaysThisYear: [d('2026-09-01', 2), d('2026-09-02', 2)],
    });
    expect(codes(r.violations)).not.toContain('REGULAR_WEEKLY_DAYS_EXCEEDED');
  });

  it('حذف يوم يزيل المخالفة الأسبوعية', () => {
    const four = [d(week[0], 2), d(week[1], 2), d(week[2], 2), d(week[3], 2)];
    expect(evaluateOvertimeCompliance({ monthDays: four }).compliant).toBe(false);
    expect(evaluateOvertimeCompliance({ monthDays: four.slice(0, 3) }).compliant).toBe(true);
  });
});

describe('§54 — العدّادات السنوية', () => {
  it('عدّاد الساعات السنوي يجمع الأشهر السابقة', () => {
    const r = evaluateOvertimeCompliance({
      monthDays: [d('2026-08-03', 2)],
      otherDaysThisYear: [d('2026-03-02', 2), d('2026-04-06', 2)],
    });
    expect(r.regular.yearHours).toBe(6);
    expect(r.regular.monthHours).toBe(2);
  });

  it('عدّاد الأيام السنوي يعدّ التواريخ الفريدة', () => {
    const r = evaluateOvertimeCompliance({
      monthDays: [d('2026-08-03', 2)],
      otherDaysThisYear: [d('2026-03-02', 2), d('2026-04-06', 2)],
    });
    expect(r.regular.yearDays).toBe(3);
  });

  it('الحد السنوي للساعات بالضبط (١٨٠): مطابق ولا يمنع الاعتماد', () => {
    const limit = OVERTIME_LIMITS.maxHoursPerYear.value;
    const r = evaluateOvertimeCompliance({
      monthDays: [d('2026-08-03', 2)],
      otherDaysThisYear: [{ date: '2026-03-02', overtimeType: 'REGULAR', hours: limit - 2 }],
    });
    expect(r.regular.yearHours).toBe(limit);
    expect(codes(r.violations)).not.toContain('REGULAR_ANNUAL_HOURS_EXCEEDED');
    expect(r.compliant).toBe(true);
  });

  it('ساعة واحدة فوق الحد السنوي: مخالفة', () => {
    const limit = OVERTIME_LIMITS.maxHoursPerYear.value;
    const r = evaluateOvertimeCompliance({
      monthDays: [d('2026-08-03', 2)],
      otherDaysThisYear: [{ date: '2026-03-02', overtimeType: 'REGULAR', hours: limit - 1 }],
    });
    expect(r.regular.yearHours).toBe(limit + 1);
    expect(codes(r.violations)).toContain('REGULAR_ANNUAL_HOURS_EXCEEDED');
  });

  it('الحد السنوي للأيام بالضبط (٩٠): مطابق', () => {
    const days = Array.from({ length: OVERTIME_LIMITS.maxDaysPerYear.value - 1 }, (_, i) => {
      const cur = new Date(Date.UTC(2026, 0, 1, 12));
      cur.setUTCDate(cur.getUTCDate() + i * 3);
      return d(cur.toISOString().slice(0, 10), 1);
    });
    const r = evaluateOvertimeCompliance({
      monthDays: [d('2026-12-28', 1)],
      otherDaysThisYear: days,
    });
    expect(r.regular.yearDays).toBe(OVERTIME_LIMITS.maxDaysPerYear.value);
    expect(codes(r.violations)).not.toContain('REGULAR_ANNUAL_DAYS_EXCEEDED');
  });

  it('السنة التالية تصفّر العدّادات السنوية', () => {
    const r = evaluateOvertimeCompliance({
      monthDays: [d('2027-01-04', 2)],
      otherDaysThisYear: [],
      adjacentYearDays: [{ date: '2026-12-30', overtimeType: 'REGULAR', hours: 178 }],
    });
    expect(r.regular.yearHours).toBe(2);
    expect(r.regular.yearDays).toBe(1);
    expect(r.compliant).toBe(true);
  });

  it('تجاوز الحد السنوي للساعات يمنع الاعتماد', () => {
    const r = evaluateOvertimeCompliance({
      monthDays: [d('2026-08-03', 2)],
      otherDaysThisYear: [{ date: '2026-03-02', overtimeType: 'REGULAR', hours: 179 }],
    });
    expect(r.compliant).toBe(false);
    const v = r.violations.find((x) => x.code === 'REGULAR_ANNUAL_HOURS_EXCEEDED');
    expect(v?.basis).toBe('STATUTORY');
    expect(v?.actual).toBe(181);
  });

  it('تجاوز الحد السنوي للأيام (٩٠) يمنع الاعتماد', () => {
    const many = Array.from({ length: 90 }, (_, i) => {
      const cur = new Date(Date.UTC(2026, 0, 1, 12));
      cur.setUTCDate(cur.getUTCDate() + i * 3);
      return d(cur.toISOString().slice(0, 10), 1);
    });
    const r = evaluateOvertimeCompliance({
      monthDays: [d('2026-12-28', 1)],
      otherDaysThisYear: many,
    });
    expect(r.regular.yearDays).toBe(91);
    expect(codes(r.violations)).toContain('REGULAR_ANNUAL_DAYS_EXCEEDED');
  });

  it('تنبيه الاقتراب من الحد إداري لا قانوني', () => {
    const r = evaluateOvertimeCompliance({
      monthDays: [d('2026-08-03', 2)],
      otherDaysThisYear: [{ date: '2026-03-02', overtimeType: 'REGULAR', hours: 145 }],
    });
    const w = r.warnings.find((x) => x.code === 'REGULAR_ANNUAL_HOURS_NEAR_LIMIT');
    expect(w?.basis).toBe('ADVISORY');
    expect(r.compliant).toBe(true);
  });

  it('§40 — عدّاد السنة لا يشمل السنة المجاورة', () => {
    const r = evaluateOvertimeCompliance({
      monthDays: [d('2026-01-04', 2)],
      otherDaysThisYear: [],
      adjacentYearDays: [{ date: '2025-12-29', overtimeType: 'REGULAR', hours: 100 }],
    });
    expect(r.regular.yearHours).toBe(2);
  });

  it('§40 — أسبوع يعبر رأس السنة يُفحص رغم انفصال العدّادات', () => {
    // ٢٨/١٢/٢٠٢٥ أحد → الأسبوع يمتدّ إلى ٠٣/٠١/٢٠٢٦.
    const r = evaluateOvertimeCompliance({
      monthDays: [d('2026-01-01', 2), d('2026-01-02', 2)],
      otherDaysThisYear: [],
      adjacentYearDays: [d('2025-12-29', 2), d('2025-12-30', 2)],
    });
    expect(codes(r.violations)).toContain('REGULAR_WEEKLY_DAYS_EXCEEDED');
    expect(r.regular.yearHours).toBe(4); // العدّاد السنوي يبقى ٢٠٢٦ وحدها
  });
});

/**
 * سنة تخلط أشهرًا مجمّعة (بلا تواريخ) بأشهر السجل اليومي.
 *
 * هذه أخطر حالة في الحزمة: ساعات الأشهر القديمة **معلومة** ولا يجوز أن تسقط من
 * العدّاد السنوي، بينما أيامها **مجهولة** ولا يجوز أن يُدَّعى التحقّق من حدودها.
 */
describe('سنة مختلطة — أشهر مجمّعة + أشهر مؤرَّخة', () => {
  it('ساعات الأشهر المجمّعة تدخل العدّاد السنوي ولا تختفي', () => {
    const r = evaluateOvertimeCompliance({
      monthDays: [d('2026-08-03', 2)],
      legacyAggregate: { regularHours: 100, months: [1, 2, 3] },
    });
    expect(r.regular.yearHours).toBe(102);
    expect(r.regular.yearHoursFromLegacy).toBe(100);
  });

  it('تجاوز الحد السنوي يُكتشف حتى لو جاء أغلبه من أشهر مجمّعة', () => {
    const r = evaluateOvertimeCompliance({
      monthDays: [d('2026-08-03', 2)],
      legacyAggregate: { regularHours: 179, months: [3] },
    });
    // ١٧٩ + ٢ = ١٨١ > ١٨٠ — لولا احتساب القديم لظهر «٢ من ١٨٠» ومرّ الاعتماد.
    expect(r.regular.yearHours).toBe(181);
    expect(codes(r.violations)).toContain('REGULAR_ANNUAL_HOURS_EXCEEDED');
    expect(r.compliant).toBe(false);
  });

  it('وجود أشهر مجمّعة يخفض درجة التحقّق إلى PARTIAL', () => {
    const r = evaluateOvertimeCompliance({
      monthDays: [d('2026-08-03', 2)],
      legacyAggregate: { regularHours: 40, months: [5, 6] },
    });
    expect(r.verification).toBe('PARTIAL');
    expect(r.legacyMonths).toEqual([5, 6]);
    expect(codes(r.warnings)).toContain('LEGACY_MONTHS_LIMIT_VERIFICATION_INCOMPLETE');
  });

  it('الإفصاح يسمّي الأشهر ويفرّق بين المفحوص وغير المفحوص', () => {
    const r = evaluateOvertimeCompliance({
      monthDays: [d('2026-08-03', 2)],
      legacyAggregate: { regularHours: 40, months: [5] },
    });
    const w = r.warnings.find((x) => x.code === 'LEGACY_MONTHS_LIMIT_VERIFICATION_INCOMPLETE');
    expect(w?.basis).toBe('DISCLOSURE');
    expect(w?.messageAr).toContain('مايو');
    expect(w?.messageAr).toContain('90');
  });

  it('أيام السنة تبقى من التواريخ وحدها — لا تُقدَّر عن الأشهر المجمّعة', () => {
    const r = evaluateOvertimeCompliance({
      monthDays: [d('2026-08-03', 2), d('2026-08-05', 2)],
      legacyAggregate: { regularHours: 120, months: [1, 2, 3, 4] },
    });
    expect(r.regular.yearDays).toBe(2);
  });

  it('سنة مؤرَّخة بالكامل تبقى FULL بلا إفصاح نقص', () => {
    const r = evaluateOvertimeCompliance({
      monthDays: [d('2026-08-03', 2)],
      otherDaysThisYear: [d('2026-03-02', 2)],
    });
    expect(r.verification).toBe('FULL');
    expect(r.legacyMonths).toEqual([]);
    expect(codes(r.warnings)).not.toContain('LEGACY_MONTHS_LIMIT_VERIFICATION_INCOMPLETE');
    expect(r.regular.yearHoursFromLegacy).toBe(0);
  });

  it('المخالفة المؤكَّدة من الأيام المؤرَّخة تبقى مانعة رغم PARTIAL', () => {
    const r = evaluateOvertimeCompliance({
      monthDays: [d('2026-08-03', 3)],
      legacyAggregate: { regularHours: 10, months: [2] },
    });
    expect(r.verification).toBe('PARTIAL');
    expect(codes(r.violations)).toContain('REGULAR_DAILY_HOURS_EXCEEDED');
    expect(r.compliant).toBe(false);
  });

  it('شهر مجمّع بصفر ساعات لا يخفض درجة التحقّق', () => {
    const r = evaluateOvertimeCompliance({
      monthDays: [d('2026-08-03', 2)],
      legacyAggregate: { regularHours: 0, months: [] },
    });
    expect(r.verification).toBe('FULL');
  });
});

describe('§55 — الفصل القانوني بين الأنواع', () => {
  it('WEEKLY_REST لا يدخل عدّادات المادة ٦٦ إطلاقًا', () => {
    const r = evaluateOvertimeCompliance({
      monthDays: [d('2026-08-09', 8, 'WEEKLY_REST'), d('2026-08-16', 7, 'WEEKLY_REST')],
    });
    expect(r.regular.monthHours).toBe(0);
    expect(r.regular.monthDays).toBe(0);
    expect(r.regular.yearHours).toBe(0);
    expect(r.weeklyRest.hours).toBe(15);
    expect(r.weeklyRest.days).toBe(2);
    // ٨ ساعات في يوم راحة ليست تجاوزًا لحدّ الساعتين — ذلك الحدّ يحكم المادة ٦٦ وحدها.
    expect(codes(r.violations)).not.toContain('REGULAR_DAILY_HOURS_EXCEEDED');
  });

  it('OFFICIAL_HOLIDAY لا يدخل عدّادات المادة ٦٦', () => {
    const r = evaluateOvertimeCompliance({
      monthDays: [d('2026-08-04', 6, 'OFFICIAL_HOLIDAY')],
    });
    expect(r.regular.monthHours).toBe(0);
    expect(r.officialHoliday.hours).toBe(6);
    expect(r.officialHoliday.days).toBe(1);
    expect(r.compliant).toBe(true);
  });

  it('الأنواع الثلاثة لا تُجمع في عدّاد واحد', () => {
    const r = evaluateOvertimeCompliance({
      monthDays: [
        d('2026-08-03', 2),
        d('2026-08-09', 8, 'WEEKLY_REST'),
        d('2026-08-04', 6, 'OFFICIAL_HOLIDAY'),
      ],
    });
    expect(r.regular.monthHours).toBe(2);
    expect(r.weeklyRest.hours).toBe(8);
    expect(r.officialHoliday.hours).toBe(6);
    expect(r.compliant).toBe(true);
  });

  it('السطور المشتقّة تفصل الأنواع ولا تدمجها', () => {
    const lines = deriveOvertimeLinesFromDays([
      d('2026-08-03', 2),
      d('2026-08-05', 2),
      d('2026-08-09', 8, 'WEEKLY_REST'),
    ]);
    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatchObject({ overtimeType: 'REGULAR', hours: 4 });
    expect(lines[1]).toMatchObject({ overtimeType: 'WEEKLY_REST', hours: 8 });
  });
});

describe('ساعات اليوم عبر الأنواع — إفصاح لا منع', () => {
  it('يوم مجموعه أكثر من ٨ ساعات: إفصاح بالمادة ٦٤ لا مخالفة', () => {
    const r = evaluateOvertimeCompliance({ monthDays: [d('2026-08-09', 10, 'WEEKLY_REST')] });
    const w = r.warnings.find((x) => x.code === 'DAY_TOTAL_EXCEEDS_STANDARD_DAY');
    expect(w?.basis).toBe('DISCLOSURE');
    expect(r.compliant).toBe(true);
  });

  it('يوم مستحيل حسابيًا (>٢٤ ساعة): يُمنع', () => {
    const r = evaluateOvertimeCompliance({
      monthDays: [d('2026-08-09', 20, 'WEEKLY_REST'), d('2026-08-09', 6, 'OFFICIAL_HOLIDAY')],
    });
    expect(r.compliant).toBe(false);
    expect(codes(r.violations)).toContain('DAY_TOTAL_HOURS_IMPOSSIBLE');
  });

  it('يُفصح دائمًا أن ساعات الأسبوع الكلية غير معلومة للوحدة', () => {
    const r = evaluateOvertimeCompliance({ monthDays: [d('2026-08-03', 1)] });
    const w = r.warnings.find((x) => x.code === 'WEEKLY_TOTAL_WORKING_HOURS_UNKNOWN');
    expect(w?.basis).toBe('DISCLOSURE');
  });
});

describe('§56 — يوم الراحة التعويضي', () => {
  it('يوم راحة أسبوعية يُنشئ استحقاقًا معلّقًا', () => {
    const r = evaluateOvertimeCompliance({ monthDays: [d('2026-08-09', 8, 'WEEKLY_REST')] });
    expect(r.weeklyRest.compensatoryPending).toBe(1);
    expect(codes(r.warnings)).toContain('COMPENSATORY_REST_PENDING');
  });

  it('الاستحقاق المأخوذ لا يُعدّ معلّقًا', () => {
    const r = evaluateOvertimeCompliance({
      monthDays: [d('2026-08-09', 8, 'WEEKLY_REST')],
      compensatoryPendingWeeklyRest: 0,
    });
    expect(r.weeklyRest.compensatoryPending).toBe(0);
  });

  it('العطلة الرسمية تُنشئ استحقاقًا مستقلًّا عن الراحة الأسبوعية', () => {
    const r = evaluateOvertimeCompliance({
      monthDays: [d('2026-08-04', 6, 'OFFICIAL_HOLIDAY')],
    });
    expect(r.officialHoliday.compensatoryPending).toBe(1);
    expect(r.weeklyRest.compensatoryPending).toBe(0);
  });

  it('العمل الإضافي العادي لا يُنشئ استحقاق راحة تعويضية', () => {
    const r = evaluateOvertimeCompliance({ monthDays: [d('2026-08-03', 2)] });
    expect(codes(r.warnings)).not.toContain('COMPENSATORY_REST_PENDING');
    const errs = validateOvertimeDays(
      [{ ...d('2026-08-03', 2), compensatoryRestStatus: 'PENDING' }],
      2026,
      8,
    );
    expect(codes(errs)).toContain('COMPENSATORY_ON_REGULAR');
  });

  it('حذف يوم العمل يُسقط استحقاقه بلا أثر متبقٍّ', () => {
    const r = evaluateOvertimeCompliance({ monthDays: [] });
    expect(r.weeklyRest.compensatoryPending).toBe(0);
    expect(r.officialHoliday.compensatoryPending).toBe(0);
  });
});

describe('§57/§20 — الحسبة العكسية لا تولّد تواريخ', () => {
  it('الأيام وحدها تحدّد الساعات — بيانات الحسبة العكسية تُحفظ للتدقيق فقط', () => {
    const lines = deriveOvertimeLinesFromDays(
      [d('2026-08-03', 2), d('2026-08-05', 2)],
      [
        {
          overtimeType: 'REGULAR',
          hours: 13, // اقتراح الحسبة العكسية
          calculationMethod: 'REVERSE_FROM_AMOUNT',
          reverseTargetAmount: 50,
          rawHoursBeforeCeiling: 12.5,
        },
      ],
    );
    // الساعات المعتمدة = مجموع الأيام المختارة فعلًا (٤)، لا اقتراح الحسبة العكسية (١٣).
    expect(lines[0].hours).toBe(4);
    expect(lines[0].calculationMethod).toBe('REVERSE_FROM_AMOUNT');
    expect(lines[0].reverseTargetAmount).toBe(50);
  });

  it('بلا أيام لا تُشتقّ سطور — لا اختراع تواريخ', () => {
    expect(deriveOvertimeLinesFromDays([])).toEqual([]);
  });
});

describe('§58 — توافق الأشهر القديمة', () => {
  it('شهر بلا أيام: hasDailyDetail = false ولا مخالفات يومية/أسبوعية', () => {
    const r = evaluateOvertimeCompliance({ monthDays: [] });
    expect(r.hasDailyDetail).toBe(false);
    expect(r.violations).toEqual([]);
    expect(r.compliant).toBe(true);
  });

  it('شهر قديم لا يُنتج إفصاحات يومية مضلّلة', () => {
    const r = evaluateOvertimeCompliance({ monthDays: [] });
    expect(codes(r.warnings)).not.toContain('WEEKLY_TOTAL_WORKING_HOURS_UNKNOWN');
    expect(codes(r.warnings)).not.toContain('DAY_TOTAL_EXCEEDS_STANDARD_DAY');
  });
});

describe('توزيع المبلغ على الأيام — يجمع إلى الإجمالي بالضبط', () => {
  it('يوزّع بلا فقد فلس', () => {
    const alloc = allocateAmountAcrossDays(104.0, [2, 2, 2, 1]);
    expect(alloc.reduce((s, v) => s + v, 0)).toBeCloseTo(104.0, 3);
  });

  it('يجمع بالضبط حتى مع قسمة غير منتهية', () => {
    const alloc = allocateAmountAcrossDays(100, [1, 1, 1]);
    expect(alloc.reduce((s, v) => s + v, 0)).toBeCloseTo(100, 3);
  });

  it('يتناسب مع الساعات', () => {
    const alloc = allocateAmountAcrossDays(90, [2, 1]);
    expect(alloc[0]).toBeCloseTo(60, 3);
    expect(alloc[1]).toBeCloseTo(30, 3);
  });

  it('صفر ساعات لا يقسم على صفر', () => {
    expect(allocateAmountAcrossDays(0, [0, 0])).toEqual([0, 0]);
    expect(allocateAmountAcrossDays(10, [])).toEqual([]);
  });
});

describe('§60 — سيناريو A: ١٣ يومًا × ساعتين = ٢٦ ساعة', () => {
  /** ١٣ يومًا موزَّعة ٣ أيام في الأسبوع (الحد الأقصى) بلا مخالفة. */
  const days: OvertimeDayInput[] = [
    // أسبوع ٠٢/٠٨
    d('2026-08-03', 2), d('2026-08-04', 2), d('2026-08-05', 2),
    // أسبوع ٠٩/٠٨
    d('2026-08-10', 2), d('2026-08-11', 2), d('2026-08-12', 2),
    // أسبوع ١٦/٠٨
    d('2026-08-17', 2), d('2026-08-18', 2), d('2026-08-19', 2),
    // أسبوع ٢٣/٠٨
    d('2026-08-24', 2), d('2026-08-25', 2), d('2026-08-26', 2),
    // أسبوع ٣٠/٠٨
    d('2026-08-31', 2),
  ];

  it('المجموع الشهري ٢٦ ساعة و١٣ يومًا، ومطابق قانونيًا', () => {
    const r = evaluateOvertimeCompliance({ monthDays: days });
    expect(r.regular.monthHours).toBe(26);
    expect(r.regular.monthDays).toBe(13);
    expect(r.compliant).toBe(true);
  });

  it('السطر الشهري المشتقّ يساوي مجموع الأيام', () => {
    expect(deriveOvertimeLinesFromDays(days)[0].hours).toBe(26);
  });
});
