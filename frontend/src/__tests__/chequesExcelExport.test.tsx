// @vitest-environment jsdom
/**
 * Cheques Reporting & Excel Export Pack v1 — frontend regression suite.
 *
 * Covers the Excel button on the Cheques screen (that it exists, follows the
 * project's Excel pattern, respects the live filters, and exports the WHOLE
 * filtered dataset rather than the visible page), the exported column set and
 * formatting, and the registration of «تقرير الشيكات» in the Reports screen.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter } from 'react-router-dom';
import { ROUTER_FUTURE } from './helpers/router';

vi.mock('../api/client', () => ({
  api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() },
  errorMessage: (e: unknown) => String(e),
}));
vi.mock('../utils/print', () => ({ printCurrentViewWithResult: vi.fn() }));
vi.mock('../stores/authStore', () => ({
  useAuth: () => ({
    hasPermission: () => true,
    isSystemAdmin: () => true,
    user: { id: 1, username: 'admin', role: 'SYSTEM_ADMIN' },
  }),
}));
vi.mock('../lib/i18n', () => ({ useT: () => ({ t: (k: string) => k }), t: (k: string) => k }));

// Capture what the shared export helper is handed, without writing a file.
// `vi.hoisted` so the spy exists before the hoisted `vi.mock` factory runs.
const { downloadTableExcelMock } = vi.hoisted(() => ({ downloadTableExcelMock: vi.fn() }));
vi.mock('../utils/exportUtils', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../utils/exportUtils')>();
  return { ...actual, downloadTableExcel: downloadTableExcelMock };
});

import { api } from '../api/client';
import Cheques from '../pages/Cheques';
import { FinancialPeriodProvider } from '../context/FinancialPeriodContext';

// ── Fixtures ─────────────────────────────────────────────────────────────────

/** 53 matching cheques over 3 server pages of 20 — the pagination case. */
const PAGE_SIZE = 20;
const TOTAL_MATCHING = 53;
const AMOUNT = 899.755;

function makeCheque(i: number) {
  return {
    id: i + 1,
    chequeNumber: String(i + 1).padStart(6, '0'),
    chequeDate: '2026-08-02T00:00:00.000Z',
    beneficiaryName: `مستفيد ${i + 1}`,
    amount: AMOUNT,
    currency: 'KWD',
    description: null,
    bankName: 'بنك الخليج',
    status: i % 3 === 0 ? 'DRAFT' : i % 3 === 1 ? 'PRINTED' : 'CANCELLED',
    printedAt: null,
    cancelledAt: null,
    notes: null,
    paymentVoucherNumber: i === 0 ? 'PV-1' : null,
    printCount: 0,
    createdAt: '2026-07-30T12:57:21.772Z',
    updatedAt: '2026-07-30T12:57:21.772Z',
  };
}
const ALL = Array.from({ length: TOTAL_MATCHING }, (_, i) => makeCheque(i));

/** Records every `/cheques` request so filter pass-through can be asserted. */
let chequeRequests: Record<string, unknown>[] = [];

function mockApi() {
  chequeRequests = [];
  vi.mocked(api.get).mockImplementation((url: string, config?: { params?: Record<string, unknown> }) => {
    const params = config?.params ?? {};
    if (url === '/cheques') {
      chequeRequests.push(params);
      const page = Number(params.page ?? 1);
      const size = Number(params.pageSize ?? PAGE_SIZE);
      const slice = ALL.slice((page - 1) * size, page * size);
      const totalPages = Math.ceil(TOTAL_MATCHING / size);
      return Promise.resolve({ data: { data: { data: slice, meta: { page, pageSize: size, total: TOTAL_MATCHING, totalPages } } } } as never);
    }
    if (url === '/cheques/stats') return Promise.resolve({ data: { data: { total: TOTAL_MATCHING, draft: 18, printed: 18, cancelled: 17 } } } as never);
    if (url === '/settings') return Promise.resolve({ data: { data: { settings: [{ key: 'cheques.defaultPrintProvider', value: 'classic' }] } } } as never);
    return Promise.resolve({ data: { data: [] } } as never);
  });
}

function renderPage() {
  return render(
    <FinancialPeriodProvider>
      <MemoryRouter future={ROUTER_FUTURE}><Cheques /></MemoryRouter>
    </FinancialPeriodProvider>,
  );
}

const excelButton = () => screen.getByRole('button', { name: 'Excel' });

/** Wait for the export call and return `[rows, columns, filename, sheet, totals]`. */
async function runExport() {
  fireEvent.click(excelButton());
  await waitFor(() => expect(downloadTableExcelMock).toHaveBeenCalled());
  return downloadTableExcelMock.mock.calls[0];
}

beforeEach(() => { vi.clearAllMocks(); downloadTableExcelMock.mockReset(); mockApi(); });
afterEach(cleanup);

