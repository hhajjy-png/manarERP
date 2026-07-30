// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { FinancialPeriodProvider, useFinancialPeriod } from '../FinancialPeriodContext';
import { periodToRangeParams } from '../../lib/financialPeriod';

/** مكوّن اختبار يعرض حالة الفترة ويكشف الأفعال. */
function Probe() {
  const { period, setPreset, setYear, setCustomRange, resetToCurrentYear } = useFinancialPeriod();
  return (
    <div>
      <span data-testid="preset">{period.preset}</span>
      <span data-testid="from">{period.fromDate ?? ''}</span>
      <span data-testid="to">{period.toDate ?? ''}</span>
      <span data-testid="all">{String(period.isAllPeriods)}</span>
      <span data-testid="key">{JSON.stringify(periodToRangeParams(period))}</span>
      <button onClick={() => setPreset('all')}>all</button>
      <button onClick={() => setYear(2024)}>year2024</button>
      <button onClick={() => setCustomRange('2024-02-01', '2024-02-29')}>custom</button>
      <button onClick={() => resetToCurrentYear()}>reset</button>
      <button onClick={() => setPreset('previous-year')}>prev</button>
    </div>
  );
}

function renderProbe() {
  return render(
    <FinancialPeriodProvider>
      <Probe />
    </FinancialPeriodProvider>,
  );
}

const curYear = new Date().getFullYear();

describe('FinancialPeriodProvider', () => {
  beforeEach(() => localStorage.clear());

  it('يبدأ بالسنة الحالية حتى اليوم (لا All Periods)', () => {
    renderProbe();
    expect(screen.getByTestId('preset').textContent).toBe('year-to-date');
    expect(screen.getByTestId('from').textContent).toBe(`${curYear}-01-01`);
    expect(screen.getByTestId('all').textContent).toBe('false');
  });

  it('All Periods خيار صريح يُفعَّل بالضغط فقط', () => {
    renderProbe();
    act(() => screen.getByText('all').click());
    expect(screen.getByTestId('preset').textContent).toBe('all');
    expect(screen.getByTestId('all').textContent).toBe('true');
    expect(screen.getByTestId('from').textContent).toBe('');
  });

  it('تغيير الفترة يغيّر مفتاح الاستعلام (query key)', () => {
    renderProbe();
    const before = screen.getByTestId('key').textContent;
    act(() => screen.getByText('year2024').click());
    const after = screen.getByTestId('key').textContent;
    expect(after).not.toBe(before);
    expect(after).toContain('2024-01-01');
  });

  it('النطاق المخصص يُطبَّق', () => {
    renderProbe();
    act(() => screen.getByText('custom').click());
    expect(screen.getByTestId('from').textContent).toBe('2024-02-01');
    expect(screen.getByTestId('to').textContent).toBe('2024-02-29');
  });

  it('زر الرجوع يعيد السنة الحالية حتى اليوم', () => {
    renderProbe();
    act(() => screen.getByText('year2024').click());
    act(() => screen.getByText('reset').click());
    expect(screen.getByTestId('preset').textContent).toBe('year-to-date');
    expect(screen.getByTestId('from').textContent).toBe(`${curYear}-01-01`);
  });

  /**
   * تحديث مقصود للعقد (Historical Data Period Reliability v1): الفترة صارت تنجو من
   * **إعادة التحميل داخل نفس الجلسة** عبر `sessionStorage` — كان فقدانها الصامت يُعيد
   * المستخدم إلى السنة الحالية وهو يظن أنه يراجع 2025.
   *
   * الشقّ الذي لم يتغيّر ويبقى مؤكَّدًا هنا: **لا قراءة ولا كتابة إلى `localStorage`
   * إطلاقًا** — فلا تُثبَّت سنة تاريخية بين تشغيلَين للتطبيق.
   * تغطية «جلسة جديدة ⇒ عودة للافتراضي» في `financialPeriodSession.test.tsx`.
   */
  it('لا يقرأ من localStorage إطلاقًا، ويصمد عبر إعادة التركيب داخل نفس الجلسة', () => {
    // قيمة قديمة في localStorage — يجب أن تُتجاهَل تمامًا.
    localStorage.setItem('manar.period', JSON.stringify({ preset: 'year', selectedYear: 2024 }));
    const { unmount } = renderProbe();
    act(() => screen.getByText('year2024').click());
    expect(screen.getByTestId('preset').textContent).toBe('year');
    unmount();

    // مزوّد جديد داخل نفس الجلسة (إعادة تحميل) → يبقى على اختيار المستخدم.
    const second = renderProbe();
    expect(screen.getByTestId('preset').textContent).toBe('year');
    expect(screen.getByTestId('to').textContent).toContain('2024');
    second.unmount();

    // والمصدر هو sessionStorage لا localStorage: مسح الجلسة يعيد الافتراضي
    // رغم بقاء قيمة 2024 في localStorage.
    sessionStorage.clear();
    renderProbe();
    expect(screen.getByTestId('preset').textContent).toBe('year-to-date');
    expect(screen.getByTestId('to').textContent).not.toContain('2024');
  });
});
