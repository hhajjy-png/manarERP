import { describe, it, expect } from 'vitest';
import { dateOnlySchema } from '../dateOnly';

/**
 * API Date Hardening Pack v1 — العقد الموحّد لحقول DATE-ONLY.
 *
 * الخطر الأصلي: `z.coerce.date()` تُمرِّر أي نص إلى `new Date(value)`. نص ISO خالص
 * (`YYYY-MM-DD`) غير غامض بنص المواصفة، لكن أي شكل آخر (`DD/MM/YYYY`، `MM/DD/YYYY`،
 * سنة من رقمين…) يسقط في تفسير المحرّك غير القياسي — فيتحوّل «2 أغسطس» صامتًا إلى
 * «8 فبراير»، أو يصير `Invalid Date` بصمت. هذه الاختبارات تثبت أن المدقّق الموحّد
 * يرفض كل تلك الصيغ قبل أن تصل إلى أي `Date`، ويقبل فقط الشكل القانوني.
 */

function parse(value: unknown) {
  return dateOnlySchema.safeParse(value);
}

describe('dateOnlySchema — يقبل القانوني، يرفض الغامض', () => {
  it('A) 2026-08-02 مقبول ويُبنى كمنتصف ليل UTC لنفس اليوم', () => {
    const r = parse('2026-08-02');
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.toISOString()).toBe('2026-08-02T00:00:00.000Z');
  });

  it('B) 2026-02-08 مقبول ويبقى 8 فبراير — لا ينزلق إلى أغسطس', () => {
    const r = parse('2026-02-08');
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.getUTCMonth()).toBe(1); // فبراير (0-based)
      expect(r.data.getUTCDate()).toBe(8);
    }
  });

  it('C) 02/08/2026 (DD/MM قابل للالتباس بـ MM/DD) مرفوض', () => {
    expect(parse('02/08/2026').success).toBe(false);
  });

  it('D) 08/02/2026 (نفس الالتباس بالاتجاه المعاكس) مرفوض', () => {
    expect(parse('08/02/2026').success).toBe(false);
  });

  it('E) 31/03/2025 مرفوض كصيغة غير قانونية — لا يُترك لتفسير JS', () => {
    expect(parse('31/03/2025').success).toBe(false);
  });

  it('F) 2028-02-29 (سنة كبيسة) مقبول', () => {
    const r = parse('2028-02-29');
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.toISOString()).toBe('2028-02-29T00:00:00.000Z');
  });

  it('G) 2026-02-29 (سنة غير كبيسة) مرفوض', () => {
    expect(parse('2026-02-29').success).toBe(false);
  });

  it('H) 2026-04-31 (أبريل 30 يومًا فقط) مرفوض', () => {
    expect(parse('2026-04-31').success).toBe(false);
  });

  it('I) شهر/يوم صفر أو خارج المدى مرفوض', () => {
    expect(parse('2026-13-01').success).toBe(false); // شهر 13
    expect(parse('2026-00-10').success).toBe(false); // شهر صفر
    expect(parse('2026-01-00').success).toBe(false); // يوم صفر
    expect(parse('2026-01-32').success).toBe(false); // يوم خارج يناير
  });

  it('صيغ إضافية غامضة/غير قانونية مرفوضة', () => {
    expect(parse('08-02-2026').success).toBe(false);  // dash لكن بترتيب DD-MM-YYYY
    expect(parse('08/02/26').success).toBe(false);     // سنة من رقمين
    expect(parse('2026-4-31').success).toBe(false);    // شهر غير مبطّن بصفر
    expect(parse('').success).toBe(false);
    expect(parse(null).success).toBe(false);
    expect(parse(undefined).success).toBe(false);
  });

  it('نص ISO كامل ببادئة قانونية (منتصف ليل UTC) مقبول — يطابق سلوك new Date(iso).toISOString() الحالي', () => {
    const r = parse('2026-08-02T00:00:00.000Z');
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.toISOString()).toBe('2026-08-02T00:00:00.000Z');
  });

  it('لا يقبل كائن Date مباشرة — يتطلب نصًا صريحًا', () => {
    expect(parse(new Date('2026-08-02')).success).toBe(false);
  });
});

describe('dateOnlySchema — التركيب مع optional/nullable يحافظ على العقد', () => {
  it('optional() يقبل undefined دون رفض', () => {
    const schema = dateOnlySchema.optional();
    const r = schema.safeParse(undefined);
    expect(r.success).toBe(true);
    if (r.success) expect(r.data).toBeUndefined();
  });

  it('nullable().optional() يقبل null صراحة', () => {
    const schema = dateOnlySchema.nullable().optional();
    const r = schema.safeParse(null);
    expect(r.success).toBe(true);
    if (r.success) expect(r.data).toBeNull();
  });

  it('refine() إضافي (مثل نطاق سنة الشيك) يبقى قابلًا للتركيب بعد transform', () => {
    const bounded = dateOnlySchema.refine((d) => d.getUTCFullYear() >= 2020 && d.getUTCFullYear() <= 2035);
    expect(bounded.safeParse('2026-08-02').success).toBe(true);
    expect(bounded.safeParse('2010-08-02').success).toBe(false);
  });
});
