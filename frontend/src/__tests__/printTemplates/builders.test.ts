import { describe, it, expect } from 'vitest';
import { buildInvoicePrintData } from '../../print-templates/builders/invoicePrintDataBuilder';
import { buildQuotationPrintData } from '../../print-templates/builders/quotationPrintDataBuilder';
import type { ApiInvoice } from '../../print-templates/adapters/apiTypes';
import type { ApiQuotation } from '../../print-templates/adapters/apiTypes';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeInvoice(overrides: Partial<ApiInvoice> = {}): ApiInvoice {
  return {
    id: 1,
    number: 'INV-001',
    invoiceNumber: 'MN-001',
    direction: 'SALES',
    invoiceType: 'test',
    customerId: null,
    supplierId: null,
    contractId: null,
    issueDate: '2026-01-01T00:00:00.000Z',
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

function makeQuotation(overrides: Partial<ApiQuotation> = {}): ApiQuotation {
  return {
    id: 1,
    quotationNumber: 'QT-001',
    issueDate: '2026-01-01T00:00:00.000Z',
    validityDays: 30,
    subject: 'أعمال طرق',
    customerName: 'عميل تجريبي',
    attention: null,
    notes: null,
    items: [],
    terms: [],
    ...overrides,
  };
}

// ─── buildInvoicePrintData — branding passthrough ─────────────────────────────

describe('buildInvoicePrintData — branding option', () => {
  it('no options → company has no branding fields', () => {
    const result = buildInvoicePrintData(makeInvoice());
    expect(result.company.signatureUrl).toBeUndefined();
    expect(result.company.stampUrl).toBeUndefined();
  });

  it('branding.signatureUrl is passed through to company', () => {
    const result = buildInvoicePrintData(makeInvoice(), {
      branding: { signatureUrl: 'data:image/png;base64,sig', stampUrl: undefined, showSignature: true, showStamp: true },
    });
    expect(result.company.signatureUrl).toBe('data:image/png;base64,sig');
  });

  it('branding.stampUrl is passed through to company', () => {
    const result = buildInvoicePrintData(makeInvoice(), {
      branding: { signatureUrl: undefined, stampUrl: 'data:image/png;base64,stamp', showSignature: true, showStamp: true },
    });
    expect(result.company.stampUrl).toBe('data:image/png;base64,stamp');
  });

  it('showSignature false is passed through', () => {
    const result = buildInvoicePrintData(makeInvoice(), {
      branding: { signatureUrl: undefined, stampUrl: undefined, showSignature: false, showStamp: true },
    });
    expect(result.company.showSignature).toBe(false);
  });

  it('company ALMANAR defaults preserved when branding only', () => {
    const result = buildInvoicePrintData(makeInvoice(), {
      branding: { signatureUrl: 'data:image/png;base64,sig', stampUrl: undefined, showSignature: true, showStamp: true },
    });
    expect(result.company.nameAr).toContain('المنار');
    expect(result.company.email).toBeTruthy();
  });
});

// ─── buildQuotationPrintData — branding passthrough ───────────────────────────

describe('buildQuotationPrintData — branding option', () => {
  it('no options → company has no branding fields', () => {
    const result = buildQuotationPrintData(makeQuotation());
    expect(result.company.signatureUrl).toBeUndefined();
    expect(result.company.stampUrl).toBeUndefined();
  });

  it('branding.signatureUrl is passed through to company', () => {
    const result = buildQuotationPrintData(makeQuotation(), {
      branding: { signatureUrl: 'data:image/png;base64,sig', stampUrl: undefined, showSignature: true, showStamp: true },
    });
    expect(result.company.signatureUrl).toBe('data:image/png;base64,sig');
  });

  it('branding.stampUrl is passed through to company', () => {
    const result = buildQuotationPrintData(makeQuotation(), {
      branding: { signatureUrl: undefined, stampUrl: 'data:image/png;base64,stamp', showSignature: true, showStamp: true },
    });
    expect(result.company.stampUrl).toBe('data:image/png;base64,stamp');
  });

  it('company ALMANAR defaults preserved when branding only', () => {
    const result = buildQuotationPrintData(makeQuotation(), {
      branding: { signatureUrl: 'data:image/png;base64,sig', stampUrl: undefined, showSignature: true, showStamp: true },
    });
    expect(result.company.nameAr).toContain('المنار');
    expect(result.company.email).toBeTruthy();
  });
});
