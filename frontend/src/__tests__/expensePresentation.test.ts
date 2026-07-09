import { describe, it, expect } from 'vitest';
import {
  EXPENSE_STATUS_META,
  expenseStatusMeta,
  expenseStatusAr,
  expensePaymentMethodAr,
  EXPENSE_PAYMENT_METHOD_OPTIONS,
} from '../config/expensePresentation';

describe('expensePresentation — status meta', () => {
  it('exposes meta for all five expense statuses', () => {
    for (const s of ['PENDING', 'APPROVED', 'REJECTED', 'REVERSED', 'CANCELLED']) {
      expect(EXPENSE_STATUS_META[s]).toBeTruthy();
      expect(EXPENSE_STATUS_META[s].key).toMatch(/^exp\.status\./);
      expect(EXPENSE_STATUS_META[s].ar).toBeTruthy();
    }
  });

  it('returns a safe fallback for unknown status', () => {
    const meta = expenseStatusMeta('NOPE');
    expect(meta.tone).toBe('neutral');
    expect(meta.icon).toBe('help');
  });

  it('gives direct Arabic labels with raw-code fallback', () => {
    expect(expenseStatusAr('APPROVED')).toBe('معتمد');
    expect(expenseStatusAr('REVERSED')).toBe('مُلغى الاعتماد');
    expect(expenseStatusAr('XYZ')).toBe('XYZ');
    expect(expenseStatusAr(null)).toBe('');
  });
});

describe('expensePresentation — payment method', () => {
  it('maps the GL/UI payment codes to Arabic', () => {
    expect(expensePaymentMethodAr('CASH')).toBe('نقداً');
    expect(expensePaymentMethodAr('BANK')).toBe('تحويل بنكي');
    expect(expensePaymentMethodAr('ACCOUNTS_PAYABLE')).toBe('ذمم الموردين');
  });

  it('defaults unknown/absent methods to cash', () => {
    expect(expensePaymentMethodAr(undefined)).toBe('نقداً');
    expect(expensePaymentMethodAr('WHATEVER')).toBe('نقداً');
  });

  it('exposes ordered select options matching the label map', () => {
    expect(EXPENSE_PAYMENT_METHOD_OPTIONS.map((o) => o.value)).toEqual([
      'CASH', 'BANK', 'ACCOUNTS_PAYABLE',
    ]);
    for (const o of EXPENSE_PAYMENT_METHOD_OPTIONS) {
      expect(o.label).toBe(expensePaymentMethodAr(o.value));
    }
  });
});
