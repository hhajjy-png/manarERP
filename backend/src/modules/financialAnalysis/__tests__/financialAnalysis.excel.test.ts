import { describe, it, expect } from 'vitest';
import { buildFinancialAnalysisSheets, SHEET_NAMES, type ExportContext } from '../financialAnalysis.excel';
import { computeFinancialAnalysis } from '../financialAnalysis.compute';
import type { AnalysisDataset } from '../financialAnalysis.types';

/** سياق تصدير ثابت — الوحدة نقيّة فلا ساعة ولا جلسة داخلها. */
const CTX: ExportContext = { username: 'admin', generatedAt: new Date(2026, 7, 4, 10, 30) };

/* أوراق Excel تُبنى من نفس التقرير المعروض — لا مسار بيانات ثانٍ. */

const d = (iso: string) => new Date(`${iso}T10:00:00`);

const INVOICES = [
  { id: 1, invoiceNumber: 'INV-1', issueDate: d('2026-01-10'), total: 1000, customerId: 1, customerName: 'عميل أ' },
  { id: 2, invoiceNumber: 'INV-2', issueDate: d('2026-02-05'), total: 1500, customerId: 2, customerName: 'عميل ب' },
];
const PAYMENTS = [
  { id: 1, date: d('2026-01-18'), amount: 800, invoiceId: 1, invoiceNumber: 'INV-1', customerId: 1, customerName: 'عميل أ' },
];

const DATASET: AnalysisDataset = {
  period: { from: '2026-01-01', to: '2026-02-28', days: 59, previousFrom: '2025-11-03', previousTo: '2025-12-31' },
  invoices: INVOICES,
  expenses: [
    { id: 1, code: 'EXP-1', date: d('2026-01-15'), amount: 400, category: 'FUEL', description: 'وقود' },
  ],
  payments: PAYMENTS,
  // بلا رصيد مرحَّل: الأستاذ = حركة الفترة، فتبقى أرقام الأوراق كما كانت.
  ledger: { invoices: INVOICES, payments: PAYMENTS },
  previous: { revenue: 2000, expenses: 1000, profit: 1000 },
};

const sheets = () => buildFinancialAnalysisSheets(computeFinancialAnalysis(DATASET), CTX);

describe('buildFinancialAnalysisSheets', () => {
  it('leads with Summary, then one worksheet per page table in page order', () => {
    expect(sheets().map((s) => s.sheetName)).toEqual([
      SHEET_NAMES.summary,
      SHEET_NAMES.profitability,
      SHEET_NAMES.revenue,
      SHEET_NAMES.expenses,
      SHEET_NAMES.collections,
      SHEET_NAMES.receivables,
      SHEET_NAMES.performance,
      SHEET_NAMES.topCustomers,
      SHEET_NAMES.topExpenses,
      SHEET_NAMES.topMonths,
      SHEET_NAMES.indicators,
    ]);
  });

  it('uses short professional sheet names — the Arabic house standard', () => {
    expect(Object.values(SHEET_NAMES)).toEqual([
      'الملخص', 'الربحية', 'الإيرادات', 'المصروفات', 'التحصيل', 'الذمم',
      'الأداء الشهري', 'أعلى العملاء', 'أعلى المصروفات', 'أعلى الأشهر', 'المؤشرات',
    ]);
    for (const name of Object.values(SHEET_NAMES)) expect(name.length).toBeLessThanOrEqual(16);
  });

  it('keeps every sheet name within the Excel 31-character limit', () => {
    for (const s of sheets()) expect((s.sheetName ?? '').length).toBeLessThanOrEqual(31);
  });

  it('exports no KPI cards and no UI elements — data sheets only', () => {
    for (const s of sheets()) {
      expect(s.kpis).toBeUndefined();
      expect(s.sections).toBeUndefined();
    }
  });

  /** أوراق «بند/قيمة»: عمود قيمة واحد يحمل وحدات مختلطة والوحدة مكتوبة في اسم
   *  البند — فلا تنطبق عليها صيغة عملة واحدة. (الملخص والمؤشرات.) */
  const KEY_VALUE_SHEETS: string[] = [SHEET_NAMES.summary, SHEET_NAMES.indicators];

  it('formats every monetary column with the three-decimal KWD pattern', () => {
    const monetaryHeaders = ['القيمة', 'الإيرادات', 'المصروفات', 'الربح', 'التحصيل', 'المحصّل', 'المتبقي', 'الفواتير', 'متوسط الفاتورة'];
    for (const s of sheets()) {
      if (KEY_VALUE_SHEETS.includes(s.sheetName ?? '')) continue;
      for (const c of s.columns) {
        if (monetaryHeaders.includes(c.header)) {
          expect(c.numFmt).toBe('#,##0.000');
          expect(c.format).toBe('currency');
        }
      }
    }
  });

  it('names the unit inside every indicator label since that sheet mixes units', () => {
    const indicators = sheets().find((s) => s.sheetName === SHEET_NAMES.indicators)!;
    for (const row of indicators.rows) {
      expect(String(row.indicator)).toMatch(/\((%|KWD)\)|\(يوم\)/);
    }
  });

  it('carries every table row through without dropping any', () => {
    const byName = Object.fromEntries(sheets().map((s) => [s.sheetName, s]));
    const report = computeFinancialAnalysis(DATASET);
    expect(byName[SHEET_NAMES.profitability].rows).toHaveLength(report.profitability.rows.length);
    expect(byName[SHEET_NAMES.revenue].rows).toHaveLength(report.revenue.rows.length);
    expect(byName[SHEET_NAMES.expenses].rows).toHaveLength(report.expenses.rows.length);
    expect(byName[SHEET_NAMES.collections].rows).toHaveLength(report.collections.rows.length);
    expect(byName[SHEET_NAMES.receivables].rows).toHaveLength(report.receivables.rows.length);
    expect(byName[SHEET_NAMES.performance].rows).toHaveLength(report.monthlyPerformance.rows.length);
    expect(byName[SHEET_NAMES.indicators].rows).toHaveLength(report.indicators.rows.length);
  });

  it('gives the receivables sheet its ageing columns and a risk-ordered status', () => {
    const rec = sheets().find((s) => s.sheetName === SHEET_NAMES.receivables)!;
    expect(rec.columns.map((c) => c.header)).toEqual([
      'العميل', 'إجمالي الفواتير', 'المحصّل', 'المتبقي', 'نسبة التحصيل %',
      'آخر دفعة', 'أقدم فاتورة مستحقة', 'عمر الدين (يوم)', 'حالة الذمة',
    ]);
    expect(rec.subtitle).toContain('الأعمار كما في');
    expect(rec.totalsRow?.customer).toBe('الإجمالي');
  });

  it('writes amounts as raw numbers so the file stays analysable', () => {
    const revenue = sheets().find((s) => s.sheetName === SHEET_NAMES.revenue)!;
    for (const row of revenue.rows) expect(typeof row.revenue).toBe('number');
    expect(revenue.totalsRow?.revenue).toBe(2500);
  });

  it('translates raw codes into Arabic labels', () => {
    const expenses = sheets().find((s) => s.sheetName === SHEET_NAMES.expenses)!;
    expect(expenses.rows[0].category).not.toBe('FUEL');
    const monthly = sheets().find((s) => s.sheetName === SHEET_NAMES.performance)!;
    expect(String(monthly.rows[0].month)).toContain('2026');
  });

  it('renders an absent ratio as a dash rather than a misleading zero', () => {
    const emptyReport = computeFinancialAnalysis({
      ...DATASET,
      invoices: [],
      expenses: [],
      payments: [],
      previous: { revenue: 0, expenses: 0, profit: 0 },
    });
    const profitability = buildFinancialAnalysisSheets(emptyReport, CTX)[1];
    expect(profitability.rows[0].percent).toBe('—');
    expect(profitability.rows[0].change).toBe('—');
  });

  it('stamps the selected period on every sheet subtitle', () => {
    // ورقة الذمم تُلحق تاريخ احتساب الأعمار بالعنوان الفرعي — تبقى الفترة صدره.
    for (const s of sheets()) expect(s.subtitle).toContain('الفترة: 2026-01-01 — 2026-02-28');
  });
});

