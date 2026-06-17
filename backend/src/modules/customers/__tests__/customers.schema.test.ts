import { describe, it, expect } from 'vitest';
import { createCustomerSchema, updateCustomerSchema } from '../customers.schema';

describe('createCustomerSchema', () => {
  it('accepts valid customer with all required fields', () => {
    const result = createCustomerSchema.safeParse({
      body: { code: 'C-001', name: 'شركة المنار' },
    });
    expect(result.success).toBe(true);
  });

  it('defaults type to PRIVATE when not provided', () => {
    const result = createCustomerSchema.safeParse({
      body: { code: 'C-001', name: 'شركة المنار' },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.body.type).toBe('PRIVATE');
    }
  });

  it('accepts GOVERNMENT type explicitly', () => {
    const result = createCustomerSchema.safeParse({
      body: { code: 'G-001', name: 'وزارة الأشغال', type: 'GOVERNMENT' },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.body.type).toBe('GOVERNMENT');
    }
  });

  it('rejects empty code', () => {
    const result = createCustomerSchema.safeParse({
      body: { code: '', name: 'شركة المنار' },
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe('رقم العميل مطلوب');
    }
  });

  it('rejects missing code', () => {
    const result = createCustomerSchema.safeParse({
      body: { name: 'شركة المنار' },
    });
    expect(result.success).toBe(false);
  });

  it('rejects empty name', () => {
    const result = createCustomerSchema.safeParse({
      body: { code: 'C-001', name: '' },
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe('اسم العميل مطلوب');
    }
  });

  it('rejects invalid email format', () => {
    const result = createCustomerSchema.safeParse({
      body: { code: 'C-001', name: 'شركة المنار', email: 'not-an-email' },
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe('بريد غير صحيح');
    }
  });

  it('accepts empty string for email (optional but allowed blank)', () => {
    const result = createCustomerSchema.safeParse({
      body: { code: 'C-001', name: 'شركة المنار', email: '' },
    });
    expect(result.success).toBe(true);
  });

  it('accepts valid email', () => {
    const result = createCustomerSchema.safeParse({
      body: { code: 'C-001', name: 'شركة المنار', email: 'contact@manar.kw' },
    });
    expect(result.success).toBe(true);
  });

  it('accepts all optional fields', () => {
    const result = createCustomerSchema.safeParse({
      body: {
        code: 'C-001',
        name: 'شركة المنار',
        type: 'PRIVATE',
        phone: '+965 2222 3333',
        email: 'info@manar.kw',
        contactName: 'أحمد الكويتي',
        address: 'الكويت، حولي',
        notes: 'عميل مميز',
      },
    });
    expect(result.success).toBe(true);
  });

  it('rejects invalid type value', () => {
    const result = createCustomerSchema.safeParse({
      body: { code: 'C-001', name: 'شركة المنار', type: 'PERSONAL' },
    });
    expect(result.success).toBe(false);
  });
});

describe('updateCustomerSchema', () => {
  it('accepts partial update with only name', () => {
    const result = updateCustomerSchema.safeParse({
      body: { name: 'اسم جديد' },
    });
    expect(result.success).toBe(true);
  });

  it('accepts partial update with only code (edit duplicate scenario)', () => {
    const result = updateCustomerSchema.safeParse({
      body: { code: 'C-999' },
    });
    expect(result.success).toBe(true);
  });

  it('accepts empty body (no fields changed)', () => {
    const result = updateCustomerSchema.safeParse({ body: {} });
    expect(result.success).toBe(true);
  });

  it('rejects invalid email on update', () => {
    const result = updateCustomerSchema.safeParse({
      body: { email: 'bad-email' },
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe('بريد غير صحيح');
    }
  });

  it('accepts empty string for email on update', () => {
    const result = updateCustomerSchema.safeParse({
      body: { email: '' },
    });
    expect(result.success).toBe(true);
  });

  it('rejects empty code string on update', () => {
    const result = updateCustomerSchema.safeParse({
      body: { code: '' },
    });
    expect(result.success).toBe(false);
  });

  it('rejects empty name string on update', () => {
    const result = updateCustomerSchema.safeParse({
      body: { name: '' },
    });
    expect(result.success).toBe(false);
  });
});
