// @vitest-environment jsdom
/**
 * انحدار: Historical Data Period Reliability v1
 *
 * كانت صفحتا الفواتير والمصروفات تحملان **نظامَي فلترة زمنية مستقلَّين على عمودين
 * مختلفين**، يتقاطعان بـAND في Prisma:
 *
 *   PeriodControl  →  from/to      →  issueDate (فاتورة) / date (مصروف)
 *   فلتر «السنة»    →  billingYear  →  billingYear
 *
 * فاختيار 2025 في فلتر الجدول بينما الفترة العليا 2026 كان يُنتج
 * `billingYear=2025 AND issueDate ∈ 2026` — مجموعة فارغة حتمًا، فتبدو سجلات 2025
 * «مفقودة» وهي محفوظة سليمة. أُزيل الفلتر المحلي وصار PeriodControl المصدر الوحيد.
 *
 * تُشغَّل الصفحة الحقيقية (لا محاكاة) مع طبقة API مُزيَّفة، فتُلتقط المعاملات كما
 * تُرسَل فعلًا.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, act, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

// ── طبقة API مُزيَّفة ─────────────────────────────────────────────────────────
const getMock = vi.fn();
vi.mock('../../api/client', () => ({
  api: {
    get: (...a: unknown[]) => getMock(...a),
    post: vi.fn(), put: vi.fn(), patch: vi.fn(), delete: vi.fn(),
  },
  errorMessage: (e: unknown) => String(e),
}));

// صلاحيات كاملة — الاختبار عن المعاملات لا عن RBAC.
// `isSystemAdmin` دالة في المتجر الحقيقي (تُستدعى كـ getIsSystemAdmin()) لا قيمة.
vi.mock('../../stores/authStore', () => ({
  useAuth: () => ({
    hasPermission: () => true,
    isSystemAdmin: () => true,
    user: { id: 1, fullName: 'tester' },
  }),
}));

import { FinancialPeriodProvider, useFinancialPeriod } from '../../context/FinancialPeriodContext';
import Invoices from '../Invoices';
import Expenses from '../Expenses';

// ── أدوات ────────────────────────────────────────────────────────────────────

const listBody = (ids: number[], total = ids.length) => ({
  data: { data: { data: ids.map((id) => ({ id, invoiceNumber: `N-${id}`, number: `N-${id}`, code: `C-${id}`, status: 'UNPAID', total: 1, amount: 1, direction: 'SALES' })), meta: { page: 1, pageSize: 15, total, totalPages: 1 } } },
});

/** كل استدعاءات `/invoices` أو `/expenses` (القائمة فقط، لا stats). */
function listCalls(resource: 'invoices' | 'expenses') {
  return getMock.mock.calls.filter((c) => c[0] === `/${resource}`);
}
function lastListParams(resource: 'invoices' | 'expenses') {
  const calls = listCalls(resource);
  return (calls[calls.length - 1]?.[1] as { params: Record<string, unknown> } | undefined)?.params ?? {};
}

/** زر اختبار يغيّر الفترة عبر السياق الحقيقي (كما يفعل PeriodControl). */
function PeriodDriver() {
  const { setYear, setPreset } = useFinancialPeriod();
  return (
    <>
      <button data-testid="to-2025" onClick={() => setYear(2025)}>2025</button>
      <button data-testid="to-all" onClick={() => setPreset('all')}>all</button>
    </>
  );
}

function renderPage(Page: () => JSX.Element) {
  return render(
    <MemoryRouter>
      <FinancialPeriodProvider>
        <PeriodDriver />
        <Page />
      </FinancialPeriodProvider>
    </MemoryRouter>,
  );
}

/** ردّ افتراضي حسب المسار: بطاقات الإحصاء تُعطَّل بـnull (الصفحة تحرسها). */
const defaultReply = (url: string) =>
  url.endsWith('/stats') ? Promise.resolve({ data: { data: null } }) : Promise.resolve(listBody([]));

beforeEach(() => {
  getMock.mockReset();
  getMock.mockImplementation((url: string) => defaultReply(url));
  localStorage.clear();
  sessionStorage.clear();
});

// ── 1) لا billingYear/billingMonth بعد الآن ─────────────────────────────────

