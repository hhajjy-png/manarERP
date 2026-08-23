import { describe, it, expect } from 'vitest';
import { parseFromDate, parseToDate } from '../statements.schema';

/**
 * Filters, Dates & Loading Integrity Pack v3 — البند 2.
 *
 * كانت `parseDate` واحدة تُمرِّر `new Date('YYYY-MM-DD')` للحدّين — منتصف ليل UTC.
 * بتوقيت الكويت (UTC+03:00) كان ذلك يُسقط أول ثلاث ساعات من يوم البداية ومعظم اليوم
 * الأخير. التوأم في الوحدة المالية أُصلح سابقًا؛ هذا المسار بقي قديمًا حتى الآن.
 */

describe('حدود كشف الحساب بالتقويم المحلي', () => {
  it('`from` يبدأ من منتصف ليل اليوم المحلي', () => {
    const from = parseFromDate('2026-08-01')!;
    expect(from.getFullYear()).toBe(2026);
    expect(from.getMonth()).toBe(7);
    expect(from.getDate()).toBe(1);
    expect(from.getHours()).toBe(0);
    expect(from.getMinutes()).toBe(0);
    expect(from.getSeconds()).toBe(0);
  });

  it('`to` يمتدّ إلى آخر ميلي ثانية من اليوم المحلي', () => {
    const to = parseToDate('2026-08-31')!;
    expect(to.getDate()).toBe(31);
    expect(to.getHours()).toBe(23);
    expect(to.getMinutes()).toBe(59);
    expect(to.getSeconds()).toBe(59);
    expect(to.getMilliseconds()).toBe(999);
  });

  it('قيد في أول ساعة من يوم البداية لا يسقط (الانحدار المُصلَح)', () => {
    const from = parseFromDate('2026-08-01')!;
    const entryAt0130 = new Date(2026, 7, 1, 1, 30, 0);
    expect(entryAt0130.getTime()).toBeGreaterThanOrEqual(from.getTime());
    // السلوك القديم: منتصف ليل UTC = 03:00 محليًا، فكان القيد يسقط.
    expect(entryAt0130.getTime()).toBeLessThan(new Date('2026-08-01').getTime() + 3 * 3600_000);
  });

  it('قيد في مساء اليوم الأخير لا يسقط (الانحدار المُصلَح)', () => {
    const to = parseToDate('2026-08-31')!;
    const entryAtEvening = new Date(2026, 7, 31, 21, 45, 0);
    expect(entryAtEvening.getTime()).toBeLessThanOrEqual(to.getTime());
    // السلوك القديم: `lte` منتصف ليل UTC لليوم نفسه ⇒ يُسقط كل ما بعد 03:00 محليًا.
    expect(entryAtEvening.getTime()).toBeGreaterThan(new Date('2026-08-31').getTime());
  });

  it('يوم واحد كنطاق كامل يغطّي 24 ساعة محلية', () => {
    const from = parseFromDate('2026-08-15')!;
    const to   = parseToDate('2026-08-15')!;
    expect(to.getTime() - from.getTime()).toBe(24 * 3600_000 - 1);
  });

  it('الطوابع الزمنية الكاملة تمرّ كما هي بلا قصّ إلى حدود اليوم', () => {
    const exact = parseToDate('2026-08-15T10:20:30.000Z')!;
    expect(exact.toISOString()).toBe('2026-08-15T10:20:30.000Z');
  });

  it('القيمة الغائبة تبقى غائبة — لا حدّ مفتعل', () => {
    expect(parseFromDate(undefined)).toBeUndefined();
    expect(parseToDate(undefined)).toBeUndefined();
    expect(parseFromDate('')).toBeUndefined();
  });
});
