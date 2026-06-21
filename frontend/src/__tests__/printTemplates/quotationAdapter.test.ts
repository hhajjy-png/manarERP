import { describe, it, expect } from 'vitest';
import {
  adaptFormToQuotationPrintData,
  validateQuotationPrintData,
} from '../../print-templates/integration/quotationPreviewIntegration';
import type { QuotationPrintFields } from '../../forms/QuotationTemplate';
import { getPrintTemplates } from '../../print-templates/engine/registry';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const BASE_FIELDS: QuotationPrintFields = {
  quotationNumber: 'MNR-Q-2026-001',
  date: '2026-06-01',
  validUntil: '2026-07-01',
  currency: 'KWD',
  subject: 'أعمال رصف وتسوية',
  customerName: 'شركة الاختبار للمقاولات',
  contactPerson: '',
  phone: '',
  project: '',
  items: [
    { id: '1', description: 'طبقة إسفلت سميكة', qty: '100', unit: 'طن', unitPrice: '25' },
    { id: '2', description: 'أعمال تسوية', qty: '50', unit: 'م²', unitPrice: '10' },
  ],
  notes: '',
  paymentTerms: 'الدفع خلال 30 يوماً من تاريخ الفاتورة',
};

// ─── adaptFormToQuotationPrintData ────────────────────────────────────────────

describe('adaptFormToQuotationPrintData', () => {
  it('maps basic fields correctly', () => {
    const data = adaptFormToQuotationPrintData(BASE_FIELDS);
    expect(data.quotationNumber).toBe('MNR-Q-2026-001');
    expect(data.customerName).toBe('شركة الاختبار للمقاولات');
    expect(data.subject).toBe('أعمال رصف وتسوية');
  });

  it('computes grand total from line items', () => {
    const data = adaptFormToQuotationPrintData(BASE_FIELDS);
    expect(data.grandTotal).toBe(3000); // 100*25 + 50*10
    expect(data.subtotal).toBe(3000);
  });

  it('maps line items with correct numbers, qty, unitPrice, total', () => {
    const data = adaptFormToQuotationPrintData(BASE_FIELDS);
    expect(data.lineItems).toHaveLength(2);
    expect(data.lineItems[0].number).toBe(1);
    expect(data.lineItems[0].quantity).toBe(100);
    expect(data.lineItems[0].unitPrice).toBe(25);
    expect(data.lineItems[0].total).toBe(2500);
    expect(data.lineItems[1].number).toBe(2);
    expect(data.lineItems[1].total).toBe(500);
  });

  it('converts paymentTerms to terms array when non-empty', () => {
    const data = adaptFormToQuotationPrintData(BASE_FIELDS);
    expect(data.terms).toEqual(['الدفع خلال 30 يوماً من تاريخ الفاتورة']);
  });

  it('terms is undefined when paymentTerms is empty', () => {
    const data = adaptFormToQuotationPrintData({ ...BASE_FIELDS, paymentTerms: '' });
    expect(data.terms).toBeUndefined();
  });

  it('maps contactPerson to attention when non-empty', () => {
    const data = adaptFormToQuotationPrintData({ ...BASE_FIELDS, contactPerson: 'م. محمد العلي' });
    expect(data.attention).toBe('م. محمد العلي');
  });

  it('attention is undefined when contactPerson is empty', () => {
    const data = adaptFormToQuotationPrintData({ ...BASE_FIELDS, contactPerson: '' });
    expect(data.attention).toBeUndefined();
  });

  it('maps project to projectName when non-empty', () => {
    const data = adaptFormToQuotationPrintData({ ...BASE_FIELDS, project: 'مشروع الجادة الجنوبية' });
    expect(data.projectName).toBe('مشروع الجادة الجنوبية');
  });

  it('projectName is undefined when project is empty', () => {
    const data = adaptFormToQuotationPrintData({ ...BASE_FIELDS, project: '' });
    expect(data.projectName).toBeUndefined();
  });

  it('uses fallback validity string when validUntil is empty', () => {
    const data = adaptFormToQuotationPrintData({ ...BASE_FIELDS, validUntil: '' });
    expect(data.validity).toBe('30 يوماً من تاريخ العرض');
  });

  it('formats validUntil date when present', () => {
    const data = adaptFormToQuotationPrintData(BASE_FIELDS);
    expect(data.validity).toMatch(/\d{2} \/ \d{2} \/ \d{4}/);
  });

  it('notes is undefined when empty', () => {
    const data = adaptFormToQuotationPrintData({ ...BASE_FIELDS, notes: '' });
    expect(data.notes).toBeUndefined();
  });

  it('maps notes when non-empty', () => {
    const data = adaptFormToQuotationPrintData({ ...BASE_FIELDS, notes: 'الأسعار شاملة ضريبة القيمة المضافة' });
    expect(data.notes).toBe('الأسعار شاملة ضريبة القيمة المضافة');
  });

  it('includes default company data', () => {
    const data = adaptFormToQuotationPrintData(BASE_FIELDS);
    expect(data.company).toBeDefined();
    expect(data.company.nameAr).toContain('المنار');
  });

  it('handles items with unparseable qty/price (empty strings) without crashing', () => {
    const fields: QuotationPrintFields = {
      ...BASE_FIELDS,
      items: [{ id: '1', description: 'بند فارغ', qty: '', unit: '', unitPrice: '' }],
    };
    const data = adaptFormToQuotationPrintData(fields);
    expect(data.grandTotal).toBe(0);
    expect(data.lineItems[0].quantity).toBe(0);
    expect(data.lineItems[0].unitPrice).toBe(0);
    expect(data.lineItems[0].total).toBe(0);
  });

  it('handles items with non-numeric strings gracefully', () => {
    const fields: QuotationPrintFields = {
      ...BASE_FIELDS,
      items: [{ id: '1', description: 'بند', qty: 'abc', unit: 'طن', unitPrice: 'xyz' }],
    };
    const data = adaptFormToQuotationPrintData(fields);
    expect(data.grandTotal).toBe(0);
    expect(() => adaptFormToQuotationPrintData(fields)).not.toThrow();
  });

  it('assigns discount as 0 (no discount in form)', () => {
    const data = adaptFormToQuotationPrintData(BASE_FIELDS);
    expect(data.discount).toBe(0);
  });
});