// ── Button ───────────────────────────────────────────────────────────────────

describe('Excel button on the Cheques screen', () => {
  it('is rendered', async () => {
    renderPage();
    expect(await screen.findByRole('button', { name: 'Excel' })).toBeInTheDocument();
  });

  it('follows the project Excel pattern — table_view icon, secondary variant, Excel green', async () => {
    renderPage();
    const btn = await screen.findByRole('button', { name: 'Excel' });
    expect(btn.querySelector('.material-symbols-outlined')?.textContent).toBe('table_view');
    expect(btn.className).toContain('secondary');
    expect(btn.getAttribute('style')).toContain('rgb(33, 115, 70)'); // #217346
  });
});

// ── Filter semantics & full dataset ──────────────────────────────────────────

describe('Excel export — filters and dataset', () => {
  it('exports the WHOLE filtered dataset (53), not the visible page (20)', async () => {
    renderPage();
    await screen.findByRole('button', { name: 'Excel' });
    const [rows] = await runExport();
    expect(rows).toHaveLength(TOTAL_MATCHING);
    expect(rows).not.toHaveLength(PAGE_SIZE);
  });

  it('walks every page rather than inflating pageSize arbitrarily', async () => {
    renderPage();
    await screen.findByRole('button', { name: 'Excel' });
    await runExport();
    const exportPages = chequeRequests.filter((r) => Number(r.pageSize) === 200);
    expect(exportPages.length).toBeGreaterThanOrEqual(1);
    expect(exportPages.every((r) => Number(r.pageSize) <= 200)).toBe(true);
  });

  it('passes the live search and status filters to the server', async () => {
    renderPage();
    await screen.findByRole('button', { name: 'Excel' });
    fireEvent.change(screen.getByLabelText('action.search_placeholder'), { target: { value: 'الخليج' } });
    fireEvent.click(screen.getByRole('button', { name: 'cheque.status.printed' }));
    await waitFor(() => expect(chequeRequests.some((r) => r.status === 'PRINTED')).toBe(true));

    chequeRequests = [];
    await runExport();
    const exportReq = chequeRequests.find((r) => Number(r.pageSize) === 200)!;
    expect(exportReq.search).toBe('الخليج');
    expect(exportReq.status).toBe('PRINTED');
  });

  it('exports with the same sort the table is using', async () => {
    renderPage();
    await screen.findByRole('button', { name: 'Excel' });
    fireEvent.click(screen.getByRole('button', { name: /col.cheque.amount/ }));
    await waitFor(() => expect(chequeRequests.some((r) => r.sortBy === 'amount')).toBe(true));

    chequeRequests = [];
    await runExport();
    const exportReq = chequeRequests.find((r) => Number(r.pageSize) === 200)!;
    expect(exportReq.sortBy).toBe('amount');
  });

  it('never sends a print/tracking request while exporting', async () => {
    renderPage();
    await screen.findByRole('button', { name: 'Excel' });
    await runExport();
    expect(api.post).not.toHaveBeenCalled();
    expect(api.put).not.toHaveBeenCalled();
    expect(api.delete).not.toHaveBeenCalled();
  });
});

// ── Columns & formatting ─────────────────────────────────────────────────────

