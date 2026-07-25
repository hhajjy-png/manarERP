// @vitest-environment jsdom
/**
 * Payment Voucher Batch Preview Navigator (Cheque Multi-Selection & Batch
 * Printing Pack v1) — same in-page pattern proven in ChequeTemplatePrintPage.
 *
 * An earlier version advanced the batch by navigating route-to-route
 * (`/forms/payment-voucher/:id` per item) and gated "Next"/"Finish" on a
 * successful print. That has been removed entirely: the page now opens ONCE
 * with the full batch in router state, and Previous/Next are pure in-page
 * index changes — never gated on printing, never printing or tracking
 * themselves. FormLayout is stubbed so the test controls exactly what
 * `printApiRef.current.print()` resolves with, isolating this page's own
 * navigator/print-status logic from the printing/preview machinery underneath.
 */
import type { ReactNode } from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { ROUTER_FUTURE } from './helpers/router';

vi.mock('../api/client', () => ({
  api: { get: vi.fn(), post: vi.fn() },
  errorMessage: (e: unknown) => String(e),
}));

let mockPrint: ReturnType<typeof vi.fn>;
vi.mock('../forms/shared/FormLayout', () => ({
  default: ({ onPrintApiReady, children }: { onPrintApiReady?: (api: { getNode: () => null; print: () => Promise<unknown> }) => void; children?: ReactNode }) => {
    onPrintApiReady?.({ getNode: () => null, print: () => mockPrint() });
    return <div data-testid="form-layout-stub">{children}</div>;
  },
}));

import { api } from '../api/client';
import PaymentVoucher from '../pages/PaymentVoucher';

interface Item {
  id: number;
  chequeNumber: string;
  chequeDate: string;
  beneficiaryName: string;
  amount: number;
  bankName: string;
  description: string | null;
  paymentVoucherNumber: string | null;
  status: string;
}

function makeItem(overrides: Partial<Item> & { id: number }): Item {
  return {
    chequeNumber: `C-${overrides.id}`,
    chequeDate: '2026-01-01',
    beneficiaryName: `Beneficiary-${overrides.id}`,
    amount: 100 * overrides.id,
    bankName: `Bank-${overrides.id}`,
    description: null,
    paymentVoucherNumber: `PV-${overrides.id}`,
    status: 'PRINTED',
    ...overrides,
  };
}

