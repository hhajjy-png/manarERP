import { describe, it, expect } from 'vitest';
import {
  buildInvoiceCreatePayload,
  validateInvoiceRow,
  resolveInvoiceParty,
  makeEmptyItem,
  makeEmptyRow,
  clientNextInvoiceNumber,
  addToInvoiceSummary,
  isInvoiceRowDirty,
  EMPTY_INVOICE_SUMMARY,
  InvoiceSharedFields,
  InvoiceRowFields,
} from '../invoiceFastEntry';
import { DEFAULT_WORK_TYPE } from '../../utils/invoiceDescription';

const shared = (over: Partial<InvoiceSharedFields> = {}): InvoiceSharedFields => ({
  entryMode: 'SINGLE',
  direction: 'SALES',
  invoiceType: 'نقل اسفلت',
  issueDate: '2026-06-15',
  billingMonth: 6,
  billingYear: 2026,
  numberYear: 2026,
  customerId: '7',
  contractId: '',
  ...over,
});

const row = (over: Partial<InvoiceRowFields> = {}): InvoiceRowFields => ({
  invoiceNumber: 'MN-INV-2026-00152',
  items: [{ uid: 'a', description: 'نقل اسفلت درب', quantity: 3, unit: 'درب', unitPrice: 25 }],
  discount: 0,
  deliveryDate: '',
  customerId: '',
  contractId: '',
  ...over,
});

describe('invoiceFastEntry.buildInvoiceCreatePayload — byte-identical to normal Create Invoice form (PD-1)', () => {
  it('produces exactly the normal-form SALES field set (SINGLE mode)', () => {
    const p = buildInvoiceCreatePayload(shared(), row({ deliveryDate: '2026-06-16', discount: 5 }));
    expect(p).toEqual({
      invoiceNumber: 'MN-INV-2026-00152',
      direction: 'SALES',
      invoiceType: 'نقل اسفلت',
      customerId: 7,
      supplierId: undefined,
      issueDate: '2026-06-15',
      deliveryDate: '2026-06-16',
      billingMonth: 6,
      billingYear: 2026,
      discount: 5,
      items: [{ description: 'نقل اسفلت درب', quantity: 3, unit: 'درب', unitPrice: 25 }],
    });
  });

  it('never posts fields the normal form omits (taxRate/paymentMethod/dueDate/contractId/notes)', () => {
    const p = buildInvoiceCreatePayload(shared({ contractId: '42' }), row());
    expect(p).not.toHaveProperty('taxRate');
    expect(p).not.toHaveProperty('paymentMethod');
    expect(p).not.toHaveProperty('dueDate');
    expect(p).not.toHaveProperty('contractId');
    expect(p).not.toHaveProperty('notes');
  });

  it('maps items through the shared toInvoiceItemPayload (drops uid/workType/location/priceTouched)', () => {
    const p = buildInvoiceCreatePayload(shared(), row({
      items: [{ uid: 'x', description: 'بند', quantity: 2, unit: 'طن', unitPrice: 10, workType: 'w', location: 'l', priceTouched: true }],
    }));
    expect(p.items).toEqual([{ description: 'بند', quantity: 2, unit: 'طن', unitPrice: 10 }]);
  });

  it('empty delivery date → null; empty issue date → undefined', () => {
    const p = buildInvoiceCreatePayload(shared({ issueDate: '' }), row({ deliveryDate: '' }));
    expect(p.deliveryDate).toBeNull();
    expect(p.issueDate).toBeUndefined();
  });

  it('MULTI mode resolves the customer from the row', () => {
    const p = buildInvoiceCreatePayload(shared({ entryMode: 'MULTI', customerId: '' }), row({ customerId: '9' }));
    expect(p.customerId).toBe(9);
  });
});

describe('invoiceFastEntry.resolveInvoiceParty', () => {
  it('SINGLE → shared customer; MULTI → row customer', () => {
    expect(resolveInvoiceParty(shared({ customerId: '7' }), row())).toEqual({ customerId: 7, supplierId: undefined });
    expect(resolveInvoiceParty(shared({ entryMode: 'MULTI', customerId: '' }), row({ customerId: '9' }))).toEqual({ customerId: 9, supplierId: undefined });
  });
});

