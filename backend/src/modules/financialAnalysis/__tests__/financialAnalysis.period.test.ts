import { describe, it, expect } from 'vitest';
import { resolveAnalysisPeriod } from '../financialAnalysis.dataset';

/* ════════════════════════════════════════════════════════════════════════════
   حلّ الفترة وفترتها السابقة.

   دالّة نقيّة رغم سكناها في طبقة البيانات (لا Prisma فيها)، فتُختبر مباشرة.

   الدافع: `days` كان يُقاس بين **بداية** اليوم الأول و**نهاية** اليوم الأخير
   (23:59:59.999)، أي (n − 0.000001) يومًا، فيقرّبه `Math.round` إلى n ثم تُضاف
   واحدة للشمول ⇒ n + 1. النتيجة يومٌ زائد في كل فترة: يضخّم «متوسط فترة التحصيل»
   ويجعل نافذة المقارنة السابقة أطول من الفترة الحالية بيوم كامل.
   ════════════════════════════════════════════════════════════════════════════ */

describe('resolveAnalysisPeriod — inclusive day count', () => {
  const days = (from: string, to: string) => resolveAnalysisPeriod({ from, to }).days;

  it('counts a single day as one day', () => {
    expect(days('2026-08-07', '2026-08-07')).toBe(1);
  });

  it('counts a full calendar month as its real length', () => {
    expect(days('2026-08-01', '2026-08-31')).toBe(31);
    expect(days('2026-04-01', '2026-04-30')).toBe(30);
    expect(days('2026-02-01', '2026-02-28')).toBe(28);
  });

  it('counts February in a leap year as 29 days', () => {
    expect(days('2028-02-01', '2028-02-29')).toBe(29);
  });

  it('counts a calendar year as 365 days, and a leap year as 366', () => {
    expect(days('2026-01-01', '2026-12-31')).toBe(365);
    expect(days('2028-01-01', '2028-12-31')).toBe(366);
  });

  it('counts a quarter and a half-year exactly', () => {
    expect(days('2026-01-01', '2026-03-31')).toBe(90);
    expect(days('2026-01-01', '2026-06-30')).toBe(181);
  });
});

describe('resolveAnalysisPeriod — previous window', () => {
  it('ends the day before the period starts', () => {
    expect(resolveAnalysisPeriod({ from: '2026-08-01', to: '2026-08-31' }).previousTo).toBe('2026-07-31');
  });

  it('matches the current period length exactly', () => {
    const p = resolveAnalysisPeriod({ from: '2026-08-01', to: '2026-08-31' });
    expect(p.days).toBe(31);
    // 01/07 → 31/07 = 31 يومًا أيضًا. قبل الإصلاح كانت تبدأ في 30/06 (32 يومًا)
    // فيُقارَن شهرٌ بواحدٍ وثلاثين يومًا بنافذةٍ من اثنين وثلاثين — أساس غير عادل.
    expect(p.previousFrom).toBe('2026-07-01');
    const previous = resolveAnalysisPeriod({ from: p.previousFrom!, to: p.previousTo! });
    expect(previous.days).toBe(p.days);
  });

  it('keeps the two windows equal in length for an arbitrary range', () => {
    const p = resolveAnalysisPeriod({ from: '2026-03-11', to: '2026-05-04' });
    const previous = resolveAnalysisPeriod({ from: p.previousFrom!, to: p.previousTo! });
    expect(previous.days).toBe(p.days);
    expect(p.previousTo).toBe('2026-03-10');
  });

  it('crosses a year boundary without drifting', () => {
    const p = resolveAnalysisPeriod({ from: '2026-01-01', to: '2026-01-31' });
    expect(p.previousFrom).toBe('2025-12-01');
    expect(p.previousTo).toBe('2025-12-31');
  });
});

describe('resolveAnalysisPeriod — open ranges', () => {
  it('offers no comparison when either bound is missing', () => {
    for (const input of [{ from: '2026-01-01' }, { to: '2026-01-31' }, {}]) {
      const p = resolveAnalysisPeriod(input);
      expect(p.days).toBeNull();
      expect(p.previousFrom).toBeNull();
      expect(p.previousTo).toBeNull();
    }
  });

  it('offers no comparison when a bound is not a real calendar date', () => {
    const p = resolveAnalysisPeriod({ from: '2026-02-31', to: '2026-03-31' });
    expect(p.days).toBeNull();
    expect(p.previousFrom).toBeNull();
  });
});
