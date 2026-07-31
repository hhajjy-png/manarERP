// @vitest-environment jsdom
/**
 * Financial Period Month Selector Pack v1 — قسم «شهر محدد».
 *
 * القسم الذي كان «سنة محددة» صار «شهر محدد»: اثنا عشر زرًّا للأشهر، ومتصفّح
 * سنة (سهمان + السنة) في رأس القسم. المتصفّح ليس زينة — هو ما يحفظ الوصول إلى
 * أشهر السنوات التاريخية بعد زوال أزرار السنوات، فهو مُغطّى هنا صراحةً.
 *
 * ما تحرسه هذه الاختبارات إضافةً إلى ذلك: أن بقية اللوحة (الفترات الجاهزة،
 * النطاق المخصص، زر تطبيق) لم تتأثر، وأن الفترة المختارة تصل إلى السياق
 * المشترك — لا إلى حالة محلية داخل الصفحة.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, act, within } from '@testing-library/react';
import PeriodControl from '../PeriodControl';
import { FinancialPeriodProvider, useFinancialPeriod } from '../../../context/FinancialPeriodContext';

const AR_MONTHS = [
  'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
  'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر',
];

const CUR_YEAR = new Date().getFullYear();

/** يعرض الفترة المشتركة بجانب العنصر — يثبت أن الاختيار وصل إلى السياق نفسه. */
function PeriodProbe() {
  const { period } = useFinancialPeriod();
  return (
    <>
      <span data-testid="p-preset">{period.preset}</span>
      <span data-testid="p-from">{period.fromDate ?? '—'}</span>
      <span data-testid="p-to">{period.toDate ?? '—'}</span>
      <span data-testid="p-month">{period.selectedMonth ?? '—'}</span>
      <span data-testid="p-year">{period.selectedYear ?? '—'}</span>
    </>
  );
}

function mount() {
  return render(
    <FinancialPeriodProvider>
      <PeriodControl />
      <PeriodProbe />
    </FinancialPeriodProvider>,
  );
}

/** يفتح اللوحة المنسدلة ويعيد جذرها. */
function openPanel(): HTMLElement {
  act(() => { screen.getByRole('button', { name: 'اختيار الفترة المالية' }).click(); });
  return screen.getByRole('dialog', { name: 'الفترة المالية' });
}

const clickText = (root: HTMLElement, text: string) => {
  act(() => { within(root).getByText(text).click(); });
};

const read = (id: string) => screen.getByTestId(id).textContent;

beforeEach(() => {
  sessionStorage.clear();
  localStorage.clear();
  mount();
});

describe('قسم الأشهر — استبدال «سنة محددة»', () => {
  it('«سنة محددة» لم يعد معروضًا', () => {
    const panel = openPanel();
    expect(within(panel).queryByText('سنة محددة')).toBeNull();
  });

  it('«شهر محدد» معروض', () => {
    const panel = openPanel();
    expect(within(panel).getByText('شهر محدد')).toBeInTheDocument();
  });

  it('الأشهر الاثنا عشر معروضة، كل واحد مرة واحدة بالضبط', () => {
    const panel = openPanel();
    for (const name of AR_MONTHS) {
      expect(within(panel).getAllByText(name)).toHaveLength(1);
    }
  });

  it('لا تبقى أزرار سنوات (2024/2023/…) في القسم', () => {
    const panel = openPanel();
    expect(within(panel).queryByRole('button', { name: '2024' })).toBeNull();
    expect(within(panel).queryByRole('button', { name: '2023' })).toBeNull();
  });
});

describe('اختيار شهر — يصل إلى الفترة المشتركة', () => {
  it('يناير → 01/01 حتى 31/01 من السنة النشطة', () => {
    const panel = openPanel();
    clickText(panel, 'يناير');
    expect(read('p-preset')).toBe('month');
    expect([read('p-from'), read('p-to')]).toEqual([`${CUR_YEAR}-01-01`, `${CUR_YEAR}-01-31`]);
    expect(read('p-month')).toBe('0');
  });

  it('أغسطس → الشهر كاملًا', () => {
    const panel = openPanel();
    clickText(panel, 'أغسطس');
    expect([read('p-from'), read('p-to')]).toEqual([`${CUR_YEAR}-08-01`, `${CUR_YEAR}-08-31`]);
  });

  it('ديسمبر → 01/12 حتى 31/12 بلا انزلاق إلى السنة التالية', () => {
    const panel = openPanel();
    clickText(panel, 'ديسمبر');
    expect([read('p-from'), read('p-to')]).toEqual([`${CUR_YEAR}-12-01`, `${CUR_YEAR}-12-31`]);
  });

  it('اختيار الشهر يُطبَّق فورًا ويغلق اللوحة — نفس تفاعل الأزرار التي حلّ محلها', () => {
    const panel = openPanel();
    clickText(panel, 'مارس');
    // اللوحة أُغلقت: لم يعد الحوار موجودًا.
    expect(screen.queryByRole('dialog', { name: 'الفترة المالية' })).toBeNull();
    // والفترة طُبِّقت بلا حاجة إلى زر «تطبيق».
    expect(read('p-preset')).toBe('month');
  });

  it('الشهر المختار يظهر نشطًا عند إعادة الفتح', () => {
    let panel = openPanel();
    clickText(panel, 'مايو');
    panel = openPanel();
    expect(within(panel).getByText('مايو').className).toContain('is-active');
    expect(within(panel).getByText('أبريل').className).not.toContain('is-active');
  });

  it('وسم العنصر يعرض الشهر والسنة', () => {
    const panel = openPanel();
    clickText(panel, 'أغسطس');
    expect(screen.getByText(`الشهر المالي: أغسطس ${CUR_YEAR}`)).toBeInTheDocument();
  });
});

