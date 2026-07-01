// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import '@testing-library/jest-dom';
import PrintProfileToggle from '../forms/shared/PrintProfileToggle';
import { PRINT_PROFILES, SELECTABLE_PROFILE_IDS } from '../forms/shared/printProfiles';

afterEach(cleanup);

// Regression test for the "سند قبض / سند صرف appear on every form" bug.
//
// Root cause: PrintProfileToggle used to iterate over ALL PRINT_PROFILES keys,
// so the two document-specific voucher profiles (سند صرف / سند قبض) rendered as
// selectable buttons on every HR/ops form that shows the toggle — Return To Work,
// Employment Contract, Salary Certificate, Leave Request, etc.
//
// Fix: only profiles flagged `selectable` (the general A4 / letterhead shells) are
// offered by the toggle. The voucher profiles remain available as margin presets
// for their own dedicated pages (PaymentVoucher / ReceiptVoucher), which do not
// render this toggle at all.

const VOUCHER_LABELS = ['سند صرف', 'سند قبض'];
const SHELL_LABELS = ['A4 عادي', 'ورق الشركة الرسمي'];

describe('PrintProfileToggle — voucher profiles are isolated from forms', () => {
  it('never renders سند قبض / سند صرف as switchable options', () => {
    render(<PrintProfileToggle profile="plain-a4" onChange={() => {}} />);
    for (const label of VOUCHER_LABELS) {
      expect(screen.queryByText(label)).toBeNull();
    }
  });

  it('renders only the general document shells (A4 / letterhead)', () => {
    render(<PrintProfileToggle profile="plain-a4" onChange={() => {}} />);
    for (const label of SHELL_LABELS) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
    // Exactly the selectable shells — no more, no fewer.
    expect(screen.getAllByRole('button')).toHaveLength(SELECTABLE_PROFILE_IDS.length);
    expect(SELECTABLE_PROFILE_IDS).toEqual(['plain-a4', 'letterhead']);
  });
});

describe('printProfiles — selectable invariant', () => {
  it('marks the voucher profiles as NOT user-selectable', () => {
    expect(PRINT_PROFILES['payment-voucher'].selectable).toBe(false);
    expect(PRINT_PROFILES['receipt-voucher'].selectable).toBe(false);
  });

  it('marks the general document shells as user-selectable', () => {
    expect(PRINT_PROFILES['plain-a4'].selectable).toBe(true);
    expect(PRINT_PROFILES['letterhead'].selectable).toBe(true);
  });

  it('excludes every voucher profile from the selectable set', () => {
    expect(SELECTABLE_PROFILE_IDS).not.toContain('payment-voucher');
    expect(SELECTABLE_PROFILE_IDS).not.toContain('receipt-voucher');
  });
});
