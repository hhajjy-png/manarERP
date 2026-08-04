/**
 * buildTimelineWhere — أبعاد الفلترة الخادمية بعد حزمة التدقيق:
 * التاريخ + الاتجاه (مقارنة عمود بعمود) + المبلغ (متماثل حول الصفر) +
 * البحث (كل المعرّفات + حياد رسم الحروف) + استبعاد التكرارات.
 * TIMELINE_ORDER_BY — ترتيب مستعرض الحسابات الافتراضي.
 */
import { describe, it, expect, vi } from 'vitest';

// service.ts يستورد prisma عند التحميل. مراجع الحقول تحتاج `fields` فقط.
vi.mock('@config/database.js', () => ({
  prisma: {
    bankStatementTransaction: {
      fields: {
        debit:  { name: 'debit',  modelName: 'BankStatementTransaction', typeName: 'Float' },
        credit: { name: 'credit', modelName: 'BankStatementTransaction', typeName: 'Float' },
      },
    },
  },
}));

// نفس شكل مرجع الحقل الذي يبنيه المحاكي — تُستخدم في التوقّعات.
const FIELDS = {
  debit:  { name: 'debit',  modelName: 'BankStatementTransaction', typeName: 'Float' },
  credit: { name: 'credit', modelName: 'BankStatementTransaction', typeName: 'Float' },
};

import { buildTimelineWhere, TIMELINE_ORDER_BY, mapLegacyType } from '../service.js';
import { expectLocalRange, expectLocalStartOfDay } from '../../../core/utils/__tests__/localDayMatchers';
import type { Prisma } from '@prisma/client';

/** `AND` قد يكون كائنًا أو مصفوفة في نوع Prisma — البانّي يبنيها مصفوفةً دائمًا. */
function andList(w: Prisma.BankStatementTransactionWhereInput): Prisma.BankStatementTransactionWhereInput[] {
  return (w.AND ?? []) as Prisma.BankStatementTransactionWhereInput[];
}

describe('buildTimelineWhere — الأساس', () => {
  it('بلا خيارات: قيد الحساب فقط', () => {
    expect(buildTimelineWhere('IBAN:KW1')).toEqual({ accountKey: 'IBAN:KW1' });
  });

  it('مدى تقويمي محلي شامل الطرفين', () => {
    const w = buildTimelineWhere('A', { fromDate: '2026-01-01', toDate: '2026-06-30' });
    expectLocalRange(w.statementDate, '2026-01-01', '2026-06-30');
  });

  it('«الكل» بلا قيد', () => {
    expect(buildTimelineWhere('A', { type: 'all' })).toEqual({ accountKey: 'A' });
  });
});

describe('الاتجاه — مقارنة عمود بعمود تطابق قاعدة العرض (دائن − مدين)', () => {
  it('إيداع = دائن > مدين (لا «دائن > 0»)', () => {
    const w = buildTimelineWhere('A', { direction: 'deposit' });
    expect(w.AND).toEqual([{ credit: { gt: FIELDS.debit } }]);
    expect(w.credit).toBeUndefined();
  });

  it('سحب = مدين > دائن', () => {
    expect(buildTimelineWhere('A', { direction: 'withdrawal' }).AND)
      .toEqual([{ debit: { gt: FIELDS.credit } }]);
  });

  it('بدون حركة = نفي الطرفين', () => {
    expect(buildTimelineWhere('A', { direction: 'neutral' }).AND).toEqual([
      { NOT: [{ credit: { gt: FIELDS.debit } }, { debit: { gt: FIELDS.credit } }] },
    ]);
  });

  it('الفلتر القديم يُترجَم إلى البُعدين المستقلين', () => {
    expect(mapLegacyType('deposits')).toEqual({ direction: 'deposit' });
    expect(mapLegacyType('withdrawals')).toEqual({ direction: 'withdrawal' });
    expect(mapLegacyType('cheques')).toEqual({ categories: ['cheque'] });
    expect(mapLegacyType('transfers')).toEqual({ categories: ['transfer'] });
    expect(mapLegacyType('fees')).toEqual({ categories: ['bank_fee'] });
    expect(mapLegacyType('all')).toEqual({});
  });

  it('«إيداعات» القديمة تُنتج نفس شرط الاتجاه الجديد', () => {
    expect(buildTimelineWhere('A', { type: 'deposits' }).AND)
      .toEqual(buildTimelineWhere('A', { direction: 'deposit' }).AND);
  });

  it('التصنيف لا يُبنى في SQL إطلاقًا (يُطبَّق بمنفذ القاعدة)', () => {
    expect(buildTimelineWhere('A', { categories: ['cheque'] })).toEqual({ accountKey: 'A' });
  });
});

