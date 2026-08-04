/**
 * تصدير التسلسل الزمني — عقد أعمدة واحد لـ Excel و CSV، ومجاميع محسوبة من نفس
 * الصفوف المُصدَّرة (لا من مصدر ثانٍ).
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('@config/database.js', () => ({
  prisma: { bankStatementTransaction: { fields: { debit: {}, credit: {} } } },
}));

import {
  TIMELINE_EXPORT_COLUMNS, toExportRow, buildTimelineReportInput, buildTimelineCsv,
} from '../timelineExport.js';
import { summariseTransactions } from '../service.js';
import type { TimelineTransaction } from '../types.js';

function tx(over: Partial<TimelineTransaction> = {}): TimelineTransaction {
  return {
    id: 1, importId: 3, importBatchLabel: 'Import #3', fileName: 'f.xlsx',
    importedAt: '2026-01-01T00:00:00.000Z', bankName: 'NBK', accountKey: 'ACC',
    statementDate: '2026-01-15', postingDate: null, description: 'Inward Clearing Cheque 000006',
    reference: null, debit: 255, credit: 0, balance: 70085.32, currency: 'KWD',
    chequeNumber: '000006', reconcileStatus: 'UNMATCHED', matchedType: null, matchedRef: null,
    isDuplicate: false, isBankFee: false, bankFeeType: null, transactionFingerprint: null,
    ...over,
  } as TimelineTransaction;
}

const ctx = {
  accountKey: 'IBAN:KW1', bankName: 'NBK', filterSummary: ['الاتجاه: سحب'],
  coverageFrom: '2025-01-01', coverageTo: '2026-08-01',
  exportedAt: new Date(2026, 7, 4, 9, 30),
};

describe('summariseTransactions — المجاميع', () => {
  const rows = [tx(), tx({ id: 2, debit: 0, credit: 1000, statementDate: '2026-02-01' })];

  it('يفصل المدين عن الدائن ويحسب الصافي وحجم التداول', () => {
    const t = summariseTransactions(rows);
    expect(t.totalDebits).toBe(255);
    expect(t.totalCredits).toBe(1000);
    expect(t.netMovement).toBe(745);
    expect(t.turnover).toBe(1255);
  });

  it('الصافي ≠ حجم التداول لمجموعة مختلطة الاتجاه', () => {
    const t = summariseTransactions(rows);
    expect(t.netMovement).not.toBe(t.turnover);
  });

  it('يستخرج مدى تاريخ المجموعة المفلترة نفسها', () => {
    const t = summariseTransactions(rows);
    expect(t.filteredFromDate).toBe('2026-01-15');
    expect(t.filteredToDate).toBe('2026-02-01');
  });

  it('يرصد العملات المتعددة والتكرارات', () => {
    const t = summariseTransactions([
      tx(), tx({ id: 9, currency: 'USD', isDuplicate: true }),
    ]);
    expect(t.currencies).toEqual(['KWD', 'USD']);
    expect(t.duplicateCount).toBe(1);
  });

  it('مجموعة فارغة تُنتج أصفارًا لا NaN', () => {
    const t = summariseTransactions([]);
    expect(t).toMatchObject({ totalDebits: 0, totalCredits: 0, netMovement: 0, turnover: 0, duplicateCount: 0 });
    expect(t.filteredFromDate).toBeNull();
  });
});

describe('عقد الأعمدة', () => {
  it('النوع والتصنيف عمودان مستقلان بترتيب الشاشة نفسه', () => {
    expect(TIMELINE_EXPORT_COLUMNS.map((c) => c.header).slice(0, 6)).toEqual([
      'التاريخ', 'النوع', 'التصنيف', 'الوصف', 'المرجع', 'رقم الشيك',
    ]);
  });

  it('الأعمدة المالية أرقام خام بتنسيق عملة (لا نص مُنسَّق)', () => {
    for (const key of ['debit', 'credit', 'net', 'balance']) {
      expect(TIMELINE_EXPORT_COLUMNS.find((c) => c.key === key)?.type).toBe('currency');
    }
    const row = toExportRow(tx());
    expect(typeof row.debit).toBe('number');
    expect(row.net).toBe(-255);
  });

  it('صف التصدير يحمل نفس النوع والتصنيف المعروضين', () => {
    const row = toExportRow(tx());
    expect(row.direction).toBe('سحب');
    expect(row.category).toBe('شيك');
  });

  it('التصنيف لا ينقلب بانقلاب المبلغ', () => {
    expect(toExportRow(tx({ debit: 0, credit: 255 })).category).toBe('شيك');
    expect(toExportRow(tx({ debit: 0, credit: 255 })).direction).toBe('إيداع');
  });
});

describe('مُدخل التقرير', () => {
  const rows = [tx(), tx({ id: 2, debit: 0, credit: 1000 })];
  const totals = summariseTransactions(rows);
  const input = buildTimelineReportInput(rows, totals, ctx);

  it('يحمل العنوان والحساب والفترة', () => {
    expect(input.title).toContain('IBAN:KW1');
    expect(input.subtitle).toContain('2026-01-15');
  });

  it('يُفصح عن نطاق التصدير والفلاتر ولحظة التصدير', () => {
    const meta = (input.metaFooter ?? []).join('\n');
    expect(meta).toContain('جميع النتائج بعد تطبيق الفلاتر');
    expect(meta).toContain('الاتجاه: سحب');
    expect(meta).toContain('2026-08-04 09:30');
  });

  it('يُميّز الصافي عن حجم التداول في التذييل', () => {
    const meta = (input.metaFooter ?? []).join('\n');
    expect(meta).toContain('صافي الحركة: 745.000');
    expect(meta).toContain('حجم التداول: 1255.000');
  });

  it('ينبّه على خلط العملات وعلى التكرارات', () => {
    const mixed = [tx(), tx({ id: 5, currency: 'USD', isDuplicate: true })];
    const meta = (buildTimelineReportInput(mixed, summariseTransactions(mixed), ctx).metaFooter ?? []).join('\n');
    expect(meta).toContain('أكثر من عملة');
    expect(meta).toContain('تكرار محتمل');
  });

  it('صف المجاميع يحمل المدين والدائن والصافي كأرقام', () => {
    expect(input.totalsRow).toMatchObject({ debit: 255, credit: 1000, net: 745 });
  });

  it('الفلترة التلقائية مفعّلة (المحرك يتكفّل بالتجميد وRTL)', () => {
    expect(input.autoFilter).toBe(true);
  });
});

describe('CSV — نفس العقد تمامًا', () => {
  const rows = [tx(), tx({ id: 2, debit: 0, credit: 1000 })];
  const totals = summariseTransactions(rows);
  const csv = buildTimelineCsv(rows, totals, ctx);
  const lines = csv.split('\r\n');

  it('يبدأ بـ BOM ليفتح صحيحًا بالعربية', () => {
    expect(csv.startsWith('﻿')).toBe(true);
  });

  it('رؤوس الأعمدة وترتيبها مطابقة لعقد Excel', () => {
    const header = lines.find((l) => l.startsWith('التاريخ'));
    expect(header).toBe(TIMELINE_EXPORT_COLUMNS.map((c) => c.header).join(','));
  });

  it('عدد صفوف البيانات يطابق عدد الحركات', () => {
    const headerIdx = lines.findIndex((l) => l.startsWith('التاريخ'));
    const dataLines = lines.slice(headerIdx + 1).filter(Boolean);
    expect(dataLines).toHaveLength(rows.length + 1); // + صف المجاميع
  });

  it('يقتبس الحقول التي تحوي فواصل', () => {
    const withComma = buildTimelineCsv([tx({ description: 'A, B' })], totals, ctx);
    expect(withComma).toContain('"A, B"');
  });

  it('يحمل نفس أسطر الإفصاح التدقيقي', () => {
    expect(csv).toContain('جميع النتائج بعد تطبيق الفلاتر');
  });
});
