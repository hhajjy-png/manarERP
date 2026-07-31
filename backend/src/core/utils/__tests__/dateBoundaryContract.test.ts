import { describe, it, expect } from 'vitest';
import {
  startOfLocalDay,
  endOfLocalDay,
  localDateRange,
  endOfDay,
  toLocalDateString,
} from '../dateWindows';
import { resolvePeriod } from '../periodFilter';
import { expectLocalStartOfDay, expectLocalEndOfDay, expectLocalRange } from './localDayMatchers';

/**
 * Backend Date-Boundary Unification Pack v1 — عقد المدى الزمني القانوني.
 *
 * ── لماذا لا يوجد في هذا الملف أي لحظة مطلقة (ISO/UTC) واحدة ─────────────────
 * كل تأكيد هنا ينظر إلى **مكوّنات التقويم المحلي** فقط. اختبار يقارن بـ
 * `new Date('2026-08-01')` أو `'…T00:00:00.000Z'` يثبّت إزاحة منطقة زمنية بعينها،
 * فينجح في الكويت ويسقط في نيويورك — أو، وهو ما حدث فعلًا في الحزمة السابقة،
 * ينجح في الاثنتين لأنه لم يتحقق من **اليوم** أصلًا (تحقّق من الساعة 23 فقط).
 *
 * كونها بلا لحظات مطلقة يجعل هذا الملف صحيحًا في أي منطقة زمنية بالبناء، لا
 * بالصدفة — وهو المطلوب من «صلابة المنطقة الزمنية».
 */

const KUWAIT_TZ_NOTE = 'حدود التقويم المحلي';

describe(`${KUWAIT_TZ_NOTE} — startOfLocalDay / endOfLocalDay`, () => {
  it('يحوّل YYYY-MM-DD إلى أول لحظة في اليوم المحلي', () => {
    expectLocalStartOfDay(startOfLocalDay('2026-08-01'), '2026-08-01');
  });

  it('يحوّل YYYY-MM-DD إلى آخر لحظة في اليوم المحلي (شامل)', () => {
    expectLocalEndOfDay(endOfLocalDay('2026-08-31'), '2026-08-31');
  });

  it('يقبل نص ISO كاملًا ويأخذ جزء التاريخ منه فقط', () => {
    expectLocalStartOfDay(startOfLocalDay('2026-08-01T17:45:12.345Z'), '2026-08-01');
  });

  it('الرحلة ذهابًا وإيابًا لا تغيّر اليوم — دليل أن البناء محلي لا UTC', () => {
    for (const s of ['2026-01-01', '2026-06-15', '2026-12-31', '2024-02-29']) {
      expect(toLocalDateString(startOfLocalDay(s)!)).toBe(s);
      expect(toLocalDateString(endOfLocalDay(s)!)).toBe(s);
    }
  });

  it('اللحظة الناتجة تساوي ما يبنيه التقويم المحلي مباشرةً', () => {
    expect(startOfLocalDay('2026-08-01')!.getTime()).toBe(new Date(2026, 7, 1, 0, 0, 0, 0).getTime());
    expect(endOfLocalDay('2026-08-31')!.getTime()).toBe(new Date(2026, 7, 31, 23, 59, 59, 999).getTime());
  });

  it('القيم الغائبة/المشوّهة تُعامَل كحدّ غائب لا كتاريخ خاطئ', () => {
    for (const bad of [undefined, null, '', '   ', 'garbage', '01/08/2026', '2026-13-01', '2026-02-30', '2025-02-29']) {
      expect(startOfLocalDay(bad as string)).toBeUndefined();
      expect(endOfLocalDay(bad as string)).toBeUndefined();
    }
  });

  it('29 فبراير مقبول في سنة كبيسة فقط', () => {
    expectLocalStartOfDay(startOfLocalDay('2024-02-29'), '2024-02-29');
    expect(startOfLocalDay('2025-02-29')).toBeUndefined();
  });
});