describe('المبلغ — متماثل حول الصفر', () => {
  it('مدى كامل يُقارَن بالجانب غير الصفري', () => {
    const w = buildTimelineWhere('A', { minAmount: 100, maxAmount: 500 });
    expect(w.AND).toEqual([{
      OR: [
        { debit:  { gt: 0, gte: 100, lte: 500 } },
        { credit: { gt: 0, gte: 100, lte: 500 } },
      ],
    }]);
  });

  it('حدّ أعلى وحده يشمل حركات الصفر — لا يُخفيها كما كان', () => {
    const w = buildTimelineWhere('A', { maxAmount: 500 });
    expect((andList(w)[0] as { OR: unknown[] }).OR).toContainEqual({ AND: [{ debit: 0 }, { credit: 0 }] });
  });

  it('حدّ أدنى موجب يستبعد حركات الصفر', () => {
    const w = buildTimelineWhere('A', { minAmount: 1 });
    expect((andList(w)[0] as { OR: unknown[] }).OR).not.toContainEqual({ AND: [{ debit: 0 }, { credit: 0 }] });
  });

  it('توسيع الحدّ الأعلى لا يُقلّص المجموعة (لا تناقض منطقي)', () => {
    const narrow = buildTimelineWhere('A', { minAmount: 0, maxAmount: 100 });
    const wide   = buildTimelineWhere('A', { minAmount: 0 });
    const branches = (w: typeof narrow): number => ((andList(w)[0] as { OR: unknown[] }).OR).length;
    expect(branches(narrow)).toBe(branches(wide));
  });
});

describe('البحث — كل المعرّفات المعروضة + حياد الرسم العربي', () => {
  it('يشمل الوصف والمرجع ورقم الشيك والمرجع المطابق ورقم العملية', () => {
    const w = buildTimelineWhere('A', { search: 'X1' });
    const or = (andList(w)[0] as { OR: Record<string, unknown>[] }).OR;
    expect(or.map((c) => Object.keys(c)[0])).toEqual([
      'description', 'reference', 'chequeNumber', 'matchedRef', 'transactionId',
    ]);
  });

  it('يحوّل عائلات الحروف العربية إلى محرف بدل واحد', () => {
    const w = buildTimelineWhere('A', { search: 'إحالة' });
    const or = (andList(w)[0] as { OR: Record<string, { contains: string }>[] }).OR;
    expect(or[0].description.contains).toBe('_ح_ل_');
  });

  it('يُزيل محارف البدل التي يكتبها المستخدم', () => {
    const w = buildTimelineWhere('A', { search: '50%' });
    const or = (andList(w)[0] as { OR: Record<string, { contains: string }>[] }).OR;
    expect(or[0].description.contains).toBe('50');
  });

  it('بحث فارغ لا يُنتج قيدًا', () => {
    expect(buildTimelineWhere('A', { search: '   ' })).toEqual({ accountKey: 'A' });
  });
});

describe('التكرارات والتركيب', () => {
  it('استبعاد التكرارات يضيف قيدًا صريحًا', () => {
    expect(buildTimelineWhere('A', { excludeDuplicates: true }).AND)
      .toEqual([{ isDuplicate: false }]);
  });

  it('كل الأبعاد معًا تتركّب في AND واحد (تقاطع صرف)', () => {
    const w = buildTimelineWhere('A', {
      fromDate: '2026-01-01', toDate: '2026-12-31',
      direction: 'withdrawal', minAmount: 100, maxAmount: 500,
      search: 'شيك', excludeDuplicates: true,
    });
    expectLocalStartOfDay((w.statementDate as { gte?: Date })?.gte, '2026-01-01');
    expect(w.AND).toHaveLength(4);
    expect(w.AND).toContainEqual({ debit: { gt: FIELDS.credit } });
    expect(w.AND).toContainEqual({ isDuplicate: false });
  });
});

describe('TIMELINE_ORDER_BY', () => {
  it('أحدث دفعة أولًا، ثم ترتيب الملف الأصلي، ثم المعرّف', () => {
    expect(TIMELINE_ORDER_BY).toEqual([
      { importId: 'desc' }, { statementSequence: 'asc' }, { id: 'asc' },
    ]);
  });
});