describe('Summary worksheet', () => {
  const summary = () => sheets()[0];
  const value = (item: string) => summary().rows.find((r) => r.item === item)?.value;

  it('is the first worksheet in the workbook', () => {
    expect(summary().sheetName).toBe(SHEET_NAMES.summary);
    expect(sheets().findIndex((s) => s.sheetName === SHEET_NAMES.summary)).toBe(0);
  });

  it('carries every required field, in order', () => {
    expect(summary().rows.map((r) => r.item)).toEqual([
      'الفترة المختارة',
      'تاريخ إنشاء التقرير',
      'المستخدم الذي قام بالتصدير',
      'إجمالي الإيرادات (KWD)',
      'إجمالي المصروفات (KWD)',
      'صافي الربح (KWD)',
      'هامش الربح (%)',
      'عدد الجداول المصدَّرة',
    ]);
  });

  it('reports the selected period and the exporting user', () => {
    expect(value('الفترة المختارة')).toBe('2026-01-01 — 2026-02-28');
    expect(value('المستخدم الذي قام بالتصدير')).toBe('admin');
  });

  it('stamps the generation time supplied by the caller, not a hidden clock', () => {
    expect(value('تاريخ إنشاء التقرير')).toBe('2026-08-04 10:30');
  });

  it('takes its totals from the very report the sheets are built from', () => {
    const report = computeFinancialAnalysis(DATASET);
    expect(value('إجمالي الإيرادات (KWD)')).toBe(report.profitability.kpis.revenue);
    expect(value('إجمالي المصروفات (KWD)')).toBe(report.profitability.kpis.expenses);
    expect(value('صافي الربح (KWD)')).toBe(report.profitability.kpis.profit);
    expect(value('هامش الربح (%)')).toBe(`${report.profitability.kpis.profitMargin!.toFixed(2)}%`);
  });

  it('keeps the three monetary totals numeric so the sheet stays analysable', () => {
    for (const item of ['إجمالي الإيرادات (KWD)', 'إجمالي المصروفات (KWD)', 'صافي الربح (KWD)']) {
      expect(typeof value(item)).toBe('number');
    }
  });

  it('counts the data tables, excluding itself', () => {
    expect(value('عدد الجداول المصدَّرة')).toBe(String(sheets().length - 1));
    expect(value('عدد الجداول المصدَّرة')).toBe('10');
  });

  it('falls back to a dash when the margin has no basis', () => {
    const emptyReport = computeFinancialAnalysis({
      ...DATASET,
      invoices: [],
      expenses: [],
      payments: [],
      previous: { revenue: 0, expenses: 0, profit: 0 },
    });
    const s = buildFinancialAnalysisSheets(emptyReport, CTX)[0];
    expect(s.rows.find((r) => r.item === 'هامش الربح (%)')?.value).toBe('—');
  });

  it('labels an unbounded period explicitly instead of leaving it blank', () => {
    const allPeriods = computeFinancialAnalysis({
      ...DATASET,
      period: { from: null, to: null, days: null, previousFrom: null, previousTo: null },
    });
    const s = buildFinancialAnalysisSheets(allPeriods, CTX)[0];
    expect(s.rows[0].value).toBe('كل الفترات');
  });
});