describe(`${KUWAIT_TZ_NOTE} — localDateRange`, () => {
  it('01/08/2026 → 31/08/2026 يغطّي الشهر كاملًا وشاملًا الطرفين', () => {
    expectLocalRange(localDateRange('2026-08-01', '2026-08-31'), '2026-08-01', '2026-08-31');
  });

  it('يوم واحد (from == to) يغطّي اليوم بأكمله', () => {
    expectLocalRange(localDateRange('2026-08-02', '2026-08-02'), '2026-08-02', '2026-08-02');
  });

  it('حدّ سفلي فقط', () => {
    const r = localDateRange('2026-08-01', undefined);
    expectLocalStartOfDay(r?.gte, '2026-08-01');
    expect(r?.lte).toBeUndefined();
  });

  it('حدّ علوي فقط', () => {
    const r = localDateRange(undefined, '2026-08-31');
    expectLocalEndOfDay(r?.lte, '2026-08-31');
    expect(r?.gte).toBeUndefined();
  });

  it('بلا حدود → undefined (كل الفترات، بلا قيد زمني)', () => {
    expect(localDateRange(undefined, undefined)).toBeUndefined();
    expect(localDateRange('', '')).toBeUndefined();
  });

  it('حدود الشهر (يناير/ديسمبر) — تمهيد لمُحدِّد الشهر القادم', () => {
    expectLocalRange(localDateRange('2026-01-01', '2026-01-31'), '2026-01-01', '2026-01-31');
    expectLocalRange(localDateRange('2026-12-01', '2026-12-31'), '2026-12-01', '2026-12-31');
    expectLocalRange(localDateRange('2024-02-01', '2024-02-29'), '2024-02-01', '2024-02-29');
  });
});

/**
 * شمول الأطراف مُعبَّرًا عنه كما يعيشه السجلّ فعلًا: طابع زمني حقيقي داخل اليوم.
 * هذه هي الاختبارات التي كانت ستكشف العيب الأصلي — سجلّ عند 00:30 من أول يوم
 * كان يختفي لأن `gte` كان منتصف ليل UTC أي 03:00 محليًا في الكويت.
 */
describe(`${KUWAIT_TZ_NOTE} — شمول الأطراف لسجلّ بطابع زمني`, () => {
  const range = localDateRange('2026-08-01', '2026-08-31')!;
  const within = (d: Date) => d >= range.gte! && d <= range.lte!;

  it('أول يوم 00:00:00.000 داخل المدى', () => {
    expect(within(new Date(2026, 7, 1, 0, 0, 0, 0))).toBe(true);
  });

  it('أول يوم 00:30 (الساعات الباكرة) داخل المدى — العيب الأصلي', () => {
    expect(within(new Date(2026, 7, 1, 0, 30, 0, 0))).toBe(true);
  });

  it('أول يوم 02:59:59.999 داخل المدى — ضمن إزاحة الكويت الكاملة', () => {
    expect(within(new Date(2026, 7, 1, 2, 59, 59, 999))).toBe(true);
  });

  it('آخر يوم 23:59:59.999 داخل المدى', () => {
    expect(within(new Date(2026, 7, 31, 23, 59, 59, 999))).toBe(true);
  });

  it('آخر يوم 12:00 ظهرًا داخل المدى', () => {
    expect(within(new Date(2026, 7, 31, 12, 0, 0, 0))).toBe(true);
  });

  it('اللحظة السابقة للمدى مباشرةً خارجه', () => {
    expect(within(new Date(2026, 6, 31, 23, 59, 59, 999))).toBe(false);
  });

  it('اللحظة التالية للمدى مباشرةً خارجه', () => {
    expect(within(new Date(2026, 8, 1, 0, 0, 0, 0))).toBe(false);
  });

  it('يوم واحد: كل ساعات اليوم داخله، وجاراه خارجه', () => {
    const day = localDateRange('2026-08-02', '2026-08-02')!;
    const inDay = (d: Date) => d >= day.gte! && d <= day.lte!;
    expect(inDay(new Date(2026, 7, 2, 0, 0, 0, 0))).toBe(true);
    expect(inDay(new Date(2026, 7, 2, 13, 37, 0, 0))).toBe(true);
    expect(inDay(new Date(2026, 7, 2, 23, 59, 59, 999))).toBe(true);
    expect(inDay(new Date(2026, 7, 1, 23, 59, 59, 999))).toBe(false);
    expect(inDay(new Date(2026, 7, 3, 0, 0, 0, 0))).toBe(false);
  });
});

