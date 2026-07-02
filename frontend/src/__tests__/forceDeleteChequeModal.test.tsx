// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import '@testing-library/jest-dom';

// Mock the api client the modal talks to.
vi.mock('../api/client', () => ({
  api: { get: vi.fn(), delete: vi.fn() },
  errorMessage: (e: unknown) => String(e),
}));

import { api } from '../api/client';
import ForceDeleteChequeModal from '../components/ForceDeleteChequeModal';

const PREVIEW = {
  id: 1,
  chequeNumber: 'CHQ-001',
  beneficiaryName: 'شركة الاختبار',
  amount: 500.75,
  currency: 'KWD',
  bankName: 'NBK',
  chequeDate: '2026-06-27T00:00:00.000Z',
  status: 'PRINTED',
  printedAt: '2026-06-28T00:00:00.000Z',
  cancelledAt: null,
  paymentVoucherNumber: 'PV-000005',
  hasPaymentVoucher: true,
  bankMatchesCount: 2,
  willBeDeleted: ['سجل الشيك'],
  warnings: ['صدر لهذا الشيك سند صرف رقم PV-000005 — لن يُعاد استخدام هذا الرقم بعد الحذف'],
};

describe('ForceDeleteChequeModal', () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(cleanup);

  it('keeps the delete button disabled until the exact cheque number is typed, then deletes', async () => {
    vi.mocked(api.get).mockResolvedValue({ data: { data: PREVIEW } } as any);
    vi.mocked(api.delete).mockResolvedValue({ data: { data: { deleted: true } } } as any);
    const onDeleted = vi.fn();

    render(<ForceDeleteChequeModal chequeId={1} onClose={() => {}} onDeleted={onDeleted} />);

    // Preview loads via GET /cheques/:id/force
    const input = await screen.findByPlaceholderText('CHQ-001');
    expect(api.get).toHaveBeenCalledWith('/cheques/1/force');

    const deleteBtn = screen.getByRole('button', { name: /تأكيد الحذف النهائي/ });
    expect(deleteBtn).toBeDisabled();

    // Wrong value → still disabled
    fireEvent.change(input, { target: { value: 'CHQ-999' } });
    expect(deleteBtn).toBeDisabled();

    // Exact match → enabled
    fireEvent.change(input, { target: { value: 'CHQ-001' } });
    expect(deleteBtn).not.toBeDisabled();

    fireEvent.click(deleteBtn);

    await waitFor(() => expect(api.delete).toHaveBeenCalledWith('/cheques/1/force', { data: { confirmation: 'CHQ-001' } }));
    await waitFor(() => expect(onDeleted).toHaveBeenCalled());
  });

  it('surfaces the stronger warning for a printed cheque that has a payment voucher', async () => {
    vi.mocked(api.get).mockResolvedValue({ data: { data: PREVIEW } } as any);

    render(<ForceDeleteChequeModal chequeId={1} onClose={() => {}} onDeleted={() => {}} />);

    await screen.findByPlaceholderText('CHQ-001');
    expect(screen.getByText(/تنبيه مشدّد/)).toBeInTheDocument();
    expect(screen.getAllByText(/PV-000005/).length).toBeGreaterThan(0);
  });
});