describe('متصفّح السنة — الأشهر التاريخية تبقى قابلة للوصول', () => {
  const prevYearLabel = 'السنة السابقة';

  /** السهم يشترك في الاسم مع زر الإعداد المسبق، فنأخذ الزرّ ذا الأيقونة. */
  const stepBack = (panel: HTMLElement) => {
    const btns = within(panel).getAllByRole('button', { name: prevYearLabel });
    return btns[btns.length - 1];
  };

  it('السنة الافتراضية في رأس القسم هي سنة الفترة النشطة', () => {
    const panel = openPanel();
    expect(within(panel).getByText(String(CUR_YEAR))).toBeInTheDocument();
  });

  it('السهم يرجع سنةً، فيصير أغسطس السنة الماضية قابلًا للاختيار', () => {
    let panel = openPanel();
    act(() => { stepBack(panel).click(); });
    clickText(panel, 'أغسطس');

    expect(read('p-preset')).toBe('month');
    expect(read('p-year')).toBe(String(CUR_YEAR - 1));
    expect([read('p-from'), read('p-to')])
      .toEqual([`${CUR_YEAR - 1}-08-01`, `${CUR_YEAR - 1}-08-31`]);

    // ووسم العنصر (على زر الملخّص، خارج اللوحة) يذكر السنة صراحةً.
    expect(screen.getByText(`الشهر المالي: أغسطس ${CUR_YEAR - 1}`)).toBeInTheDocument();
  });

  it('سنتان للخلف تبقيان قابلتين للوصول (ما كانت أزرار السنوات تغطّيه)', () => {
    const panel = openPanel();
    act(() => { stepBack(panel).click(); });
    act(() => { stepBack(panel).click(); });
    clickText(panel, 'أغسطس');
    expect([read('p-from'), read('p-to')])
      .toEqual([`${CUR_YEAR - 2}-08-01`, `${CUR_YEAR - 2}-08-31`]);
  });

  it('«التالي» معطّل عند السنة الحالية — لا فترات مستقبلية', () => {
    const panel = openPanel();
    const next = within(panel).getByRole('button', { name: 'السنة التالية' });
    expect(next).toBeDisabled();
  });

  it('إعادة فتح اللوحة تُعيد بذر السنة من الفترة النشطة', () => {
    let panel = openPanel();
    act(() => { stepBack(panel).click(); });
    clickText(panel, 'أغسطس');            // الآن الفترة في السنة الماضية

    panel = openPanel();
    expect(within(panel).getByText(String(CUR_YEAR - 1))).toBeInTheDocument();
  });

  it('preset «السنة السابقة» يفتح قسم الأشهر على تلك السنة', () => {
    let panel = openPanel();
    const presetBtn = within(panel).getAllByRole('button', { name: prevYearLabel })[0];
    act(() => { presetBtn.click(); });

    panel = openPanel();
    expect(within(panel).getByText(String(CUR_YEAR - 1))).toBeInTheDocument();
  });
});

describe('بقية اللوحة لم تتأثر', () => {
  it('الفترات الجاهزة ما تزال تعمل', () => {
    const panel = openPanel();
    clickText(panel, 'الشهر الحالي');
    expect(read('p-preset')).toBe('current-month');
  });

  it('«كل الفترات» ما تزال تعمل', () => {
    const panel = openPanel();
    clickText(panel, 'كل الفترات');
    expect(read('p-preset')).toBe('all');
    expect(read('p-from')).toBe('—');
  });

  it('قسم النطاق المخصص وزر «تطبيق» ما يزالان معروضين', () => {
    const panel = openPanel();
    expect(within(panel).getByText('نطاق مخصص')).toBeInTheDocument();
    expect(within(panel).getByRole('button', { name: 'تطبيق' })).toBeInTheDocument();
  });

  it('«تطبيق» يبقى محكومًا بحقلَي النطاق المخصص وحدهما — لا بالشهر', () => {
    // زر «تطبيق» لم يكن يومًا بوّابة قسم السنة/الشهر: حالته تتبع حقلَي النطاق
    // المخصص فقط (وهما مبذوران من الفترة النشطة عند التركيب، فيبدأ مفعّلًا).
    // المهم هنا أن اختيار شهر لا يمسّ تلك الحالة إطلاقًا.
    let panel = openPanel();
    const before = (within(panel).getByRole('button', { name: 'تطبيق' }) as HTMLButtonElement).disabled;

    clickText(panel, 'مارس');
    panel = openPanel();
    const after = (within(panel).getByRole('button', { name: 'تطبيق' }) as HTMLButtonElement).disabled;

    expect(after).toBe(before);
  });

  it('«تطبيق» ما يزال يلتزم بنطاق مخصص كامل', () => {
    const panel = openPanel();
    act(() => { within(panel).getByRole('button', { name: 'تطبيق' }).click(); });
    expect(read('p-preset')).toBe('custom');
  });
});
