import { describe, it, expect } from 'vitest';
import { monthWindowsBetween, clampMonthWindows, startOfLocalDay, endOfLocalDay } from '../dateWindows';

/**
 * Filters, Dates & Loading Integrity Pack v3 — البند 3.
 *
 * تقرير الأرباح والخسائر يبني نوافذ شهرية كاملة، فنطاق جزئي مثل 15/08→31/08 كان
 * يتوسّع إلى أغسطس كاملًا: العنوان يعرض تواريخ المستخدم والحساب يغطي فترة أوسع.
 * القصّ يُبقي التقرير شهريًا ويحصر كل نافذة داخل النطاق المختار.
 */

describe('clampMonthWindows — النطاق الجزئي لا يتوسّع إلى الشهر كاملًا', () => {
  it('يقصّ بداية الشهر الأول على تاريخ البداية المختار', () => {
    const start = startOfLocalDay('2026-08-15')!;
    const end   = endOfLocalDay('2026-08-31')!;
    const [aug] = clampMonthWindows(monthWindowsBetween(start, end), start, end);

    expect(aug.label).toBe('2026-08');
    expect(aug.start.getDate()).toBe(15);          // لا 1 أغسطس
    expect(aug.start.getHours()).toBe(0);
    expect(aug.end.getDate()).toBe(31);
    expect(aug.end.getHours()).toBe(23);
  });

  it('يقصّ نهاية الشهر الأخير على تاريخ النهاية المختار', () => {
    const start = startOfLocalDay('2026-07-01')!;
    const end   = endOfLocalDay('2026-08-10')!;
    const windows = clampMonthWindows(monthWindowsBetween(start, end), start, end);

    expect(windows.map((w) => w.label)).toEqual(['2026-07', '2026-08']);
    expect(windows[1].start.getDate()).toBe(1);
    expect(windows[1].end.getDate()).toBe(10);     // لا 31 أغسطس
    expect(windows[1].end.getMilliseconds()).toBe(999);
  });

  it('الأشهر الوسطى تبقى كاملة بلا مساس', () => {
    const start = startOfLocalDay('2026-06-20')!;
    const end   = endOfLocalDay('2026-08-05')!;
    const [, july] = clampMonthWindows(monthWindowsBetween(start, end), start, end);

    expect(july.label).toBe('2026-07');
    expect(july.start.getDate()).toBe(1);
    expect(july.end.getDate()).toBe(31);
  });

  it('نطاق يغطي أشهرًا كاملة لا يتغيّر إطلاقًا', () => {
    const start = startOfLocalDay('2026-01-01')!;
    const end   = endOfLocalDay('2026-03-31')!;
    const raw     = monthWindowsBetween(start, end);
    const clamped = clampMonthWindows(raw, start, end);

    expect(clamped).toHaveLength(raw.length);
    clamped.forEach((w, i) => {
      expect(w.start.getTime()).toBe(raw[i].start.getTime());
      expect(w.end.getTime()).toBe(raw[i].end.getTime());
    });
  });

  it('نطاق داخل شهر واحد يُنتج نافذة واحدة محصورة فيه', () => {
    const start = startOfLocalDay('2026-08-10')!;
    const end   = endOfLocalDay('2026-08-12')!;
    const windows = clampMonthWindows(monthWindowsBetween(start, end), start, end);

    expect(windows).toHaveLength(1);
    expect(windows[0].start.getDate()).toBe(10);
    expect(windows[0].end.getDate()).toBe(12);
  });

  it('لا نافذة تتجاوز حدود النطاق المطلوب', () => {
    const start = startOfLocalDay('2026-02-14')!;
    const end   = endOfLocalDay('2026-05-09')!;
    for (const w of clampMonthWindows(monthWindowsBetween(start, end), start, end)) {
      expect(w.start.getTime()).toBeGreaterThanOrEqual(start.getTime());
      expect(w.end.getTime()).toBeLessThanOrEqual(end.getTime());
    }
  });
});

describe('حدود اليوم المحلي — أول يوم وآخر يوم', () => {
  it('`from` منتصف الليل محليًا لا بتوقيت UTC', () => {
    const from = startOfLocalDay('2026-08-01')!;
    expect(from.getHours()).toBe(0);
    expect(from.getMinutes()).toBe(0);
    expect(from.getDate()).toBe(1);
    expect(from.getMonth()).toBe(7);
  });

  it('`to` يشمل اليوم الأخير حتى آخر ميلي ثانية', () => {
    const to = endOfLocalDay('2026-08-31')!;
    expect(to.getDate()).toBe(31);
    expect(to.getHours()).toBe(23);
    expect(to.getMinutes()).toBe(59);
    expect(to.getSeconds()).toBe(59);
    expect(to.getMilliseconds()).toBe(999);
  });

  it('حركة في آخر ساعة من اليوم الأخير تقع داخل النطاق', () => {
    const to = endOfLocalDay('2026-08-31')!;
    const lateEntry = new Date(2026, 7, 31, 22, 30, 0);
    expect(lateEntry.getTime()).toBeLessThanOrEqual(to.getTime());
  });

  it('حركة في أول ساعة من اليوم الأول تقع داخل النطاق', () => {
    const from = startOfLocalDay('2026-08-01')!;
    const earlyEntry = new Date(2026, 7, 1, 1, 15, 0);
    expect(earlyEntry.getTime()).toBeGreaterThanOrEqual(from.getTime());
  });
});