// ─── validateQuotationPrintData ───────────────────────────────────────────────

describe('validateQuotationPrintData', () => {
  it('returns no warnings for complete valid data', () => {
    const data = adaptFormToQuotationPrintData(BASE_FIELDS);
    const warnings = validateQuotationPrintData(data);
    expect(warnings).toHaveLength(0);
  });

  it('returns warning for missing quotationNumber', () => {
    const data = adaptFormToQuotationPrintData({ ...BASE_FIELDS, quotationNumber: '' });
    const warnings = validateQuotationPrintData(data);
    expect(warnings.some((w) => w.field === 'quotationNumber')).toBe(true);
  });

  it('returns warning for missing customerName', () => {
    const data = adaptFormToQuotationPrintData({ ...BASE_FIELDS, customerName: '' });
    const warnings = validateQuotationPrintData(data);
    expect(warnings.some((w) => w.field === 'customerName')).toBe(true);
  });

  it('returns warning for missing subject', () => {
    const data = adaptFormToQuotationPrintData({ ...BASE_FIELDS, subject: '' });
    const warnings = validateQuotationPrintData(data);
    expect(warnings.some((w) => w.field === 'subject')).toBe(true);
  });

  it('returns warning when grandTotal is zero', () => {
    const fields: QuotationPrintFields = {
      ...BASE_FIELDS,
      items: [{ id: '1', description: 'بند', qty: '0', unit: 'طن', unitPrice: '0' }],
    };
    const data = adaptFormToQuotationPrintData(fields);
    const warnings = validateQuotationPrintData(data);
    expect(warnings.some((w) => w.field === 'grandTotal')).toBe(true);
  });

  it('validation never throws — even with fully empty fields', () => {
    const fields: QuotationPrintFields = {
      ...BASE_FIELDS,
      quotationNumber: '',
      customerName: '',
      subject: '',
      items: [],
    };
    const data = adaptFormToQuotationPrintData(fields);
    expect(() => validateQuotationPrintData(data)).not.toThrow();
  });

  it('warning messageAr is a non-empty Arabic string', () => {
    const data = adaptFormToQuotationPrintData({ ...BASE_FIELDS, customerName: '' });
    const warnings = validateQuotationPrintData(data);
    const w = warnings.find((x) => x.field === 'customerName');
    expect(w?.messageAr.length).toBeGreaterThan(0);
  });
});

// ─── Registry smoke test ───────────────────────────────────────────────────────

describe('quotation registry (smoke)', () => {
  it('still returns 10 quotation templates after integration wiring', () => {
    expect(getPrintTemplates('quotation')).toHaveLength(10);
  });
});
