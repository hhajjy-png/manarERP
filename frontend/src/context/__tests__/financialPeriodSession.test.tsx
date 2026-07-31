// @vitest-environment jsdom
/**
 * انحدار: الفترة المالية تنجو من إعادة التحميل داخل نفس جلسة التطبيق.
 *
 * كان السياق بلا أي حفظ، فإعادة التحميل (يدويًا، أو تلقائيًا من Vite عند تعديل ملف
 * واجهة في وضع التطوير) تُعيد الفترة صامتة إلى «السنة حتى اليوم» — فيظن المستخدم أنه
 * ما زال يراجع 2025 بينما القائمة تعرض 2026، فتبدو سجلات 2025 مفقودة.
 *
 * `sessionStorage` هي الحدّ الصحيح: تنجو من إعادة التحميل، وتُمحى بإغلاق النافذة —
 * فلا تُثبَّت سنة تاريخية بين تشغيلَين للتطبيق (القاعدة الأصلية محفوظة).
 *
 * «إعادة التحميل» تُحاكى بـ`unmount()` ثم `render()` جديد: نفس `sessionStorage`،
 * شجرة React جديدة — وهو بالضبط ما يحدث عند reload داخل نفس النافذة.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import {
  FinancialPeriodProvider,
  useFinancialPeriod,
  PERIOD_SESSION_KEY,
} from '../FinancialPeriodContext';

function Probe() {
  const { period, setPreset, setYear, setMonth, setCustomRange, resetToCurrentYear } = useFinancialPeriod();
  return (
    <>
      <span data-testid="preset">{period.preset}</span>
      <span data-testid="from">{period.fromDate ?? '—'}</span>
      <span data-testid="to">{period.toDate ?? '—'}</span>
      <span data-testid="all">{String(period.isAllPeriods)}</span>
      <span data-testid="hist">{String(period.isHistorical)}</span>
      <span data-testid="month">{period.selectedMonth ?? '—'}</span>
      <span data-testid="year">{period.selectedYear ?? '—'}</span>
      <button data-testid="y2025" onClick={() => setYear(2025)}>y</button>
      <button data-testid="aug2025" onClick={() => setMonth(2025, 7)}>m8</button>
      <button data-testid="jan2026" onClick={() => setMonth(2026, 0)}>m1</button>
      <button data-testid="prev-year" onClick={() => setPreset('previous-year')}>p</button>
      <button data-testid="cur-month" onClick={() => setPreset('current-month')}>m</button>
      <button data-testid="all-periods" onClick={() => setPreset('all')}>a</button>
      <button data-testid="custom" onClick={() => setCustomRange('2025-02-10', '2025-04-20')}>c</button>
      <button data-testid="reset" onClick={() => resetToCurrentYear()}>r</button>
    </>
  );
}

const mount = () => render(<FinancialPeriodProvider><Probe /></FinancialPeriodProvider>);
const read = (id: string) => screen.getByTestId(id).textContent;
/** يحاكي إعادة تحميل النافذة: شجرة جديدة، نفس sessionStorage. */
function reload(view: ReturnType<typeof mount>) {
  act(() => { view.unmount(); });
  return mount();
}

const CUR = new Date().getFullYear();

beforeEach(() => {
  sessionStorage.clear();
  localStorage.clear();
});