describe('invoiceFastEntry.validateInvoiceRow — same rules as normal creation', () => {
  it('rejects a malformed invoice number', () => {
    expect(validateInvoiceRow(shared(), row({ invoiceNumber: 'INV-2026-1' }))).toMatch(/رقم الفاتورة/);
  });
  it('requires a customer (SALES)', () => {
    expect(validateInvoiceRow(shared({ customerId: '' }), row())).toMatch(/العميل/);
    expect(validateInvoiceRow(shared({ entryMode: 'MULTI', customerId: '' }), row({ customerId: '' }))).toMatch(/العميل/);
  });
  it('requires at least one item and valid item fields', () => {
    expect(validateInvoiceRow(shared(), row({ items: [] }))).toMatch(/بند/);
    expect(validateInvoiceRow(shared(), row({ items: [{ uid: 'a', description: '  ', quantity: 1, unit: 'درب', unitPrice: 1 }] }))).toMatch(/وصف/);
    expect(validateInvoiceRow(shared(), row({ items: [{ uid: 'a', description: 'x', quantity: 0, unit: 'درب', unitPrice: 1 }] }))).toMatch(/الكمية/);
    expect(validateInvoiceRow(shared(), row({ items: [{ uid: 'a', description: 'x', quantity: 1, unit: 'درب', unitPrice: -1 }] }))).toMatch(/السعر/);
    expect(validateInvoiceRow(shared(), row({ items: [{ uid: 'a', description: 'x', quantity: 1, unit: '', unitPrice: 1 }] }))).toMatch(/الوحدة/);
  });
  it('passes a valid row', () => {
    expect(validateInvoiceRow(shared(), row())).toBeNull();
  });
});

describe('invoiceFastEntry — number, reset, summary, dirty', () => {
  it('clientNextInvoiceNumber bumps the trailing numeric suffix and pads to 5', () => {
    expect(clientNextInvoiceNumber('MN-INV-2026-00152')).toBe('MN-INV-2026-00153');
    expect(clientNextInvoiceNumber('MN-INV-2026-00099')).toBe('MN-INV-2026-00100');
  });
  it('makeEmptyRow carries the suggested number and one default item', () => {
    const r = makeEmptyRow('MN-INV-2026-00200');
    expect(r.invoiceNumber).toBe('MN-INV-2026-00200');
    expect(r.items).toHaveLength(1);
    expect(r.discount).toBe(0);
    expect(r.deliveryDate).toBe('');
    expect(r.customerId).toBe('');
  });
  it('makeEmptyItem seeds the default work type (matches the normal form) with price 0', () => {
    expect(makeEmptyItem()).toMatchObject({ description: DEFAULT_WORK_TYPE, workType: DEFAULT_WORK_TYPE, quantity: 1, unit: 'درب', unitPrice: 0 });
  });
  it('addToInvoiceSummary accumulates and records last/next', () => {
    const s1 = addToInvoiceSummary(EMPTY_INVOICE_SUMMARY, 75, 'MN-INV-2026-00152', 'شركة أ', 'MN-INV-2026-00153');
    expect(s1).toEqual({ count: 1, total: 75, lastNumber: 'MN-INV-2026-00152', lastCustomer: 'شركة أ', lastAmount: 75, nextNumber: 'MN-INV-2026-00153' });
    const s2 = addToInvoiceSummary(s1, 25, 'MN-INV-2026-00153', 'شركة ب', 'MN-INV-2026-00154');
    expect(s2).toMatchObject({ count: 2, total: 100, lastNumber: 'MN-INV-2026-00153', nextNumber: 'MN-INV-2026-00154' });
  });
  it('isInvoiceRowDirty: empty row is clean, any item description makes it dirty', () => {
    expect(isInvoiceRowDirty(makeEmptyRow('MN-INV-2026-00200'))).toBe(false);
    expect(isInvoiceRowDirty(row())).toBe(true);
  });
});
