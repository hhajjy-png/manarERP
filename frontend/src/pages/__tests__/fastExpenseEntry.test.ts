import { describe, it, expect } from 'vitest';
import {
  buildFastExpensePayload,
  validateFastRow,
  resolveFastSupplier,
  makeEmptyRow,
  addToSummary,
  isRowDirty,
  EMPTY_SUMMARY,
  FastSharedFields,
  FastRowFields,
} from '../fastExpenseEntry';

const shared = (over: Partial<FastSharedFields> = {}): FastSharedFields => ({
  date: '2026-06-15',
  billingMonth: 6,
  billingYear: 2026,
  paymentMethod: 'CASH',
  supplierId: '',
  supplierName: '',
  notesPrefix: '',
  ...over,
});

const row = (over: Partial<FastRowFields> = {}): FastRowFields => ({
  category: 'FUEL',
  description: 'وقود يونيو',
  amount: '25.5',
  supplierId: '',
  supplierName: '',
  notes: '',
  ...over,
});

describe('fastExpenseEntry.buildFastExpensePayload — identical to normal create', () => {
  it('carries the fixed shared fields (date/month/year/paymentMethod) into every row', () => {
    const p = buildFastExpensePayload(shared({ paymentMethod: 'BANK' }), row());
    expect(p).toMatchObject({
      category: 'FUEL',
      description: 'وقود يونيو',
      amount: 25.5,
      date: '2026-06-15',
      billingMonth: 6,
      billingYear: 2026,
      paymentMethod: 'BANK',
      supplierId: null,
      supplierName: null,
    });
  });

  it('uses a shared registered supplier for the row', () => {
    const p = buildFastExpensePayload(shared({ supplierId: '7' }), row());
    expect(p.supplierId).toBe(7);
    expect(p.supplierName).toBeNull();
  });

  it('uses a shared free-text supplier (OTHER)', () => {
    const p = buildFastExpensePayload(shared({ supplierId: 'OTHER', supplierName: '  محطة الوقود  ' }), row());
    expect(p.supplierId).toBeNull();
    expect(p.supplierName).toBe('محطة الوقود');
  });

  it('falls back to the per-row supplier when shared mode is PER_ROW', () => {
    const p = buildFastExpensePayload(shared({ supplierId: 'PER_ROW' }), row({ supplierId: '9' }));
    expect(p.supplierId).toBe(9);
  });

  it('combines the notes prefix with the row notes', () => {
    const p = buildFastExpensePayload(shared({ notesPrefix: 'مصاريف يونيو' }), row({ notes: 'دفعة أولى' }));
    expect(p.notes).toBe('مصاريف يونيو — دفعة أولى');
  });

  it('omits notes entirely when both prefix and row notes are empty', () => {
    const p = buildFastExpensePayload(shared(), row({ notes: '' }));
    expect(p.notes).toBeUndefined();
  });
});

describe('fastExpenseEntry.validateFastRow — same rules as normal creation', () => {
  it('requires category, description, and a positive amount', () => {
    expect(validateFastRow(row({ category: '' }))).toBe('التصنيف مطلوب');
    expect(validateFastRow(row({ description: '   ' }))).toBe('الوصف مطلوب');
    expect(validateFastRow(row({ amount: '' }))).toBe('المبلغ يجب أن يكون موجبًا');
    expect(validateFastRow(row({ amount: '0' }))).toBe('المبلغ يجب أن يكون موجبًا');
    expect(validateFastRow(row({ amount: '-5' }))).toBe('المبلغ يجب أن يكون موجبًا');
  });

  it('passes a valid row', () => {
    expect(validateFastRow(row())).toBeNull();
  });
});

describe('fastExpenseEntry — reset & summary preserve shared context', () => {
  it('makeEmptyRow clears every row-specific field', () => {
    expect(makeEmptyRow()).toEqual({ category: '', description: '', amount: '', supplierId: '', supplierName: '', notes: '' });
  });

  it('addToSummary accumulates count/total and tracks the last saved expense', () => {
    const s1 = addToSummary(EMPTY_SUMMARY, 25.5, 'EXP-2026-00040', 'وقود');
    const s2 = addToSummary(s1, 10, 'EXP-2026-00041', 'زيت');
    expect(s2).toEqual({ count: 2, total: 35.5, lastCode: 'EXP-2026-00041', lastDescription: 'زيت' });
  });

  it('resolveFastSupplier returns nulls when no supplier is set', () => {
    expect(resolveFastSupplier(shared(), row())).toEqual({ supplierId: null, supplierName: null });
  });

  it('isRowDirty detects unsaved input', () => {
    expect(isRowDirty(makeEmptyRow())).toBe(false);
    expect(isRowDirty(row())).toBe(true);
    expect(isRowDirty(makeEmptyRow())).toBe(false);
  });
});
