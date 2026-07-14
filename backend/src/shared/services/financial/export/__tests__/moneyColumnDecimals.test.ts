/**
 * Phase E — PDF Fixed-Decimal.
 *
 * العيب الذي تحرسه هذه الاختبارات: عمود مالي يُعلن `numFmt` **بلا** `format: 'currency'`.
 * Excel يقرأ `numFmt` فيخرج سليمًا (‎#,##0.000‎)، بينما HTML/PDF يقرآن `format` — فيسقط
 * العمود إلى تنسيق رقمي عام (`maximumFractionDigits: 3` بلا `minimumFractionDigits`)
 * فتُحذف الأصفار النهائية: «2,055.900» تصير «2,055.9» و«15,876.000» تصير «15,876».
 *
 * فالحارس هنا على **تعريف العمود** لا على النتيجة وحدها.
 */
import { describe, it, expect } from 'vitest';
import { buildTable } from '../../../reportEngine/table.template';
import { fmtCell } from '../../../reportEngine/htmlUtils';
import { AGING_COLUMNS } from '../aging.export.adapter';
import { STATEMENT_EXPORT_COLUMNS } from '../statement.export.adapter';
import { toTrialBalanceReportInput } from '../trial.export.adapter';

// الأعمدة المالية تُعرف بـ numFmt النقدي؛ كل واحد منها يجب أن يُعلن نفسه ماليًا.
const MONEY_NUMFMT = '#,##0.000';

describe('تعريف الأعمدة المالية — السبب الجذري', () => {
  // ميزان المراجعة يبني أعمدته داخل المُصدِّر، فنقرأها من مخرجاته لا من ثابت.
  const trialColumns = toTrialBalanceReportInput({
    reportType: 'trial-balance', generatedAt: '2026-01-01T00:00:00.000Z', filters: {},
    summary: { totalDebit: 0, totalCredit: 0 },
    metadata: { mode: 'as-of', asOfDate: '2026-01-31T00:00:00.000Z', isBalanced: true, difference: 0 },
    rows: [],
  } as never).columns;

  it.each([
    ['aging', AGING_COLUMNS],
    ['statement', STATEMENT_EXPORT_COLUMNS],
    ['trial balance', trialColumns],
  ])('%s: كل عمود بـ numFmt نقدي يحمل format: currency', (_name, columns) => {
    const money = (columns as { numFmt?: string; format?: string }[]).filter((c) => c.numFmt === MONEY_NUMFMT);
    expect(money.length).toBeGreaterThan(0);
    for (const col of money) {
      expect(col.format).toBe('currency');
    }
  });
});

describe('خلية PDF/HTML — ثلاث منازل ثابتة', () => {
  it.each([
    [15876, '15,876.000'],
    [25750.2, '25,750.200'],
    [27806.1, '27,806.100'],
    [2055.9, '2,055.900'],
    [11157.3, '11,157.300'],
    [10200, '10,200.000'],
    [1663.2, '1,663.200'],
    [0, '0.000'],
    [-1250, '-1,250.000'],
  ])('%p ⇒ %s', (input, expected) => {
    const cell = fmtCell(input, { format: 'currency' });
    expect(cell).toBe(expected);
    expect(cell).not.toContain('KWD');
  });

  it('غير المنطبق يبقى فارغًا (السلوك القائم)', () => {
    expect(fmtCell(null, { format: 'currency' })).toBe('');
  });

  it('**لا تظهر** الصيغ المبتورة التي رُصدت في الـ PDF', () => {
    const truncated = ['15,876', '25,750.2', '27,806.1', '2,055.9'];
    for (const bad of truncated) {
      const value = Number(bad.replace(/,/g, ''));
      expect(fmtCell(value, { format: 'currency' })).not.toBe(bad);
    }
  });
});

describe('الجدول المُصيَّر — الخلية والعنوان', () => {
  const columns = AGING_COLUMNS as { header: string; key: string; numFmt?: string; format?: 'currency' }[];

  it('الخلية ثلاث منازل بلا رمز، والعنوان يحمل (KWD)', () => {
    const row: Record<string, unknown> = {};
    columns.forEach((c) => { row[c.key] = c.format === 'currency' ? 2055.9 : 'عميل'; });

    const html = buildTable(columns, [row]);

    expect(html).toContain('2,055.900');
    expect(html).not.toContain('>2,055.9<');   // الصيغة المبتورة
    expect(html).toContain('(KWD)');
    expect(html).not.toMatch(/<td[^>]*>[^<]*KWD[^<]*<\/td>/);   // لا رمز داخل خليّة
  });

  it('الصفر يُطبع 0.000 ولا يختفي', () => {
    const row: Record<string, unknown> = {};
    columns.forEach((c) => { row[c.key] = c.format === 'currency' ? 0 : 'عميل'; });
    expect(buildTable(columns, [row])).toContain('0.000');
  });
});
