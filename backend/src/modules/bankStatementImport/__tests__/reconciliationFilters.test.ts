import { describe, it, expect } from 'vitest';
import { buildWhereClause } from '../reconciliationEngine.js';

/**
 * Financial Accuracy Hotfix Pack v1 — البند 3.
 *
 * البحث النصي ومدى المبلغ كانا يُلحَقان بمصفوفة `where.OR` نفسها، فتصير الدلالة
 * «(مطابق للبحث) أو (المبلغ ضمن المدى)» بدل «و» — فيتّسع العدّ والصفوف والترقيم بصمت.
 */

describe('buildWhereClause — البحث ومدى المبلغ يتقاطعان بـ AND', () => {
  it('البحث وحده: مجموعة OR واحدة تحت AND، بلا فروع مبلغ', () => {
    const where = buildWhereClause({ importId: 7, search: 'راتب' });
    expect(where.AND).toHaveLength(1);
    expect(where.AND[0].OR).toHaveLength(5);
    expect(where.OR).toBeUndefined();
  });

  it('المبلغ وحده: مجموعة OR واحدة (مدين أو دائن) تحت AND', () => {
    const where = buildWhereClause({ importId: 7, minAmount: 100, maxAmount: 500 });
    expect(where.AND).toHaveLength(1);
    expect(where.AND[0].OR).toEqual([
      { debit:  { gte: 100, lte: 500 } },
      { credit: { gte: 100, lte: 500 } },
    ]);
  });

  it('الاثنان معًا: مجموعتان منفصلتان تحت AND — لا مصفوفة OR واحدة مدموجة', () => {
    const where = buildWhereClause({ importId: 7, search: 'راتب', minAmount: 100 });

    // الانحدار المُصلَح: كانت `where.OR` تحمل 7 فروع (5 بحث + 2 مبلغ) بدلالة OR.
    expect(where.OR).toBeUndefined();
    expect(where.AND).toHaveLength(2);

    const [searchGroup, amountGroup] = where.AND;
    expect(searchGroup.OR).toHaveLength(5);
    expect(searchGroup.OR.every(
      (b: Record<string, { contains?: string }>) => Object.values(b)[0]?.contains === 'راتب',
    )).toBe(true);
    expect(amountGroup.OR).toEqual([
      { debit:  { gte: 100 } },
      { credit: { gte: 100 } },
    ]);
  });

  it('بلا بحث ولا مبلغ: لا مفتاح AND إطلاقًا (لا يتغيّر الشرط القائم)', () => {
    const where = buildWhereClause({ importId: 7, status: 'UNMATCHED' });
    expect(where.AND).toBeUndefined();
    expect(where.reconcileStatus).toBe('UNMATCHED');
    expect(where.importId).toBe(7);
  });

  it('الفلاتر المباشرة تبقى على مستوى الجذر — تتقاطع مع مجموعات AND ضمنيًا', () => {
    const where = buildWhereClause({
      importId: 7, status: 'REVIEW', isBankFee: false, isDuplicate: true,
      search: 'شيك', maxAmount: 900,
    });
    expect(where.importId).toBe(7);
    expect(where.reconcileStatus).toBe('REVIEW');
    expect(where.isBankFee).toBe(false);
    expect(where.isDuplicate).toBe(true);
    expect(where.AND).toHaveLength(2);
  });
});
