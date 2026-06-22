import { describe, it, expect } from 'vitest';
import { mergeEffectiveBranding, shouldShowSignature, shouldShowStamp } from '../../print-templates/utils/brandingHelpers';
import { buildInvoicePrintData } from '../../print-templates/builders/invoicePrintDataBuilder';
import { buildQuotationPrintData } from '../../print-templates/builders/quotationPrintDataBuilder';
import type { ApiInvoice, ApiQuotation } from '../../print-templates/adapters/apiTypes';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeInvoice(overrides: Partial<ApiInvoice> = {}): ApiInvoice {
  return {
    id: 1, number: 'INV-001', invoiceNumber: 'MN-001', direction: 'SALES',
    invoiceType: 'test', customerId: null, supplierId: null, contractId: null,
    issueDate: '2026-01-01T00:00:00.000Z', dueDate: null, deliveryDate: null,
    subtotal: 0, taxRate: 0, taxAmount: 0, discount: 0, total: 0, paidAmount: 0,
    status: 'UNPAID', notes: null, billingMonth: null, billingYear: null,
    paymentMethod: null, items: [], payments: [],
    customer: null, supplier: null, contract: null, ...overrides,
  };
}

function makeQuotation(overrides: Partial<ApiQuotation> = {}): ApiQuotation {
  return {
    id: 1, quotationNumber: 'QT-001', issueDate: '2026-01-01T00:00:00.000Z',
    validityDays: 30, subject: 'test', customerName: 'عميل', attention: null,
    notes: null, items: [], terms: [], ...overrides,
  };
}

const SIG = 'data:image/png;base64,sig';
const STP = 'data:image/png;base64,stamp';

// ─── mergeEffectiveBranding ───────────────────────────────────────────────────

describe('mergeEffectiveBranding', () => {
  const BASE = { signatureUrl: SIG, stampUrl: STP, showSignature: true as boolean | undefined, showStamp: true as boolean | undefined };

  it('per-print override showSignature=false beats settings showSignature=true', () => {
    const result = mergeEffectiveBranding(BASE, { showSignature: false, showStamp: true });
    expect(result.showSignature).toBe(false);
  });

  it('per-print override showStamp=false beats settings showStamp=true', () => {
    const result = mergeEffectiveBranding(BASE, { showSignature: true, showStamp: false });
    expect(result.showStamp).toBe(false);
  });

  it('image URLs are preserved from base when overriding toggles', () => {
    const result = mergeEffectiveBranding(BASE, { showSignature: false, showStamp: false });
    expect(result.signatureUrl).toBe(SIG);
    expect(result.stampUrl).toBe(STP);
  });

  it('user re-enabling override=true beats settings=false', () => {
    const base = { ...BASE, showSignature: false as boolean | undefined };
    const result = mergeEffectiveBranding(base, { showSignature: true, showStamp: true });
    expect(result.showSignature).toBe(true);
  });
});

// ─── shouldShowSignature ──────────────────────────────────────────────────────

describe('shouldShowSignature', () => {
  it('returns false when showSignature=false even with signatureUrl present', () => {
    expect(shouldShowSignature({ showSignature: false, signatureUrl: SIG })).toBe(false);
  });

  it('returns true when showSignature=true and signatureUrl present', () => {
    expect(shouldShowSignature({ showSignature: true, signatureUrl: SIG })).toBe(true);
  });

  it('returns false when signatureUrl absent regardless of showSignature', () => {
    expect(shouldShowSignature({ showSignature: true, signatureUrl: undefined })).toBe(false);
  });

  it('returns false for undefined company', () => {
    expect(shouldShowSignature(undefined)).toBe(false);
  });
});

// ─── shouldShowStamp ──────────────────────────────────────────────────────────

describe('shouldShowStamp', () => {
  it('returns false when showStamp=false even with stampUrl present', () => {
    expect(shouldShowStamp({ showStamp: false, stampUrl: STP })).toBe(false);
  });

  it('returns true when showStamp=true and stampUrl present', () => {
    expect(shouldShowStamp({ showStamp: true, stampUrl: STP })).toBe(true);
  });

  it('returns false when stampUrl absent regardless of showStamp', () => {
    expect(shouldShowStamp({ showStamp: true, stampUrl: undefined })).toBe(false);
  });
});

// ─── builder: per-print override flows into company data (invoice) ────────────

describe('invoice builder — per-print overrides', () => {
  it('showSignature=false with signatureUrl → company.showSignature false, url preserved', () => {
    const result = buildInvoicePrintData(makeInvoice(), {
      branding: { signatureUrl: SIG, stampUrl: STP, showSignature: false, showStamp: true },
    });
    expect(result.company.showSignature).toBe(false);
    expect(result.company.signatureUrl).toBe(SIG);
  });

  it('showStamp=false with stampUrl → company.showStamp false, url preserved', () => {
    const result = buildInvoicePrintData(makeInvoice(), {
      branding: { signatureUrl: SIG, stampUrl: STP, showSignature: true, showStamp: false },
    });
    expect(result.company.showStamp).toBe(false);
    expect(result.company.stampUrl).toBe(STP);
  });
});

// ─── builder: per-print override flows into company data (quotation) ──────────

describe('quotation builder — per-print overrides', () => {
  it('showSignature=false → quotation company.showSignature false', () => {
    const result = buildQuotationPrintData(makeQuotation(), {
      branding: { signatureUrl: SIG, stampUrl: STP, showSignature: false, showStamp: true },
    });
    expect(result.company.showSignature).toBe(false);
    expect(result.company.signatureUrl).toBe(SIG);
  });

  it('showStamp=false → quotation company.showStamp false', () => {
    const result = buildQuotationPrintData(makeQuotation(), {
      branding: { signatureUrl: SIG, stampUrl: STP, showSignature: true, showStamp: false },
    });
    expect(result.company.showStamp).toBe(false);
    expect(result.company.stampUrl).toBe(STP);
  });
});
