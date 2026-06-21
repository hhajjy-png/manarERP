import { describe, it, expect } from 'vitest';
import { toInvoiceItemPayload } from '../utils/invoicePayload';

const uiItem = {
  uid: 'abc-123-def-456',
  description: 'نقل اسفلت — السالمية',
  quantity: 5,
  unit: 'طن',
  unitPrice: 12.500,
  priceTouched: true,
  workType: 'نقل اسفلت',
  location: 'السالمية',
};

describe('toInvoiceItemPayload', () => {
  it('includes all required API fields', () => {
    const payload = toInvoiceItemPayload(uiItem);
    expect(payload.description).toBe(uiItem.description);
    expect(payload.quantity).toBe(uiItem.quantity);
    expect(payload.unit).toBe(uiItem.unit);
    expect(payload.unitPrice).toBe(uiItem.unitPrice);
  });

  it('excludes uid from API payload', () => {
    const payload = toInvoiceItemPayload(uiItem);
    expect('uid' in payload).toBe(false);
  });

  it('excludes UI-only fields (priceTouched, workType, location)', () => {
    const payload = toInvoiceItemPayload(uiItem);
    expect('priceTouched' in payload).toBe(false);
    expect('workType' in payload).toBe(false);
    expect('location' in payload).toBe(false);
  });

  it('result has exactly 4 keys', () => {
    const payload = toInvoiceItemPayload(uiItem);
    expect(Object.keys(payload)).toHaveLength(4);
  });
});