describe('المصدر الزمني الوحيد — الفواتير', () => {
  it('لا تُرسل billingYear ولا billingMonth إطلاقًا، وترسل from/to', async () => {
    renderPage(Invoices);
    await waitFor(() => expect(listCalls('invoices').length).toBeGreaterThan(0));

    const p = lastListParams('invoices');
    expect(p).not.toHaveProperty('billingYear');
    expect(p).not.toHaveProperty('billingMonth');
    expect(p.from).toBeDefined();
    expect(p.to).toBeDefined();
  });

  it('اختيار 2025 يُنتج from/to لسنة 2025 — بلا أي بُعد زمني ثانٍ يتعارض معه', async () => {
    renderPage(Invoices);
    await waitFor(() => expect(listCalls('invoices').length).toBeGreaterThan(0));

    await act(async () => { screen.getByTestId('to-2025').click(); });
    await waitFor(() => expect(lastListParams('invoices').from).toBe('2025-01-01'));

    const p = lastListParams('invoices');
    expect(p.from).toBe('2025-01-01');
    expect(p.to).toBe('2025-12-31');
    expect(p).not.toHaveProperty('billingYear');   // ← جوهر الانحدار
    expect(p).not.toHaveProperty('billingMonth');
  });

  it('«كل الفترات» يزيل الحدّين تمامًا', async () => {
    renderPage(Invoices);
    await waitFor(() => expect(listCalls('invoices').length).toBeGreaterThan(0));

    await act(async () => { screen.getByTestId('to-all').click(); });
    await waitFor(() => expect(lastListParams('invoices').from).toBeUndefined());

    const p = lastListParams('invoices');
    expect(p.from).toBeUndefined();
    expect(p.to).toBeUndefined();
    expect(p).not.toHaveProperty('billingYear');
  });
});

describe('المصدر الزمني الوحيد — المصروفات', () => {
  it('لا تُرسل billingYear ولا billingMonth إطلاقًا، وترسل from/to', async () => {
    renderPage(Expenses);
    await waitFor(() => expect(listCalls('expenses').length).toBeGreaterThan(0));

    const p = lastListParams('expenses');
    expect(p).not.toHaveProperty('billingYear');
    expect(p).not.toHaveProperty('billingMonth');
    expect(p.from).toBeDefined();
    expect(p.to).toBeDefined();
  });

  it('اختيار 2025 يُنتج from/to لسنة 2025 بلا تعارض', async () => {
    renderPage(Expenses);
    await waitFor(() => expect(listCalls('expenses').length).toBeGreaterThan(0));

    await act(async () => { screen.getByTestId('to-2025').click(); });
    await waitFor(() => expect(lastListParams('expenses').from).toBe('2025-01-01'));

    const p = lastListParams('expenses');
    expect(p.to).toBe('2025-12-31');
    expect(p).not.toHaveProperty('billingYear');
    expect(p).not.toHaveProperty('billingMonth');
  });
});

// ── 3) حارس السباق ───────────────────────────────────────────────────────────

describe('سباق الطلبات — استجابة قديمة لا تدهس أحدث منها', () => {
  it('الفواتير: الاستجابة البطيئة للفترة السابقة تُهمَل بعد وصول الأحدث', async () => {
    // الطلب الأول (2026) يُحتجَز؛ الثاني (2025) يعود فورًا؛ ثم نُطلق الأول متأخرًا.
    let releaseFirst: (() => void) | null = null;
    const firstPending = new Promise((resolve) => {
      releaseFirst = () => resolve(listBody([9001, 9002], 2)); // نتيجة 2026 «القديمة»
    });

    let listSeen = 0;
    getMock.mockImplementation((url: string) => {
      if (url !== '/invoices') return defaultReply(url);
      listSeen += 1;
      if (listSeen === 1) return firstPending;
      return Promise.resolve(listBody([52], 1)); // نتيجة 2025 «الأحدث»
    });

    renderPage(Invoices);
    await waitFor(() => expect(listSeen).toBe(1));

    // غيّر الفترة إلى 2025 — الطلب الثاني ينطلق ويعود أولًا.
    await act(async () => { screen.getByTestId('to-2025').click(); });
    await waitFor(() => expect(listSeen).toBe(2));
    await waitFor(() => expect(screen.queryByText('N-52')).not.toBeNull());

    // الآن تصل استجابة 2026 المتأخرة — يجب أن تُهمَل تمامًا.
    await act(async () => { releaseFirst!(); await firstPending; });

    expect(screen.queryByText('N-52')).not.toBeNull();      // نتيجة 2025 صامدة
    expect(screen.queryByText('N-9001')).toBeNull();        // القديمة لم تدهسها
    expect(screen.queryByText('N-9002')).toBeNull();
  });
});
