// @vitest-environment jsdom
/**
 * انحدار: وسم بطاقات الفترة في صفحة المصروفات.
 *
 * العيب: بطاقة «السنة» كانت تعرض «سنة {y}» حرفيًا. السبب ليس الفترة المالية ولا
 * حزمة «شهر محدد»، بل عدم تطابق أسماء: النص في `i18n` كان `'سنة {y}'` بينما موضع
 * الاستدعاء يمرّر `{ year: … }`. و`t()` يستبدل `{اسم_المتغيّر}` حرفيًا، فلم يجد
 * `{year}` وبقي `{y}` كما هو.
 *
 * ── تمييز جوهري تحرسه هذه الاختبارات ────────────────────────────────────────
 * بطاقتا «الشهر» و«السنة» **ليستا** بطاقتَي الفترة المختارة. الـbackend يحسبهما
 * على نوافذ تقويمية مطلقة (الشهر الحالي/السنة الحالية) بعد **تجريد** فلتر الفترة
 * عمدًا — انظر تعليق «Period cards» في `expenses.service.ts`. لذلك وسمهما يجب أن
 * يتبع الأرقام التي تعرضها فعلًا (القادمة من `stats.periods`)، لا الفترة المختارة:
 * لو تبع الفترة لصار عنوان «أغسطس 2026» فوق إجمالي سنة 2026 كاملة — تسمية خاطئة
 * لرقم صحيح، وهي أسوأ من العيب الأصلي.
 *
 * البطاقة التي تتبع الفترة المختارة هي بطاقة الإجمالي (`stats.total`/`stats.count`)،
 * وهي مُغطّاة هنا أيضًا: تتغيّر مع الفترة بينما تبقى بطاقتا النافذة المطلقة كما هما.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, act, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const getMock = vi.fn();
vi.mock('../../api/client', () => ({
  api: {
    get: (...a: unknown[]) => getMock(...a),
    post: vi.fn(), put: vi.fn(), patch: vi.fn(), delete: vi.fn(),
  },
  errorMessage: (e: unknown) => String(e),
}));

vi.mock('../../stores/authStore', () => ({
  useAuth: () => ({ hasPermission: () => true, isSystemAdmin: () => true, user: { id: 1, fullName: 'tester' } }),
}));

import { t } from '../../lib/i18n';
import { FinancialPeriodProvider, useFinancialPeriod } from '../../context/FinancialPeriodContext';
import Expenses from '../Expenses';

// ── طبقة API ────────────────────────────────────────────────────────────────

const emptyList = {
  data: { data: { data: [], meta: { page: 1, pageSize: 15, total: 0, totalPages: 1 } } },
};

/** إحصاء بنوافذ تقويمية مطلقة كما يبنيها الـbackend فعلًا. */
function statsBody(opts: { year: number; month: number; total: number; count: number }) {
  return {
    data: {
      data: {
        count: opts.count,
        total: opts.total,
        pendingCount: 0,
        pendingTotal: 0,
        byCategory: {},
        byCompanyGroup: {},
        bySupplier: {},
        periods: {
          currentMonth:  { total: 111.111, count: 3, month: opts.month, year: opts.year },
          previousMonth: { total: 222.222, count: 4, month: opts.month - 1, year: opts.year },
          currentYear:   { total: 999.999, count: 9, year: opts.year },
        },
      },
    },
  };
}

let statsReply = statsBody({ year: 2026, month: 8, total: 50, count: 5 });

function PeriodDriver() {
  const { setMonth, setPreset } = useFinancialPeriod();
  return (
    <>
      <button data-testid="aug-2026" onClick={() => setMonth(2026, 7)}>aug</button>
      <button data-testid="all" onClick={() => setPreset('all')}>all</button>
    </>
  );
}

function renderExpenses() {
  return render(
    <MemoryRouter>
      <FinancialPeriodProvider>
        <PeriodDriver />
        <Expenses />
      </FinancialPeriodProvider>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  getMock.mockReset();
  getMock.mockImplementation((url: string) =>
    url.endsWith('/stats') ? Promise.resolve(statsReply) : Promise.resolve(emptyList));
  localStorage.clear();
  sessionStorage.clear();
  statsReply = statsBody({ year: 2026, month: 8, total: 50, count: 5 });
});

// ── 1) المفتاح نفسه (نقي، بلا تركيب) ────────────────────────────────────────