describe('Excel export — columns and formatting', () => {
  it('exports exactly the business-visible columns, in table order', async () => {
    renderPage();
    await screen.findByRole('button', { name: 'Excel' });
    const [, columns] = await runExport();
    expect((columns as { header: string }[]).map((c) => c.header)).toEqual([
      'col.cheque.number', 'col.cheque.beneficiary', 'col.cheque.bank',
      'col.cheque.amount', 'col.cheque.date', 'col.cheque.status', 'col.cheque.pv_number',
    ]);
  });

  it('exports no UI-only or internal technical column', async () => {
    renderPage();
    await screen.findByRole('button', { name: 'Excel' });
    const [, columns] = await runExport();
    const headers = (columns as { header: string }[]).map((c) => c.header).join('|');
    for (const forbidden of ['id', 'createdAt', 'updatedAt', 'printedAt', 'select', 'checkbox', 'actions', 'chevron']) {
      expect(headers.toLowerCase(), forbidden).not.toContain(forbidden.toLowerCase());
    }
  });

  it('takes the date from chequeDate and renders DD/MM/YYYY — 02/08/2026 = 2 August', async () => {
    renderPage();
    await screen.findByRole('button', { name: 'Excel' });
    const [rows, columns] = await runExport();
    const cols = columns as { header: string; value: (r: unknown) => unknown }[];
    const dateCol = cols.find((c) => c.header === 'col.cheque.date')!;
    expect(dateCol.value((rows as unknown[])[0])).toBe('02/08/2026');
    // createdAt is a different day — proves the source is chequeDate.
    expect(dateCol.value((rows as unknown[])[0])).not.toBe('30/07/2026');
  });

  it('never inverts day and month', async () => {
    renderPage();
    await screen.findByRole('button', { name: 'Excel' });
    const [, columns] = await runExport();
    const cols = columns as { header: string; value: (r: unknown) => unknown }[];
    const dateCol = cols.find((c) => c.header === 'col.cheque.date')!;
    expect(dateCol.value({ chequeDate: '2026-02-08T00:00:00.000Z' })).toBe('08/02/2026');
    expect(dateCol.value({ chequeDate: '2026-08-02T00:00:00.000Z' })).toBe('02/08/2026');
  });

  it('exports the amount as a raw calculable number flagged as money — never #…#', async () => {
    renderPage();
    await screen.findByRole('button', { name: 'Excel' });
    const [rows, columns] = await runExport();
    const cols = columns as { header: string; value: (r: unknown) => unknown; money?: boolean }[];
    const amountCol = cols.find((c) => c.header === 'col.cheque.amount')!;
    const value = amountCol.value((rows as unknown[])[0]);
    expect(amountCol.money).toBe(true);
    expect(typeof value).toBe('number');
    expect(value).toBe(AMOUNT);
    expect(String(value)).not.toContain('#');
  });

  it('exports the status with the screen’s own labels', async () => {
    renderPage();
    await screen.findByRole('button', { name: 'Excel' });
    const [, columns] = await runExport();
    const cols = columns as { header: string; value: (r: unknown) => unknown }[];
    const statusCol = cols.find((c) => c.header === 'col.cheque.status')!;
    expect(statusCol.value({ status: 'DRAFT' })).toBe('cheque.status.draft');
    expect(statusCol.value({ status: 'PRINTED' })).toBe('cheque.status.printed');
    expect(statusCol.value({ status: 'CANCELLED' })).toBe('cheque.status.cancelled');
  });

  it('uses the project export-filename convention with a Cheques report name', async () => {
    renderPage();
    await screen.findByRole('button', { name: 'Excel' });
    const [, , filename] = await runExport();
    expect(String(filename)).toMatch(/Cheques/);
    expect(String(filename)).toMatch(/\.xlsx$/);
  });
});

// ── Total ────────────────────────────────────────────────────────────────────

describe('Excel export — total', () => {
  it('appends a total over the WHOLE filtered dataset, as a number', async () => {
    renderPage();
    await screen.findByRole('button', { name: 'Excel' });
    const [, , , , totals] = await runExport();
    const tt = totals as { label: string; value: number; labelColumnHeader: string; valueColumnHeader: string };
    expect(tt.label).toBe('cheques.export.total');
    expect(tt.valueColumnHeader).toBe('col.cheque.amount');
    expect(typeof tt.value).toBe('number');
    // 53 × 899.755 — the full dataset, not the 20-row page.
    expect(tt.value).toBeCloseTo(TOTAL_MATCHING * AMOUNT, 3);
    expect(tt.value).not.toBeCloseTo(PAGE_SIZE * AMOUNT, 3);
  });

  it('matches what the report computes for the same dataset (SUM of amount)', async () => {
    renderPage();
    await screen.findByRole('button', { name: 'Excel' });
    const [rows, , , , totals] = await runExport();
    const reportStyleTotal = (rows as { amount: number }[]).reduce((s, r) => s + Number(r.amount ?? 0), 0);
    expect((totals as { value: number }).value).toBeCloseTo(reportStyleTotal, 3);
  });
});

// ── Reports screen registration ──────────────────────────────────────────────

describe('«تقرير الشيكات» in the Reports screen', () => {
  it('is registered with date + status filters and the real cheque statuses', async () => {
    const mod = await import('../pages/Reports');
    const src = String((mod as unknown as { default: { toString(): string } }).default);
    // The registry lives in module scope, so assert on the shipped source instead.
    const file = await import('fs').then((fs) => fs.readFileSync('src/pages/Reports.tsx', 'utf8'));
    expect(file).toContain("key: 'cheques'");
    expect(file).toContain("label: 'report.type.cheques'");
    expect(file).toContain("filters: ['date', 'status']");
    expect(file).toContain("['DRAFT', 'cheque.status.draft']");
    expect(file).toContain("['PRINTED', 'cheque.status.printed']");
    expect(file).toContain("['CANCELLED', 'cheque.status.cancelled']");
    expect(typeof src).toBe('string');
  });

  it('has Arabic and English labels for the report name and description', async () => {
    const file = await import('fs').then((fs) => fs.readFileSync('src/lib/i18n.ts', 'utf8'));
    expect(file).toContain("'report.type.cheques': 'تقرير الشيكات'");
    expect(file).toContain("'report.type.cheques': 'Cheques Report'");
    expect(file).toContain("'report.desc.cheques'");
    expect(file).toContain("'cheques.export.total': 'إجمالي مبالغ الشيكات'");
  });
});