/**
 * صلابة المنطقة الزمنية — منطوقة كعلاقة قابلة للتنفيذ، لا كافتراض.
 *
 * لا يمكن تغيير منطقة العملية على هذا المضيف (Node على Windows يتجاهل `TZ`)،
 * لذلك تُثبِت هذه الاختبارات الخاصية التي تجعل الدالة صحيحة في **أي** إزاحة:
 * الناتج مبني من مكوّنات التقويم المحلي، لا من تفسير المحرّك لنص ISO.
 *
 * الاختبار الأخير يصوغ العيب القديم صراحةً: الأسلوب السابق
 * (`endOfDay(new Date('YYYY-MM-DD'))`) يوافق العقد الصحيح **فقط** حين تكون
 * الإزاحة المحلية صفرًا أو موجبة. على مضيف بإزاحة سالبة (نيويورك) يسقط اليوم
 * الأخير بأكمله — وهذا التأكيد سيفشل هناك إن عاد أحدهم إلى الأسلوب القديم.
 */
describe('صلابة المنطقة الزمنية', () => {
  /** موجب للإزاحات شرق غرينتش (الكويت +03:00 ⇒ 180). */
  const offsetMinutesEastOfUtc = -new Date(2026, 7, 1).getTimezoneOffset();

  it('الناتج لا يعتمد على تفسير المحرّك لنص التاريخ المجرَّد', () => {
    // `new Date('2026-08-01')` = منتصف ليل UTC. تساويها الدالة فقط عند إزاحة صفر.
    const utcMidnight = new Date('2026-08-01').getTime();
    const localMidnight = startOfLocalDay('2026-08-01')!.getTime();
    if (offsetMinutesEastOfUtc === 0) {
      expect(localMidnight).toBe(utcMidnight);
    } else {
      expect(localMidnight).not.toBe(utcMidnight);
    }
    // وفي كل الأحوال: اليوم المحلي هو المطلوب.
    expectLocalStartOfDay(startOfLocalDay('2026-08-01'), '2026-08-01');
  });

  it('العقد الصحيح يعطي اليوم المحلي الصحيح مهما كانت الإزاحة', () => {
    // صيغة مستقلة عن الإزاحة: الفارق بين طرفَي اليوم يوم كامل ناقص 1ms.
    const day = localDateRange('2026-08-02', '2026-08-02')!;
    expect(day.lte!.getTime() - day.gte!.getTime()).toBe(24 * 60 * 60 * 1000 - 1);
  });

  it('الأسلوب القديم يوافق العقد فقط عند إزاحة غير سالبة (توثيق العيب)', () => {
    const legacy = endOfDay(new Date('2026-08-31')).getTime();
    const correct = endOfLocalDay('2026-08-31')!.getTime();
    if (offsetMinutesEastOfUtc >= 0) {
      expect(legacy).toBe(correct);          // الكويت: صحيح بالصدفة
    } else {
      expect(legacy).not.toBe(correct);      // نيويورك: يسقط اليوم الأخير
    }
  });
});

describe('resolvePeriod يشترك في نفس العقد', () => {
  it('يطابق localDateRange تمامًا في الحدّين', () => {
    const p = resolvePeriod({ fromDate: '2026-08-01', toDate: '2026-08-31' });
    const r = localDateRange('2026-08-01', '2026-08-31')!;
    expect(p.hasRange).toBe(true);
    expect(p.flow?.gte?.getTime()).toBe(r.gte!.getTime());
    expect(p.flow?.lte?.getTime()).toBe(r.lte!.getTime());
    // asOf = نهاية المدى (تقارير «كما في تاريخ»).
    expect(p.asOf?.getTime()).toBe(r.lte!.getTime());
  });

  it('بلا حدود → hasRange=false (كل الفترات) — سلوك غير متغيّر', () => {
    expect(resolvePeriod(undefined).hasRange).toBe(false);
    expect(resolvePeriod({}).hasRange).toBe(false);
  });

  it('حدّ واحد مدعوم كما كان', () => {
    expect(resolvePeriod({ fromDate: '2026-08-01' }).hasRange).toBe(true);
    expect(resolvePeriod({ toDate: '2026-08-31' }).hasRange).toBe(true);
  });
});
