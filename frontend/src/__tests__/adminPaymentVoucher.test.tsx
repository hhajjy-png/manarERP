// @vitest-environment jsdom
/**
 * Administrative Payment Voucher v1 — coverage per the release request:
 * card appears in Forms, manual entry reaches PaymentVoucherTemplate, the
 * page is fully independent of Cheque Management, and the print profile stays
 * the dedicated `payment-voucher` one (not `ready-paper`).
 */
import type { ReactNode } from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { ROUTER_FUTURE } from './helpers/router';

vi.mock('../api/client', () => ({
  api: { get: vi.fn(), post: vi.fn() },
  errorMessage: (e: unknown) => String(e),
}));

let capturedProfile: string | undefined;
vi.mock('../forms/shared/FormLayout', () => ({
  default: ({ children, profile, onPrintApiReady }: { children?: ReactNode; profile?: string; onPrintApiReady?: (api: { getNode: () => null; print: () => Promise<unknown> }) => void }) => {
    capturedProfile = profile;
    onPrintApiReady?.({ getNode: () => null, print: () => Promise.resolve({ outcome: 'success' }) });
    return <div data-testid="form-layout-stub">{children}</div>;
  },
}));

import { api } from '../api/client';
import { FORM_CARDS } from '../forms/shared/formsRegistry';
import AdminPaymentVoucher from '../pages/AdminPaymentVoucher';

function renderPage() {
  return render(
    <MemoryRouter future={ROUTER_FUTURE} initialEntries={['/forms/payment-voucher']}>
      <Routes>
        <Route path="/forms/payment-voucher" element={<AdminPaymentVoucher />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('Forms registry — Administrative Payment Voucher card', () => {
  it('is registered as an ops card that needs no employee selection', () => {
    const card = FORM_CARDS.find((c) => c.key === 'payment-voucher');
    expect(card).toBeTruthy();
    expect(card?.route).toBe('payment-voucher');
    expect(card?.requiresEmployee).toBe(false);
    expect(card?.category).toBe('ops');
  });
});

describe('AdminPaymentVoucher — manual entry reaches the reused PaymentVoucherTemplate', () => {
  afterEach(cleanup);

  it('typed field values render inside the SAME PaymentVoucherTemplate output', () => {
    renderPage();

    fireEvent.change(screen.getByLabelText('اسم المستفيد'), { target: { value: 'شركة الاختبار' } });
    fireEvent.change(screen.getByLabelText('المبلغ ( د.ك )'), { target: { value: '250.500' } });
    fireEvent.change(screen.getByLabelText('البيان / السبب'), { target: { value: 'دفعة مقاولين' } });
    fireEvent.change(screen.getByLabelText('البنك'), { target: { value: 'بنك الكويت الوطني' } });
    fireEvent.change(screen.getByLabelText('رقم الشيك'), { target: { value: '000123' } });
    fireEvent.click(screen.getByRole('radio', { name: 'تحويل' }));

    // Template renders the exact typed values — no cheque-fetched data involved.
    expect(screen.getByText('شركة الاختبار')).toBeInTheDocument();
    expect(screen.getByText(/250\.500/)).toBeInTheDocument();
    expect(screen.getByText('دفعة مقاولين')).toBeInTheDocument();
    expect(screen.getByText('000123')).toBeInTheDocument();
    // Payment method checkbox now reflects the manual selection (Transfer),
    // not the Cheques flow's hardcoded 'cheque' default. Appears twice: the
    // radio option label and the printed template's checkbox row.
    expect(screen.getAllByText('تحويل').length).toBeGreaterThanOrEqual(2);
  });

  it('uses the dedicated non-selectable "payment-voucher" print profile, not ready-paper or letterhead', () => {
    renderPage();
    expect(capturedProfile).toBe('payment-voucher');
  });

  it('never calls the Cheques API — fully independent of Cheque Management', () => {
    renderPage();
    fireEvent.change(screen.getByLabelText('اسم المستفيد'), { target: { value: 'X' } });
    fireEvent.change(screen.getByLabelText('المبلغ ( د.ك )'), { target: { value: '10' } });
    expect(api.get).not.toHaveBeenCalled();
    expect(api.post).not.toHaveBeenCalled();
  });

  it('pre-fills a client-side voucher number (no backend sequence call, matching other administrative forms)', () => {
    renderPage();
    const numberInput = screen.getByLabelText('رقم السند') as HTMLInputElement;
    expect(numberInput.value).toMatch(/^PV-\d{4}-\d{4}$/);
  });
});