function renderBatchPage(items: Item[], firstId = items[0].id) {
  return render(
    <MemoryRouter future={ROUTER_FUTURE} initialEntries={[{ pathname: `/forms/payment-voucher/${firstId}`, state: { pvBatchItems: items } }]}>
      <Routes>
        <Route path="/forms/payment-voucher/:chequeId" element={<PaymentVoucher />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('PaymentVoucher — Batch Preview Navigator', () => {
  beforeEach(() => { vi.clearAllMocks(); mockPrint = vi.fn(); });
  afterEach(cleanup);

  const A = makeItem({ id: 1, beneficiaryName: 'AAA', chequeNumber: 'C-A', amount: 111, bankName: 'Bank-A', paymentVoucherNumber: 'PV-A' });
  const B = makeItem({ id: 2, beneficiaryName: 'BBB', chequeNumber: 'C-B', amount: 222, bankName: 'Bank-B', paymentVoucherNumber: 'PV-B' });
  const C = makeItem({ id: 3, beneficiaryName: 'CCC', chequeNumber: 'C-C', amount: 333, bankName: 'Bank-C', paymentVoucherNumber: 'PV-C' });

  it('Voucher A, B, C → A preview → Next → B (B data) → Next → C → Previous → B → Previous → A, no stale data', async () => {
    renderBatchPage([A, B, C]);
    await screen.findByTestId('form-layout-stub');

    // A renders.
    expect(screen.getByText('سند الصرف 1 من 3')).toBeInTheDocument();
    expect(screen.getByText('PV-A')).toBeInTheDocument();
    expect(screen.getByText('AAA')).toBeInTheDocument();
    expect(screen.getByText('C-A')).toBeInTheDocument();
    expect(screen.getByText('Bank-A')).toBeInTheDocument();

    // Next -> B.
    fireEvent.click(screen.getByRole('button', { name: 'التالي' }));
    expect(screen.getByText('سند الصرف 2 من 3')).toBeInTheDocument();
    expect(screen.getByText('PV-B')).toBeInTheDocument();
    expect(screen.getByText('BBB')).toBeInTheDocument();
    expect(screen.getByText('C-B')).toBeInTheDocument();
    expect(screen.getByText('Bank-B')).toBeInTheDocument();
    expect(screen.queryByText('AAA')).not.toBeInTheDocument();
    expect(screen.queryByText('PV-A')).not.toBeInTheDocument();

    // Next -> C.
    fireEvent.click(screen.getByRole('button', { name: 'التالي' }));
    expect(screen.getByText('سند الصرف 3 من 3')).toBeInTheDocument();
    expect(screen.getByText('PV-C')).toBeInTheDocument();
    expect(screen.getByText('CCC')).toBeInTheDocument();
    expect(screen.queryByText('BBB')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'التالي' })).toBeDisabled();

    // Previous -> B.
    fireEvent.click(screen.getByRole('button', { name: 'السابق' }));
    expect(screen.getByText('سند الصرف 2 من 3')).toBeInTheDocument();
    expect(screen.getByText('BBB')).toBeInTheDocument();
    expect(screen.queryByText('CCC')).not.toBeInTheDocument();

    // Previous -> A.
    fireEvent.click(screen.getByRole('button', { name: 'السابق' }));
    expect(screen.getByText('سند الصرف 1 من 3')).toBeInTheDocument();
    expect(screen.getByText('AAA')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'السابق' })).toBeDisabled();

    // Pure navigation never printed or allocated anything.
    expect(mockPrint).not.toHaveBeenCalled();
    expect(api.post).not.toHaveBeenCalled();
  });

  it('never skips or repeats a voucher across Next/Next/Previous/Previous', async () => {
    renderBatchPage([A, B, C]);
    await screen.findByTestId('form-layout-stub');

    const seen: string[] = [];
    const readActive = () => (screen.queryByText('AAA') ? 'A' : screen.queryByText('BBB') ? 'B' : screen.queryByText('CCC') ? 'C' : 'none');

    seen.push(readActive());
    fireEvent.click(screen.getByRole('button', { name: 'التالي' }));
    seen.push(readActive());
    fireEvent.click(screen.getByRole('button', { name: 'التالي' }));
    seen.push(readActive());
    fireEvent.click(screen.getByRole('button', { name: 'السابق' }));
    seen.push(readActive());
    fireEvent.click(screen.getByRole('button', { name: 'السابق' }));
    seen.push(readActive());

    expect(seen).toEqual(['A', 'B', 'C', 'B', 'A']);
  });

  it('printing voucher B calls the print API once and affects only B\'s status, not A or C', async () => {
    mockPrint.mockResolvedValue({ outcome: 'success' });
    renderBatchPage([A, B, C]);
    await screen.findByTestId('form-layout-stub');

    fireEvent.click(screen.getByRole('button', { name: 'التالي' })); // -> B
    fireEvent.click(screen.getByRole('button', { name: 'طباعة الشيك' }));
    await waitFor(() => expect(mockPrint).toHaveBeenCalledTimes(1));

    // B now shows "printed".
    await waitFor(() => expect(screen.getByText('تمت الطباعة')).toBeInTheDocument());

    // A and C remain untouched ("not printed").
    fireEvent.click(screen.getByRole('button', { name: 'السابق' })); // -> A
    expect(screen.getByText('غير مطبوع')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'التالي' }));
    fireEvent.click(screen.getByRole('button', { name: 'التالي' })); // -> C
    expect(screen.getByText('غير مطبوع')).toBeInTheDocument();

    expect(mockPrint).toHaveBeenCalledTimes(1);
  });

  it('per-item print status persists when navigating away and back', async () => {
    mockPrint.mockResolvedValue({ outcome: 'success' });
    renderBatchPage([A, B, C]);
    await screen.findByTestId('form-layout-stub');

    fireEvent.click(screen.getByRole('button', { name: 'طباعة الشيك' })); // print A
    await waitFor(() => expect(screen.getByText('تمت الطباعة')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'التالي' })); // -> B (idle)
    expect(screen.getByText('غير مطبوع')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'السابق' })); // back to A
    expect(screen.getByText('تمت الطباعة')).toBeInTheDocument();
  });

  it('cancel/error on the current item never advances navigation state and never marks printed', async () => {
    mockPrint.mockResolvedValue({ outcome: 'cancelled', failureReason: 'Print job canceled' });
    renderBatchPage([A, B, C]);
    await screen.findByTestId('form-layout-stub');

    fireEvent.click(screen.getByRole('button', { name: 'طباعة الشيك' }));
    await waitFor(() => expect(mockPrint).toHaveBeenCalledTimes(1));

    expect(screen.getByText('ألغيت')).toBeInTheDocument();
    // Previous/Next remain fully usable regardless of the failed print.
    expect(screen.getByRole('button', { name: 'التالي' })).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: 'التالي' }));
    expect(screen.getByText('BBB')).toBeInTheDocument();
  });

  it('an error result is reported distinctly and never marks printed', async () => {
    mockPrint.mockResolvedValue({ outcome: 'error', failureReason: 'Invalid printer settings' });
    renderBatchPage([A, B, C]);
    await screen.findByTestId('form-layout-stub');

    fireEvent.click(screen.getByRole('button', { name: 'طباعة الشيك' }));
    await waitFor(() => expect(screen.getByText('فشل')).toBeInTheDocument());
  });

  it('lazily assigns a voucher number for an item that lacks one, exactly once', async () => {
    const draftNoNumber = makeItem({ id: 9, paymentVoucherNumber: null, beneficiaryName: 'DDD' });
    vi.mocked(api.post).mockResolvedValue({ data: { data: { voucherNumber: 'PV-9' } } } as never);

    renderBatchPage([A, draftNoNumber]);
    await screen.findByTestId('form-layout-stub');

    fireEvent.click(screen.getByRole('button', { name: 'التالي' })); // -> item lacking a number
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/cheques/9/payment-voucher-number'));
    expect(await screen.findByText('PV-9')).toBeInTheDocument();

    // Navigating back and forth again must NOT allocate a second number.
    fireEvent.click(screen.getByRole('button', { name: 'السابق' }));
    fireEvent.click(screen.getByRole('button', { name: 'التالي' }));
    expect(api.post).toHaveBeenCalledTimes(1);
  });

  it('single (non-batch) Payment Voucher printing is unchanged — no navigator, existing fetch path used', async () => {
    vi.mocked(api.get).mockResolvedValue({ data: { data: A } } as never);

    render(
      <MemoryRouter future={ROUTER_FUTURE} initialEntries={[{ pathname: '/forms/payment-voucher/1' }]}>
        <Routes>
          <Route path="/forms/payment-voucher/:chequeId" element={<PaymentVoucher />} />
        </Routes>
      </MemoryRouter>,
    );

    await screen.findByTestId('form-layout-stub');
    expect(api.get).toHaveBeenCalledWith('/cheques/1');
    expect(screen.queryByRole('button', { name: 'التالي' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'السابق' })).not.toBeInTheDocument();
    expect(screen.queryByText(/سند الصرف \d+ من \d+/)).not.toBeInTheDocument();
    expect(api.post).not.toHaveBeenCalled();
  });
});
