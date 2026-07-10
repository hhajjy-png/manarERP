import { describe, it, expect } from 'vitest';
import { deriveInvoiceYearFromIssueDate } from '../invoiceNumber';

describe('deriveInvoiceYearFromIssueDate', () => {
  it('فاتورة 2024 → سنة رقم 2024', () => {
    expect(deriveInvoiceYearFromIssueDate('2024-12-15', 2026)).toBe(2024);
  });

  it('فاتورة 2026 → تبقى 2026 (النمط الحالي)', () => {
    expect(deriveInvoiceYearFromIssueDate('2026-03-01', 2026)).toBe(2026);
  });

  it('تاريخ فارغ/غير صالح → يستخدم الاحتياطي (سنة الجهاز)', () => {
    expect(deriveInvoiceYearFromIssueDate('', 2026)).toBe(2026);
    expect(deriveInvoiceYearFromIssueDate(undefined, 2026)).toBe(2026);
    expect(deriveInvoiceYearFromIssueDate('nonsense', 2025)).toBe(2025);
  });

  it('يقرأ السنة من مقطع التاريخ المحلي (لا انزلاق UTC)', () => {
    // 2024-12-31 محليًا يبقى 2024 (toISOString كان قد يعطي 2024-12-30 لكن السنة تبقى).
    expect(deriveInvoiceYearFromIssueDate('2024-12-31', 2026)).toBe(2024);
    expect(deriveInvoiceYearFromIssueDate('2025-01-01', 2026)).toBe(2025);
  });

  it('يرفض السنة خارج المدى المعقول', () => {
    expect(deriveInvoiceYearFromIssueDate('1899-01-01', 2026)).toBe(2026);
  });
});
