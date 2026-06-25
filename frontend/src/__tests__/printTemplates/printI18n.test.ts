import { describe, it, expect } from 'vitest';
import {
  translateInvoiceStatus,
  translatePaymentMethod,
  translateInvoiceDirection,
  translateRefType,
  translateDocumentState,
  formatArabicDate,
} from '../../print-templates/utils/printI18n';

describe('translateInvoiceStatus', () => {
  it('translates UNPAID', () => expect(translateInvoiceStatus('UNPAID')).toBe('غير مسددة'));
  it('translates PARTIAL', () => expect(translateInvoiceStatus('PARTIAL')).toBe('مسددة جزئياً'));
  it('translates PAID', () => expect(translateInvoiceStatus('PAID')).toBe('مسددة'));
  it('translates OVERDUE', () => expect(translateInvoiceStatus('OVERDUE')).toBe('متأخرة'));
  it('translates CANCELLED', () => expect(translateInvoiceStatus('CANCELLED')).toBe('ملغاة'));
  it('translates DRAFT', () => expect(translateInvoiceStatus('DRAFT')).toBe('مسودة'));
  it('translates APPROVED', () => expect(translateInvoiceStatus('APPROVED')).toBe('معتمد'));
  it('translates REJECTED', () => expect(translateInvoiceStatus('REJECTED')).toBe('مرفوض'));
  it('translates PENDING', () => expect(translateInvoiceStatus('PENDING')).toBe('قيد الانتظار'));
  it('translates PRINTED', () => expect(translateInvoiceStatus('PRINTED')).toBe('مطبوعة'));
  it('translates REVERSED', () => expect(translateInvoiceStatus('REVERSED')).toBe('معكوسة'));
  it('translates VOID', () => expect(translateInvoiceStatus('VOID')).toBe('لاغية'));
  it('returns raw string for unknown status', () =>
    expect(translateInvoiceStatus('UNKNOWN_XYZ')).toBe('UNKNOWN_XYZ'));
});

describe('translatePaymentMethod', () => {
  it('translates CASH', () => expect(translatePaymentMethod('CASH')).toBe('نقداً'));
  it('translates BANK', () => expect(translatePaymentMethod('BANK')).toBe('بنك'));
  it('translates CHEQUE', () => expect(translatePaymentMethod('CHEQUE')).toBe('شيك'));
  it('translates TRANSFER', () => expect(translatePaymentMethod('TRANSFER')).toBe('تحويل'));
  it('returns raw for unknown', () => expect(translatePaymentMethod('WIRE')).toBe('WIRE'));
});

describe('translateInvoiceDirection', () => {
  it('translates SALES', () => expect(translateInvoiceDirection('SALES')).toBe('نقليات عميل'));
  it('translates PURCHASE', () => expect(translateInvoiceDirection('PURCHASE')).toBe('مشتريات مورّد'));
  it('returns raw for unknown', () => expect(translateInvoiceDirection('INTERNAL')).toBe('INTERNAL'));
});

describe('translateRefType', () => {
  it('translates INVOICE', () => expect(translateRefType('INVOICE')).toBe('فاتورة'));
  it('translates PAYMENT', () => expect(translateRefType('PAYMENT')).toBe('دفعة'));
  it('translates EXPENSE', () => expect(translateRefType('EXPENSE')).toBe('مصروف'));
  it('translates JOURNAL_ENTRY', () => expect(translateRefType('JOURNAL_ENTRY')).toBe('قيد'));
  it('translates MANUAL', () => expect(translateRefType('MANUAL')).toBe('يدوي'));
  it('translates CONTRACT', () => expect(translateRefType('CONTRACT')).toBe('عقد'));
  it('returns raw for unknown', () => expect(translateRefType('UNKNOWN')).toBe('UNKNOWN'));
});

describe('translateDocumentState', () => {
  it('translates APPROVED', () => expect(translateDocumentState('APPROVED')).toBe('معتمد'));
  it('translates REJECTED', () => expect(translateDocumentState('REJECTED')).toBe('مرفوض'));
  it('translates DRAFT', () => expect(translateDocumentState('DRAFT')).toBe('مسودة'));
  it('translates CANCELLED', () => expect(translateDocumentState('CANCELLED')).toBe('ملغي'));
  it('translates PENDING', () => expect(translateDocumentState('PENDING')).toBe('قيد الانتظار'));
  it('returns raw for unknown', () => expect(translateDocumentState('UNKNOWN')).toBe('UNKNOWN'));
});

describe('formatArabicDate', () => {
  it('formats a Date object to a non-empty Arabic string', () => {
    const result = formatArabicDate(new Date('2026-01-15'));
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });
  it('formats a string date to a non-empty string', () => {
    const result = formatArabicDate('2026-06-25');
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });
  it('returns a string without throwing on invalid date', () => {
    const result = formatArabicDate('not-a-valid-date');
    expect(typeof result).toBe('string');
  });
});
