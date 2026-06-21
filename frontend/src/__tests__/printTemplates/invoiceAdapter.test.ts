import { describe, it, expect } from 'vitest';
import { adaptInvoice } from '../../print-templates/adapters/invoiceAdapter';
import { createCompanyPrintData } from '../../print-templates/adapters/companyData';
import type { ApiInvoice } from '../../print-templates/adapters/apiTypes';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeInvoice(overrides: Partial<ApiInvoice> = {}): ApiInvoice {
  return {
    id: 1,
    number: 'INV-2026-00001',
    invoiceNumber: 'MN-INV-2026-0001',
    direction: 'SALES',
    invoiceType: 'نقل اسفلت',
    customerId: null,
    supplierId: null,
    contractId: null,
    issueDate: '2026-06-20T00:00:00.000Z',
    dueDate: null,
    deliveryDate: null,
    subtotal: 0,
    taxRate: 0,
    taxAmount: 0,
    discount: 0,
    total: 0,
    paidAmount: 0,
    status: 'UNPAID',
    notes: null,
    billingMonth: null,
    billingYear: null,
    paymentMethod: null,
    items: [],
    payments: [],
    customer: null,
    supplier: null,
    contract: null,
    ...overrides,
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('adaptInvoice', () => {
  it('minimal invoice — maps invoiceNumber and date', () => {
    const result = adaptInvoice(makeInvoice());
    expect(result.invoiceNumber).toBe('MN-INV-2026-0001');
    expect(result.date).toBe('20 / 06 / 2026');
  });

  it('populates company data from ALMANAR_COMPANY default', () => {
    const result = adaptInvoice(makeInvoice());
    expect(result.company.nameAr).toContain('المنار');
    expect(result.company.email).toBe('Manar.int.co@gmail.com');
  });

  it('uses customer name when direction is SALES', () => {
    const result = adaptInvoice(
      makeInvoice({
        direction: 'SALES',
        customer: { id: 1, name: 'مصنع الخليج للأسفلت' },
        supplier: null,
      }),
    );
    expect(result.customerName).toBe('مصنع الخليج للأسفلت');
  });

  it('uses supplier name when customer is null', () => {
    const result = adaptInvoice(
      makeInvoice({
        customer: null,
        supplier: { id: 5, name: 'مورد الطرق' },
      }),
    );
    expect(result.customerName).toBe('مورد الطرق');
  });

  it('customerName is empty string when both customer and supplier are null', () => {
    const result = adaptInvoice(makeInvoice({ customer: null, supplier: null }));
    expect(result.customerName).toBe('');
  });

  it('maps line items with sequential numbers starting at 1', () => {
    const result = adaptInvoice(
      makeInvoice({
        total: 200,
        items: [
          { id: 1, invoiceId: 1, description: 'نقل أسفلت', unit: 'طن', quantity: 10, unitPrice: 20, total: 200, priceId: null },
        ],
      }),
    );
    expect(result.lineItems).toHaveLength(1);
    expect(result.lineItems[0].number).toBe(1);
    expect(result.lineItems[0].descriptionAr).toBe('نقل أسفلت');
    expect(result.lineItems[0].quantity).toBe(10);
    expect(result.lineItems[0].unitPrice).toBe(20);
    expect(result.lineItems[0].total).toBe(200);
  });

  it('correctly splits total into dinars and fils', () => {
    const result = adaptInvoice(makeInvoice({ total: 732.5 }));
    expect(result.totalDinars).toBe(732);
    expect(result.totalFils).toBe(500);
  });

  it('totalInWords is non-empty Arabic text', () => {
    const result = adaptInvoice(makeInvoice({ total: 200 }));
    expect(result.totalInWords).toContain('مائتان');
    expect(result.totalInWords).toContain('فقط لا غير');
  });

  it('zero total → صفر دينار كويتي', () => {
    const result = adaptInvoice(makeInvoice({ total: 0 }));
    expect(result.totalInWords).toContain('صفر');
    expect(result.totalDinars).toBe(0);
    expect(result.totalFils).toBe(0);
  });

  it('maps notes when present', () => {
    const result = adaptInvoice(makeInvoice({ notes: 'ملاحظة مهمة' }));
    expect(result.notes).toBe('ملاحظة مهمة');
  });

  it('notes is undefined when null in API response', () => {
    const result = adaptInvoice(makeInvoice({ notes: null }));
    expect(result.notes).toBeUndefined();
  });

  it('total with high-precision fils preserves all 3 decimal places', () => {
    const result = adaptInvoice(makeInvoice({ total: 100.999 }));
    expect(result.totalDinars).toBe(100);
    expect(result.totalFils).toBe(999);
  });

  it('maps projectName from contract.asphaltPlant', () => {
    const result = adaptInvoice(
      makeInvoice({
        contract: { id: 7, asphaltPlant: 'مصنع الخليج للأسفلت' },
      }),
    );
    expect(result.projectName).toBe('مصنع الخليج للأسفلت');
  });

  it('projectName is undefined when contract is null', () => {
    const result = adaptInvoice(makeInvoice({ contract: null }));
    expect(result.projectName).toBeUndefined();
  });

  it('payments are NOT mapped (invoiceAdapter does not expose payments)', () => {
    const result = adaptInvoice(
      makeInvoice({
        total: 100,
        paidAmount: 60,
        payments: [
          { id: 1, invoiceId: 1, amount: 60, method: 'CASH', date: '2026-06-01', reference: null, notes: null },
        ],
      }),
    );
    // InvoicePrintData has no payments field — remaining amount calc is not the adapter's job
    expect((result as unknown as Record<string, unknown>)['payments']).toBeUndefined();
  });
});

// ─── createCompanyPrintData — override semantics (Phase 1.96 hardening) ───────

describe('createCompanyPrintData — ?? override semantics', () => {
  it('empty string override IS applied (intentional blank field)', () => {
    // Phase 1.96: changed from || (skips '') to ?? semantics (passes all strings).
    // An explicit '' means "clear this field on print", e.g. hide fax number.
    const result = createCompanyPrintData({ fax: '' });
    expect(result.fax).toBe('');
  });

  it('non-empty string override replaces default', () => {
    const result = createCompanyPrintData({ email: 'accounts@manar.kw' });
    expect(result.email).toBe('accounts@manar.kw');
  });

  it('undefined key is NOT applied — default is kept', () => {
    const result = createCompanyPrintData({ email: undefined });
    expect(result.email).toBe('Manar.int.co@gmail.com');
  });

  it('no overrides → returns full copy of ALMANAR_COMPANY', () => {
    const result = createCompanyPrintData();
    expect(result.nameAr).toContain('المنار');
    expect(result.phone).toBe('99333820 / 94404401');
  });

  // CompanyPrintData fields are all strings — there are no numeric fields,
  // so "zero numeric override" does not apply to this type.
  // If numeric fields are added in future, they should be tested for ?? semantics:
  // i.e. 0 must pass through and must NOT fall back to a non-zero default.
});
