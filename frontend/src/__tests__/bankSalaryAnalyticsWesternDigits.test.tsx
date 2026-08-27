// @vitest-environment jsdom
/**
 * تحليلات الرواتب البنكية — عقد الأرقام اللاتينية (Western digits).
 *
 * الأعداد الصحيحة داخل جداول الصفحة (عدد المعاملات، عدد الموظفين، الترتيب،
 * إجمالي الصفوف) كانت تُنسَّق بـ `toLocaleString('ar-KW')` فتظهر بأرقام هندية:
 * ١١ / ١٤ / ١٦ / ١٧. المصدر أُصلح إلى `formatInteger` المشتركة (`lib/format`،
 * locale `en-US`) — نفس المُنسِّق الذي تستعمله المبالغ أصلًا.
 *
 * ما تثبته هذه المجموعة على الشاشة الحقيقية (لا على نص المصدر):
 *   • 11 / 14 / 16 / 17 تظهر بأرقام لاتينية داخل خلايا الجداول.
 *   • ولا يظهر أي رقم هندي (U+0660–U+0669) في أي خلية من خلايا الصفحة.
 * العربية واتجاه RTL والعناوين والقيم كما هي — التغيير عرضٌ فقط.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, cleanup, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter } from 'react-router-dom';
import { ROUTER_FUTURE } from './helpers/router';

vi.mock('../api/client', () => ({
  api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() },
  errorMessage: (e: unknown) => (e as { message?: string })?.message ?? String(e),
}));
vi.mock('../lib/i18n', () => ({
  useT: () => ({ t: (k: string) => k }),
  t: (k: string) => k,
}));

import { api } from '../api/client';
import BankSalaryAnalytics from '../pages/BankSalaryAnalytics';

/** الأرقام الهندية-العربية ٠١٢٣٤٥٦٧٨٩ — يجب ألا تظهر إطلاقًا. */
const ARABIC_INDIC_DIGITS = /[٠-٩۰-۹]/;

const ANALYTICS = {
  totalAmount: 52340.5,
  totalPayments: 17,
  uniqueEmployees: 14,
  months: [
    {
      sourceMonth: '2026-06', year: 2026, month: 6, totalAmount: 25000, count: 11,
      varianceFromPrev: null, employeeCount: 14, avg: 2272.727, highest: 3000, lowest: 1200,
    },
    {
      sourceMonth: '2026-07', year: 2026, month: 7, totalAmount: 27340.5, count: 16,
      varianceFromPrev: 9.36, employeeCount: 14, avg: 1708.781, highest: 3100, lowest: 1150,
    },
  ],
  topEmployees: [
    {
      civilId: '290010100123', beneficiaryName: 'أحمد علي', totalAmount: 9000,
      count: 16, avgAmount: 562.5, latestPaymentDate: '2026-07-25', employeeId: 5,
    },
    {
      civilId: null, beneficiaryName: 'خالد سعد', totalAmount: 7000,
      count: 11, avgAmount: 636.363, latestPaymentDate: null, employeeId: null,
    },
  ],
  latestImport: { importedAt: '2026-07-30', batchCount: 2, totalAmount: 27340.5 },
};

const TRANSACTIONS = {
  data: [
    {
      id: 1, transactionId: 'TX-001', sourceMonth: '2026-07', paymentDate: '2026-07-25',
      beneficiaryName: 'أحمد علي', amount: 600, civilId: '290010100123',
      matchedBy: null, status: 'MATCHED',
    },
  ],
  meta: { page: 1, pageSize: 25, total: 17, totalPages: 1 },
};

function mockApi() {
  (api.get as ReturnType<typeof vi.fn>).mockImplementation((url: string) => {
    if (url.includes('/analytics')) return Promise.resolve({ data: { data: ANALYTICS } });
    if (url.includes('/transactions')) return Promise.resolve({ data: { data: TRANSACTIONS } });
    return Promise.resolve({ data: { data: [] } });
  });
}

function renderPage() {
  return render(
    <MemoryRouter future={ROUTER_FUTURE}>
      <BankSalaryAnalytics />
    </MemoryRouter>,
  );
}

/** كل خلايا الجداول المعروضة على الشاشة. */
function tableCells(): HTMLElement[] {
  return Array.from(document.querySelectorAll('table td')) as HTMLElement[];
}

describe('BankSalaryAnalytics — أرقام لاتينية في الجداول', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockApi();
  });
  afterEach(cleanup);

  it('يعرض أعداد المعاملات والموظفين بأرقام لاتينية داخل الجداول', async () => {
    renderPage();
    await waitFor(() => expect(tableCells().length).toBeGreaterThan(0));

    const cellTexts = tableCells().map((c) => c.textContent ?? '');
    // 11 و16: عدد المعاملات (شهريًا + لكل موظف) · 14: عدد الموظفين · الترتيب 1/2.
    for (const expected of ['11', '14', '16']) {
      expect(cellTexts.some((txt) => txt.trim() === expected)).toBe(true);
    }
  });

  it('لا يعرض أي رقم هندي (١١ / ١٤ / ١٦ / ١٧) في خلايا الجداول', async () => {
    renderPage();
    await waitFor(() => expect(tableCells().length).toBeGreaterThan(0));

    for (const cell of tableCells()) {
      expect(cell.textContent ?? '').not.toMatch(ARABIC_INDIC_DIGITS);
    }
    for (const arabicIndic of ['١١', '١٤', '١٦', '١٧']) {
      expect(screen.queryByText(arabicIndic)).toBeNull();
    }
  });

  it('يعرض إجمالي عدد الصفوف (17) بأرقام لاتينية في ترويسة جدول المعاملات', async () => {
    renderPage();
    const count = await screen.findByText((_, el) =>
      el?.classList.contains('psa-table-count') === true && el.textContent === '(17)',
    );
    expect(count).toBeInTheDocument();
    expect(count.textContent ?? '').not.toMatch(ARABIC_INDIC_DIGITS);
  });

  it('يحافظ على العربية واتجاه RTL — التغيير عرض الأرقام فقط', async () => {
    const { container } = renderPage();
    await waitFor(() => expect(tableCells().length).toBeGreaterThan(0));

    expect(container.querySelector('.psa-ws')).toHaveAttribute('dir', 'rtl');
    const nameCell = tableCells().find((c) => (c.textContent ?? '').includes('أحمد علي'));
    expect(nameCell).toBeDefined();
    expect(within(nameCell as HTMLElement).getByText(/أحمد علي/)).toBeInTheDocument();
  });
});
