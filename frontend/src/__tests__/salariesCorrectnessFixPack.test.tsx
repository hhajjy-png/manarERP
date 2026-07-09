// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter } from 'react-router-dom';

// ── Mocks ────────────────────────────────────────────────────────────────────
vi.mock('../api/client', () => ({
  api: { get: vi.fn(), post: vi.fn(), patch: vi.fn() },
  errorMessage: (e: unknown) => String(e),
}));
vi.mock('../stores/authStore', () => ({
  useAuth: () => ({ hasPermission: () => true }),
}));

import Salaries from '../pages/Salaries';
import { api } from '../api/client';

const mockGet = api.get as unknown as ReturnType<typeof vi.fn>;
const mockPatch = api.patch as unknown as ReturnType<typeof vi.fn>;

// Period stats returned by the backend aggregate: 13 non-cancelled records, 4 paid —
// deliberately larger than the 2 rows on the current page, to prove the KPIs read stats.
const STATS = { count: 13, gross: 5000, net: 4200, paid: 4 };
const META = { total: 13, page: 1, pageSize: 12, totalPages: 2 };
const ROWS = [
  {
    id: 1, employee: { id: 10, code: 'E1', fullName: 'أحمد' }, month: 6, year: 2026,
    snapshotBaseSalary: 400, baseSalary: 400, grossSalary: 450, netSalary: 420,
    totalAllowances: 50, totalDeductions: 20, totalAdvances: 10, overtimeHours: 0,
    overtimeAmount: 0, status: 'APPROVED', paidAt: null, lines: [],
  },
  {
    id: 2, employee: { id: 11, code: 'E2', fullName: 'خالد' }, month: 6, year: 2026,
    snapshotBaseSalary: 500, baseSalary: 500, grossSalary: 560, netSalary: 520,
    totalAllowances: 60, totalDeductions: 30, totalAdvances: 10, overtimeHours: 0,
    overtimeAmount: 0, status: 'PAID', paidAt: '2026-06-30', lines: [],
  },
];

function routeGet(url: string) {
  if (url === '/payroll/stats') return Promise.resolve({ data: { data: STATS } });
  if (url === '/payroll') return Promise.resolve({ data: { data: { data: ROWS, meta: META } } });
  if (url === '/employees') return Promise.resolve({ data: { data: { data: [] } } });
  if (url === '/salaries') return Promise.resolve({ data: { data: { data: [], meta: null } } });
  return Promise.resolve({ data: { data: {} } });
}

function renderPage() {
  return render(<MemoryRouter><Salaries /></MemoryRouter>);
}

beforeEach(() => {
  localStorage.clear();
  mockGet.mockReset();
  mockPatch.mockReset();
  mockGet.mockImplementation(routeGet);
  mockPatch.mockResolvedValue({ data: { data: {} } });
});
afterEach(cleanup);

describe('Salaries — period-correct KPI totals (B)', () => {
  it('renders KPI totals from /payroll/stats, not from the current page rows', async () => {
    renderPage();
    // Records KPI shows the full period count (13), even though only 2 rows are on the page.
    expect(await screen.findByText('13')).toBeInTheDocument();
    expect(screen.getByText('4')).toBeInTheDocument(); // paid records
    expect(mockGet).toHaveBeenCalledWith('/payroll/stats', expect.objectContaining({
      params: expect.objectContaining({ month: expect.anything(), year: expect.anything() }),
    }));
  });

  it('does not refetch stats or change totals when paginating', async () => {
    renderPage();
    await screen.findByText('13');

    const statsCallsBefore = mockGet.mock.calls.filter((c) => c[0] === '/payroll/stats').length;

    // Advance to page 2 — the payroll list refetches, the stats do not.
    fireEvent.click(screen.getByRole('button', { name: /التالي|next/i }));

    await waitFor(() =>
      expect(mockGet.mock.calls.filter((c) => c[0] === '/payroll').length).toBeGreaterThan(1));
    const statsCallsAfter = mockGet.mock.calls.filter((c) => c[0] === '/payroll/stats').length;
    expect(statsCallsAfter).toBe(statsCallsBefore); // stats unaffected by page change
    expect(screen.getByText('13')).toBeInTheDocument(); // totals unchanged
  });

  it('shows a neutral fallback (not page-only totals) when stats fail', async () => {
    mockGet.mockImplementation((url: string) =>
      url === '/payroll/stats' ? Promise.reject(new Error('boom')) : routeGet(url));
    renderPage();

    // Records KPI must not fall back to rows.length (2); it shows the em-dash placeholder.
    await waitFor(() => expect(screen.getAllByText('—').length).toBeGreaterThan(0));
    expect(screen.queryByText('13')).not.toBeInTheDocument();
  });
});

describe('Salaries — payment method alignment (A)', () => {
  async function openPayDrawer() {
    renderPage();
    const row = await screen.findByRole('button', { name: 'تفاصيل راتب أحمد' }); // APPROVED row
    fireEvent.click(row);
    const select = await screen.findByLabelText('طريقة الدفع');
    return select as HTMLSelectElement;
  }

  it('offers only backend-supported methods (CASH / BANK / ACCOUNTS_PAYABLE)', async () => {
    const select = await openPayDrawer();
    const values = Array.from(select.options).map((o) => o.value);
    expect(values).toEqual(['CASH', 'BANK', 'ACCOUNTS_PAYABLE']);
  });

  it('does not render the unsupported CHEQUE / TRANSFER options', async () => {
    const select = await openPayDrawer();
    const values = Array.from(select.options).map((o) => o.value);
    expect(values).not.toContain('CHEQUE');
    expect(values).not.toContain('TRANSFER');
    expect(within(select).queryByText('شيك')).not.toBeInTheDocument();
    expect(within(select).queryByText('تحويل')).not.toBeInTheDocument();
  });

  it('submits only a backend-accepted paymentMethod to the pay endpoint', async () => {
    const select = await openPayDrawer();
    fireEvent.change(select, { target: { value: 'ACCOUNTS_PAYABLE' } });
    fireEvent.click(screen.getByRole('button', { name: /صرف|pay/i }));

    await waitFor(() => expect(mockPatch).toHaveBeenCalled());
    const [url, body] = mockPatch.mock.calls[0];
    expect(url).toBe('/payroll/1/pay');
    expect(['CASH', 'BANK', 'ACCOUNTS_PAYABLE']).toContain(body.paymentMethod);
    expect(body.paymentMethod).toBe('ACCOUNTS_PAYABLE');
  });
});