describe('lbl.year_prefix — الاستبدال يكتمل', () => {
  it('لا يبقى أي رمز نائب حرفي بالعربية', () => {
    const out = t('lbl.year_prefix', 'ar', { year: 2026 });
    expect(out).toBe('سنة 2026');
    expect(out).not.toContain('{');
  });

  it('لا يبقى أي رمز نائب حرفي بالإنجليزية', () => {
    const out = t('lbl.year_prefix', 'en', { year: 2026 });
    expect(out).toBe('Year 2026');
    expect(out).not.toContain('{');
  });

  it('السنة تأتي من الوسيط لا من قيمة مثبَّتة', () => {
    expect(t('lbl.year_prefix', 'ar', { year: 2024 })).toBe('سنة 2024');
    expect(t('lbl.year_prefix', 'ar', { year: 2031 })).toBe('سنة 2031');
  });
});

// ── 2) البطاقة كما تُعرَض فعلًا ──────────────────────────────────────────────

describe('بطاقات الفترة في صفحة المصروفات', () => {
  it('بطاقة السنة تعرض السنة الحقيقية لا «سنة {y}»', async () => {
    renderExpenses();
    expect(await screen.findByText('سنة 2026')).toBeInTheDocument();
    expect(screen.queryByText(/\{y\}/)).toBeNull();
    expect(screen.queryByText(/سنة \{/)).toBeNull();
  });

  it('لا يتسرّب أي رمز نائب غير مُستبدَل إلى الصفحة', async () => {
    const { container } = renderExpenses();
    await screen.findByText('سنة 2026');
    expect(container.textContent).not.toMatch(/\{\w+\}/);
  });

  it('السنة تتبع ما يرسله الـbackend (2024) لا قيمة مثبَّتة', async () => {
    statsReply = statsBody({ year: 2024, month: 3, total: 50, count: 5 });
    renderExpenses();
    expect(await screen.findByText('سنة 2024')).toBeInTheDocument();
    expect(screen.queryByText('سنة 2026')).toBeNull();
  });

  it('بطاقة الشهر تعرض «أغسطس 2026» من نافذتها المطلقة', async () => {
    renderExpenses();
    expect(await screen.findByText('أغسطس 2026')).toBeInTheDocument();
  });

  it('المبلغ والعدد على بطاقة السنة لم يتغيّرا', async () => {
    renderExpenses();
    await screen.findByText('سنة 2026');
    // 999.999 هي قيمة currentYear.total، و«9 مصروف» هو عددها.
    expect(screen.getByText('999.999')).toBeInTheDocument();
    expect(screen.getByText(/^9\s/)).toBeInTheDocument();
  });
});

// ── 3) العلاقة بالفترة المشتركة ─────────────────────────────────────────────

describe('الفترة المشتركة — ما يتبعها وما لا يتبعها', () => {
  it('تغيير الفترة إلى أغسطس 2026 يُعيد الاستعلام بحدود الشهر', async () => {
    renderExpenses();
    await screen.findByText('سنة 2026');

    act(() => { screen.getByTestId('aug-2026').click(); });

    await waitFor(() => {
      const statsCalls = getMock.mock.calls.filter((c) => c[0] === '/expenses/stats');
      const params = (statsCalls[statsCalls.length - 1]?.[1] as { params: Record<string, unknown> })?.params ?? {};
      expect(params.from).toBe('2026-08-01');
      expect(params.to).toBe('2026-08-31');
    });
  });

  it('بطاقتا النافذة المطلقة تبقيان موسومتين بنافذتهما بعد تغيير الفترة', async () => {
    renderExpenses();
    await screen.findByText('سنة 2026');

    act(() => { screen.getByTestId('aug-2026').click(); });

    // الوسم يتبع `stats.periods` (النافذة المطلقة) لا الفترة المختارة — فلا
    // يصير عنوان «أغسطس 2026» فوق إجمالي السنة.
    await waitFor(() => expect(screen.getByText('سنة 2026')).toBeInTheDocument());
    expect(screen.queryByText(/\{y\}/)).toBeNull();
  });

  it('الوسم يبقى سليمًا عند «كل الفترات» أيضًا', async () => {
    renderExpenses();
    await screen.findByText('سنة 2026');

    act(() => { screen.getByTestId('all').click(); });

    await waitFor(() => expect(screen.getByText('سنة 2026')).toBeInTheDocument());
    expect(screen.queryByText(/\{y\}/)).toBeNull();
  });
});
