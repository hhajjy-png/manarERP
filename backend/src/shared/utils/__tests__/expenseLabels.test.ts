import { describe, it, expect } from 'vitest';
import {
  expenseCategoryAr,
  expenseStatusAr,
  glPaymentMethodAr,
  EXPENSE_CATEGORY_AR,
} from '../expenseLabels';
import { ENUMS } from '../../../config/constants';

describe('expenseLabels — presentation-only Arabic dictionary', () => {
  it('maps known category codes to Arabic', () => {
    expect(expenseCategoryAr('FUEL')).toBe('وقود');
    expect(expenseCategoryAr('RENT')).toBe('إيجارات');
    expect(expenseCategoryAr('HASSAN')).toBe('مصروف عن طريق حسن');
  });

  it('covers every ENUMS.expenseCategory code (no missing labels)', () => {
    for (const code of ENUMS.expenseCategory) {
      expect(EXPENSE_CATEGORY_AR[code], `missing label for ${code}`).toBeTruthy();
    }
  });

  it('falls back to the raw code for unknown/empty categories', () => {
    expect(expenseCategoryAr('NOT_A_CODE')).toBe('NOT_A_CODE');
    expect(expenseCategoryAr(null)).toBe('');
    expect(expenseCategoryAr(undefined)).toBe('');
  });

  it('maps every expense status to Arabic', () => {
    expect(expenseStatusAr('PENDING')).toBe('معلّق');
    expect(expenseStatusAr('APPROVED')).toBe('معتمد');
    expect(expenseStatusAr('REJECTED')).toBe('مرفوض');
    expect(expenseStatusAr('REVERSED')).toBe('مُلغى الاعتماد');
    expect(expenseStatusAr('CANCELLED')).toBe('ملغى');
    expect(expenseStatusAr('WHATEVER')).toBe('WHATEVER');
  });

  it('maps GL payment methods and defaults unknown/absent to cash', () => {
    expect(glPaymentMethodAr('CASH')).toBe('صرف نقدي');
    expect(glPaymentMethodAr('BANK')).toBe('تحويل بنكي');
    expect(glPaymentMethodAr('ACCOUNTS_PAYABLE')).toBe('ذمم مورد');
    expect(glPaymentMethodAr(undefined)).toBe('صرف نقدي');
    expect(glPaymentMethodAr('OTHER')).toBe('صرف نقدي');
  });
});