describe('الفترة المالية — البقاء داخل الجلسة', () => {
  it('الافتراضي عند جلسة نظيفة: السنة حتى اليوم (لا سنة تاريخية مثبَّتة)', () => {
    mount();
    expect(read('preset')).toBe('year-to-date');
    expect(read('from')).toBe(`${CUR}-01-01`);
    expect(read('hist')).toBe('false');
  });

  it('السنة 2025 تصمد عبر إعادة التحميل', () => {
    let view = mount();
    act(() => { screen.getByTestId('y2025').click(); });
    expect(read('from')).toBe('2025-01-01');
    expect(read('to')).toBe('2025-12-31');

    view = reload(view);

    expect(read('preset')).toBe('year');
    expect(read('from')).toBe('2025-01-01');
    expect(read('to')).toBe('2025-12-31');
    expect(read('hist')).toBe('true');
  });

  it('«كل الفترات» تصمد عبر إعادة التحميل', () => {
    let view = mount();
    act(() => { screen.getByTestId('all-periods').click(); });
    expect(read('all')).toBe('true');

    view = reload(view);

    expect(read('preset')).toBe('all');
    expect(read('all')).toBe('true');
    expect(read('from')).toBe('—');
    expect(read('to')).toBe('—');
  });

  it('النطاق المخصص يصمد بحدّيه', () => {
    let view = mount();
    act(() => { screen.getByTestId('custom').click(); });
    expect(read('from')).toBe('2025-02-10');

    view = reload(view);

    expect(read('preset')).toBe('custom');
    expect(read('from')).toBe('2025-02-10');
    expect(read('to')).toBe('2025-04-20');
  });

  it('«السنة السابقة» و«الشهر الحالي» يصمدان كإعدادات نسبية', () => {
    let view = mount();
    act(() => { screen.getByTestId('prev-year').click(); });
    view = reload(view);
    expect(read('preset')).toBe('previous-year');
    expect(read('from')).toBe(`${CUR - 1}-01-01`);

    act(() => { screen.getByTestId('cur-month').click(); });
    view = reload(view);
    expect(read('preset')).toBe('current-month');
    expect(read('from')?.slice(0, 4)).toBe(String(CUR));
  });

  it('الإعداد النسبي يُعاد حسابه لا يُجمَّد: يُخزَّن المُدخَل لا الفترة المحسوبة', () => {
    mount();
    act(() => { screen.getByTestId('cur-month').click(); });
    const raw = JSON.parse(sessionStorage.getItem(PERIOD_SESSION_KEY) ?? '{}');
    expect(raw).toEqual({ preset: 'current-month' });   // بلا from/to مُجمَّدين
  });

  it('«العودة للافتراضي» تعيد السنة حتى اليوم وتصمد', () => {
    let view = mount();
    act(() => { screen.getByTestId('y2025').click(); });
    act(() => { screen.getByTestId('reset').click(); });
    expect(read('preset')).toBe('year-to-date');

    view = reload(view);
    expect(read('preset')).toBe('year-to-date');
    expect(read('hist')).toBe('false');
  });

  it('جلسة تطبيق جديدة (sessionStorage فارغة) لا تُثبِّت 2025', () => {
    let view = mount();
    act(() => { screen.getByTestId('y2025').click(); });
    expect(read('from')).toBe('2025-01-01');

    sessionStorage.clear();          // ← إغلاق التطبيق وفتحه من جديد
    view = reload(view);

    expect(read('preset')).toBe('year-to-date');
    expect(read('from')).toBe(`${CUR}-01-01`);
  });

  it('لا يُكتب شيء في localStorage إطلاقًا', () => {
    mount();
    act(() => { screen.getByTestId('y2025').click(); });
    act(() => { screen.getByTestId('custom').click(); });
    expect(localStorage.length).toBe(0);
  });

  it('قيمة مخزَّنة تالفة تعود بأمان إلى الافتراضي', () => {
    for (const bad of ['{{{', '{"preset":"nope"}', '{"preset":"custom"}', '{"preset":"year"}', 'null']) {
      sessionStorage.setItem(PERIOD_SESSION_KEY, bad);
      const view = mount();
      expect(read('preset')).toBe('year-to-date');
      act(() => { view.unmount(); });
    }
  });
});

describe('شهر محدد — نفس دلالات الحفظ بلا تغيير', () => {
  it('اختيار شهر يُخزَّن كمُدخَل (preset + سنة + شهر) لا كنطاق مُجمَّد', () => {
    mount();
    act(() => { screen.getByTestId('aug2025').click(); });
    const raw = JSON.parse(sessionStorage.getItem(PERIOD_SESSION_KEY) ?? '{}');
    expect(raw).toEqual({ preset: 'month', selectedYear: 2025, selectedMonth: 7 });
  });

  it('الشهر المختار ينجو من إعادة التحميل داخل نفس الجلسة', () => {
    let view = mount();
    act(() => { screen.getByTestId('aug2025').click(); });
    expect([read('from'), read('to')]).toEqual(['2025-08-01', '2025-08-31']);

    view = reload(view);
    expect(read('preset')).toBe('month');
    expect([read('from'), read('to')]).toEqual(['2025-08-01', '2025-08-31']);
    expect(read('hist')).toBe('true');
  });

  it('يناير (الشهر 0) ينجو من الرحلة عبر sessionStorage — لا يسقط كقيمة كاذبة', () => {
    let view = mount();
    act(() => { screen.getByTestId('jan2026').click(); });
    expect(read('month')).toBe('0');

    view = reload(view);
    expect(read('preset')).toBe('month');
    expect(read('month')).toBe('0');
    expect([read('from'), read('to')]).toEqual(['2026-01-01', '2026-01-31']);
  });

  it('جلسة تطبيق جديدة لا تُثبِّت شهرًا تاريخيًا', () => {
    let view = mount();
    act(() => { screen.getByTestId('aug2025').click(); });

    sessionStorage.clear();          // ← إغلاق التطبيق وفتحه من جديد
    view = reload(view);

    expect(read('preset')).toBe('year-to-date');
  });

  it('مُدخَل شهر مشوَّه يعود بأمان إلى الافتراضي', () => {
    const bad = [
      '{"preset":"month"}',                                  // بلا سنة ولا شهر
      '{"preset":"month","selectedYear":2026}',              // بلا شهر
      '{"preset":"month","selectedMonth":7}',                // بلا سنة
      '{"preset":"month","selectedYear":2026,"selectedMonth":12}',  // خارج المدى
      '{"preset":"month","selectedYear":2026,"selectedMonth":-1}',  // خارج المدى
      '{"preset":"month","selectedYear":1999,"selectedMonth":0}',   // سنة خارج المدى
    ];
    for (const raw of bad) {
      sessionStorage.setItem(PERIOD_SESSION_KEY, raw);
      const view = mount();
      expect(read('preset')).toBe('year-to-date');
      act(() => { view.unmount(); });
    }
  });

  it('جلسة قديمة بـ preset=year ما تزال تُستعاد رغم زوال أزرارها', () => {
    sessionStorage.setItem(PERIOD_SESSION_KEY, JSON.stringify({ preset: 'year', selectedYear: 2024 }));
    mount();
    expect(read('preset')).toBe('year');
    expect([read('from'), read('to')]).toEqual(['2024-01-01', '2024-12-31']);
  });
});
