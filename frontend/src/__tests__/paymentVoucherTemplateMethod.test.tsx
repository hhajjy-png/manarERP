// @vitest-environment jsdom
/**
 * PaymentVoucherTemplate — `paymentMethod` prop (Administrative Payment
 * Voucher v1 pack). The Cheques module's page never passes this prop, so its
 * default MUST keep marking "Cheque" exactly as before the pack — this is the
 * no-regression guarantee for `pages/PaymentVoucher.tsx`.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import '@testing-library/jest-dom';
import PaymentVoucherTemplate from '../forms/PaymentVoucherTemplate';

const BASE = {
  voucherNumber: 'PV-2026-0001',
  beneficiaryName: 'Test Beneficiary',
  amount: 100,
  chequeDate: '2026-01-01',
  description: 'Test',
  bankName: 'Test Bank',
  chequeNumber: '000001',
};

describe('PaymentVoucherTemplate — default paymentMethod (Cheques flow, no regression)', () => {
  afterEach(cleanup);

  it('with no paymentMethod prop passed (existing Cheques usage), "Cheque" is marked and bold', () => {
    render(<PaymentVoucherTemplate {...BASE} />);
    expect(screen.getByText('شيك')).toHaveStyle({ fontWeight: '700' });
    expect(screen.getByText('نقداً')).not.toHaveStyle({ fontWeight: '700' });
    expect(screen.getByText('تحويل')).not.toHaveStyle({ fontWeight: '700' });
  });
});

describe('PaymentVoucherTemplate — paymentMethod prop (Administrative Payment Voucher)', () => {
  afterEach(cleanup);

  it('paymentMethod="cash" marks Cash instead of Cheque', () => {
    render(<PaymentVoucherTemplate {...BASE} paymentMethod="cash" />);
    expect(screen.getByText('نقداً')).toHaveStyle({ fontWeight: '700' });
    expect(screen.getByText('شيك')).not.toHaveStyle({ fontWeight: '700' });
  });

  it('paymentMethod="transfer" marks Transfer instead of Cheque', () => {
    render(<PaymentVoucherTemplate {...BASE} paymentMethod="transfer" />);
    expect(screen.getByText('تحويل')).toHaveStyle({ fontWeight: '700' });
    expect(screen.getByText('شيك')).not.toHaveStyle({ fontWeight: '700' });
  });
});
