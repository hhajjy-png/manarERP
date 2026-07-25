// @vitest-environment jsdom
/**
 * Classic batch cheque printing (Cheque Multi-Selection & Batch Printing Pack v1 —
 * Provider Parity & Print Result Correctness).
 *
 * Covers: sequential ordering (one print at a time, never parallel), the real
 * print result gating the mark-printed confirm, and stopping the batch on a
 * cancelled/error print result with no premature printed-state update.
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
vi.mock('../utils/print', () => ({
  printCurrentViewWithResult: vi.fn(),
}));
vi.mock('../stores/authStore', () => ({
  useAuth: () => ({
    hasPermission: () => true,
    isSystemAdmin: () => true,
    user: { id: 1, username: 'admin', role: 'SYSTEM_ADMIN' },
  }),
}));
vi.mock('../lib/i18n', () => ({ useT: () => ({ t: (k: string) => k }) }));

import { api } from '../api/client';
import { printCurrentViewWithResult } from '../utils/print';
import Cheques from '../pages/Cheques';
import { FinancialPeriodProvider } from '../context/FinancialPeriodContext';

const CHEQUES = [
  { id: 1, chequeNumber: 'C-1', chequeDate: '2026-01-01', beneficiaryName: 'Ali', amount: 100, currency: 'KWD', description: null, bankName: 'بنك الخليج', status: 'DRAFT', printedAt: null, cancelledAt: null, notes: null, paymentVoucherNumber: null, createdAt: '2026-01-01' },
  { id: 2, chequeNumber: 'C-2', chequeDate: '2026-01-02', beneficiaryName: 'Sara', amount: 200, currency: 'KWD', description: null, bankName: 'بنك الخليج', status: 'DRAFT', printedAt: null, cancelledAt: null, notes: null, paymentVoucherNumber: null, createdAt: '2026-01-02' },
];

function mockApi() {
  vi.mocked(api.get).mockImplementation((url: string) => {
    if (url === '/cheques') return Promise.resolve({ data: { data: { data: CHEQUES, meta: { total: 2 } } } } as never);
    if (url === '/cheques/stats') return Promise.resolve({ data: { data: { total: 2, draft: 2, printed: 0, cancelled: 0 } } } as never);
    if (url === '/settings') return Promise.resolve({ data: { data: { settings: [] } } } as never);
    if (/^\/cheques\/\d+$/.test(url)) {
      const id = Number(url.split('/').pop());
      const c = CHEQUES.find((x) => x.id === id);
      return Promise.resolve({ data: { data: { ...c, status: 'PRINTED', printedAt: '2026-01-03' } } } as never);
    }
    return Promise.resolve({ data: { data: [] } } as never);
  });
  vi.mocked(api.post).mockResolvedValue({ data: { data: {} } } as never);
}

function renderPage() {
  return render(
    <FinancialPeriodProvider>
      <MemoryRouter future={ROUTER_FUTURE}><Cheques /></MemoryRouter>
    </FinancialPeriodProvider>,
  );
}

describe('Classic batch cheque printing', () => {
  beforeEach(() => { vi.clearAllMocks(); mockApi(); });
  afterEach(cleanup);

  it('prints sequentially, one item at a time, only marking printed after a real success', async () => {
    vi.mocked(printCurrentViewWithResult).mockResolvedValue({ outcome: 'success' });
    renderPage();

    const rowCheckboxes = await screen.findAllByRole('checkbox', { name: /a11y.cheque_select_row/ });
    fireEvent.click(rowCheckboxes[0]);
    fireEvent.click(rowCheckboxes[1]);

    fireEvent.click(screen.getByRole('button', { name: 'action.cheque.print_selected' }));
    await waitFor(() => expect(printCurrentViewWithResult).toHaveBeenCalledTimes(1));

    // Only ONE print call in flight for the first item before its tracking step resolves.
    expect(printCurrentViewWithResult).toHaveBeenCalledTimes(1);
    const confirmBtn = await screen.findByRole('button', { name: 'page.cheques.mark_printed' });
    fireEvent.click(confirmBtn);

    // Item 2 is printed only AFTER item 1's mark-printed call resolved.
    await waitFor(() => expect(printCurrentViewWithResult).toHaveBeenCalledTimes(2));
    expect(api.post).toHaveBeenCalledWith('/cheques/1/mark-printed');

    const confirmBtn2 = await screen.findByRole('button', { name: 'page.cheques.mark_printed' });
    fireEvent.click(confirmBtn2);
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/cheques/2/mark-printed'));
  });

  it('stops the batch and never marks printed when the print is cancelled', async () => {
    vi.mocked(printCurrentViewWithResult).mockResolvedValue({ outcome: 'cancelled', failureReason: 'Print job canceled' });
    renderPage();

    const rowCheckboxes = await screen.findAllByRole('checkbox', { name: /a11y.cheque_select_row/ });
    fireEvent.click(rowCheckboxes[0]);
    fireEvent.click(rowCheckboxes[1]);

    fireEvent.click(screen.getByRole('button', { name: 'action.cheque.print_selected' }));
    await waitFor(() => expect(printCurrentViewWithResult).toHaveBeenCalledTimes(1));

    expect(screen.queryByRole('button', { name: 'page.cheques.mark_printed' })).not.toBeInTheDocument();
    expect(api.post).not.toHaveBeenCalledWith('/cheques/1/mark-printed');
    expect(api.post).not.toHaveBeenCalledWith('/cheques/2/mark-printed');
    // Only the first item was ever attempted — the batch stopped, it never reached item 2.
    expect(printCurrentViewWithResult).toHaveBeenCalledTimes(1);
  });
});
