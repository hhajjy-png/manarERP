// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter } from 'react-router-dom';
import { ROUTER_FUTURE } from './helpers/router';

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

// One computed row (full workflow) + two imported salary-transfer rows (read-only, net-only).
const COMPUTED_ROW = {
  id: 1, source: 'COMPUTED', isReadOnly: false, breakdownAvailable: true,
  employee: { id: 10, code: 'E1', fullName: 'أحمد' }, employeeName: 'أحمد',
  month: 6, year: 2025, snapshotBaseSalary: 400, baseSalary: 400, grossSalary: 450, netSalary: 420,
  totalAllowances: 50, totalDeductions: 20, totalAdvances: 10, overtimeHours: 0, overtimeAmount: 0,
  status: 'APPROVED', paidAt: null, lines: [],
};
const IMPORTED_ROW = {
  id: 'imported:5', source: 'IMPORTED_TRANSFER', isReadOnly: true, breakdownAvailable: false,
  employee: { id: null, code: null, fullName: 'خالد المستورد' }, employeeName: 'خالد المستورد',
  month: 6, year: 2025, snapshotBaseSalary: null, baseSalary: null, grossSalary: null, netSalary: 1234.567,
  totalAllowances: null, totalDeductions: null, totalAdvances: null, overtimeHours: null, overtimeAmount: null,
  status: 'IMPORTED_TRANSFER', paidAt: null, paymentDate: '2025-06-30', bankName: 'NBK', transactionId: 'TX-9', lines: [],
};

const STATS = { count: 2, gross: 450, net: 1654.567, paid: 2, importedCount: 1, grossIsPartial: true };
const META = { total: 2, page: 1, pageSize: 12, totalPages: 1 };

let ROWS: unknown[] = [COMPUTED_ROW, IMPORTED_ROW];

function routeGet(url: string) {
  if (url === '/payroll/stats') return Promise.resolve({ data: { data: STATS } });
  if (url === '/payroll') return Promise.resolve({ data: { data: { data: ROWS, meta: META } } });
  if (url === '/employees') return Promise.resolve({ data: { data: { data: [] } } });
  if (url === '/salaries') return Promise.resolve({ data: { data: { data: [], meta: null } } });
  return Promise.resolve({ data: { data: {} } });
}

function renderPage() {
  return render(<MemoryRouter future={ROUTER_FUTURE}><Salaries /></MemoryRouter>);
}

beforeEach(() => {
  localStorage.clear();
  mockGet.mockReset();
  ROWS = [COMPUTED_ROW, IMPORTED_ROW];
  mockGet.mockImplementation(routeGet);
});
afterEach(cleanup);

describe('Salaries — historical imported salary transfers', () => {
  it('renders the imported beneficiary name and net amount with a source badge', async () => {
    renderPage();
    expect(await screen.findByText('خالد المستورد')).toBeInTheDocument();
    // Source badge visible.
    expect(screen.getAllByText('من سجل التحويل المستورد').length).toBeGreaterThan(0);
    // Net formatted with Western digits, thousands separator, 3 decimals, KWD.
    expect(screen.getByText(/1,234\.567\s*KWD/)).toBeInTheDocument();
  });

  it('does not render fake zeros for the unavailable breakdown of imported rows', async () => {
    renderPage();
    const nameCell = await screen.findByText('خالد المستورد');
    const row = nameCell.closest('tr')!;
    // Base / gross / deductions cells show an em-dash, not "0.000".
    expect(within(row).getAllByText('—').length).toBeGreaterThanOrEqual(3);
    expect(within(row).queryByText(/0\.000/)).not.toBeInTheDocument();
  });

  it('exposes no payroll workflow actions in the imported row drawer', async () => {
    renderPage();
    const row = await screen.findByRole('button', { name: 'تفاصيل راتب خالد المستورد' });
    fireEvent.click(row);
    // Read-only note present; no approve / pay / payslip / cancel actions.
    expect(await screen.findByText(/تفاصيل مكونات الراتب غير متوفرة/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /اعتماد|approve/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /صرف|pay/i })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('طريقة الدفع')).not.toBeInTheDocument();
  });

  it('retains workflow actions for computed rows', async () => {
    renderPage();
    const row = await screen.findByRole('button', { name: 'تفاصيل راتب أحمد' });
    fireEvent.click(row);
    // APPROVED computed row still offers the payslip action.
    expect(screen.getAllByRole('button').some((b) => /كشف|payslip|receipt/i.test(b.textContent || ''))).toBe(true);
  });

  it('renders mixed sources without duplicating an employee', async () => {
    renderPage();
    await screen.findByText('أحمد');
    expect(screen.getAllByText('أحمد')).toHaveLength(1);
    expect(screen.getAllByText('خالد المستورد')).toHaveLength(1);
  });

  it('shows the standard empty state when a month has no rows at all', async () => {
    ROWS = [];
    renderPage();
    expect(await screen.findByText('لا توجد مسيرات')).toBeInTheDocument();
  });
});
