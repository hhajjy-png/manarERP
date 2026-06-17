import { describe, it, expect } from 'vitest';
import { createExpenseSchema, updateExpenseSchema } from '../expenses.schema';

describe('createExpenseSchema', () => {
  const valid = {
    body: { category: 'FUEL', description: 'وقود المركبات', amount: 250.5 },
  };

  it('accepts minimal valid expense', () => {
    expect(createExpenseSchema.safeParse(valid).success).toBe(true);
  });

  it('rejects missing category', () => {
    const r = createExpenseSchema.safeParse({ body: { description: 'test', amount: 100 } });
    expect(r.success).toBe(false);
  });

  it('rejects invalid category enum', () => {
    const r = createExpenseSchema.safeParse({ body: { ...valid.body, category: 'INVALID_CAT' } });
    expect(r.success).toBe(false);
  });

  it('rejects empty description', () => {
    const r = createExpenseSchema.safeParse({ body: { ...valid.body, description: '' } });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0].message).toBe('الوصف مطلوب');
  });

  it('rejects zero amount', () => {
    const r = createExpenseSchema.safeParse({ body: { ...valid.body, amount: 0 } });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0].message).toBe('المبلغ يجب أن يكون موجبًا');
  });

  it('rejects negative amount', () => {
    const r = createExpenseSchema.safeParse({ body: { ...valid.body, amount: -10 } });
    expect(r.success).toBe(false);
  });

  it('coerces string amount to number', () => {
    const r = createExpenseSchema.safeParse({ body: { ...valid.body, amount: '123.5' } });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.body.amount).toBe(123.5);
  });

  it('rejects billingMonth below 1', () => {
    const r = createExpenseSchema.safeParse({ body: { ...valid.body, billingMonth: 0 } });
    expect(r.success).toBe(false);
  });

  it('rejects billingMonth above 12', () => {
    const r = createExpenseSchema.safeParse({ body: { ...valid.body, billingMonth: 13 } });
    expect(r.success).toBe(false);
  });

  it('accepts valid billingMonth 1-12', () => {
    const r = createExpenseSchema.safeParse({ body: { ...valid.body, billingMonth: 6, billingYear: 2026 } });
    expect(r.success).toBe(true);
  });

  it('rejects billingYear below 2020', () => {
    const r = createExpenseSchema.safeParse({ body: { ...valid.body, billingYear: 2019 } });
    expect(r.success).toBe(false);
  });

  it('rejects billingYear above 2100', () => {
    const r = createExpenseSchema.safeParse({ body: { ...valid.body, billingYear: 2101 } });
    expect(r.success).toBe(false);
  });

  it('accepts valid paymentMethod values', () => {
    for (const pm of ['CASH', 'BANK', 'ACCOUNTS_PAYABLE']) {
      const r = createExpenseSchema.safeParse({ body: { ...valid.body, paymentMethod: pm } });
      expect(r.success).toBe(true);
    }
  });

  it('rejects invalid paymentMethod', () => {
    const r = createExpenseSchema.safeParse({ body: { ...valid.body, paymentMethod: 'CHEQUE' } });
    expect(r.success).toBe(false);
  });

  it('accepts nullable supplierId', () => {
    const r = createExpenseSchema.safeParse({ body: { ...valid.body, supplierId: null } });
    expect(r.success).toBe(true);
  });

  it('accepts supplierName for free-text supplier', () => {
    const r = createExpenseSchema.safeParse({ body: { ...valid.body, supplierName: 'مورد خارجي' } });
    expect(r.success).toBe(true);
  });

  it('rejects supplierName longer than 200 chars', () => {
    const r = createExpenseSchema.safeParse({ body: { ...valid.body, supplierName: 'أ'.repeat(201) } });
    expect(r.success).toBe(false);
  });

  it('accepts all 14 valid expense categories', () => {
    const cats = ['FUEL','SALARIES','MAINTENANCE','RENT','PURCHASES','EQUIPMENT','SERVICES',
      'EQUIPMENT_RENT','TRUCK_RENT','HASSAN','GHANEM','NATHEER','HAROON','OTHER'];
    for (const cat of cats) {
      const r = createExpenseSchema.safeParse({ body: { ...valid.body, category: cat } });
      expect(r.success).toBe(true);
    }
  });
});

describe('updateExpenseSchema', () => {
  it('accepts empty body (no fields changed)', () => {
    expect(updateExpenseSchema.safeParse({ body: {} }).success).toBe(true);
  });

  it('accepts partial update with only amount', () => {
    const r = updateExpenseSchema.safeParse({ body: { amount: 500 } });
    expect(r.success).toBe(true);
  });

  it('rejects negative amount on update', () => {
    const r = updateExpenseSchema.safeParse({ body: { amount: -1 } });
    expect(r.success).toBe(false);
  });

  it('rejects empty description on update', () => {
    const r = updateExpenseSchema.safeParse({ body: { description: '' } });
    expect(r.success).toBe(false);
  });

  it('accepts partial update with only paymentMethod', () => {
    const r = updateExpenseSchema.safeParse({ body: { paymentMethod: 'BANK' } });
    expect(r.success).toBe(true);
  });
});
