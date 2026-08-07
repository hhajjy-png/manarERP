import { describe, it, expect } from 'vitest';
import { computeFinancialAnalysis, changePercent, percentOf } from '../financialAnalysis.compute';
import type { AnalysisDataset } from '../financialAnalysis.types';

/* بيانات اختبار ثابتة — الطبقة نقيّة فلا حاجة لقاعدة بيانات. */

const d = (iso: string) => new Date(`${iso}T10:00:00`);

function baseDataset(over: Partial<AnalysisDataset> = {}): AnalysisDataset {
  return {
    period: {
      from: '2026-01-01',
      to: '2026-02-28',
      days: 59,
      previousFrom: '2025-11-03',
      previousTo: '2025-12-31',
    },
    invoices: [
      { id: 1, invoiceNumber: 'INV-1', issueDate: d('2026-01-10'), total: 1000, customerId: 1, customerName: 'عميل أ' },
      { id: 2, invoiceNumber: 'INV-2', issueDate: d('2026-01-20'), total: 500, customerId: 2, customerName: 'عميل ب' },
      { id: 3, invoiceNumber: 'INV-3', issueDate: d('2026-02-05'), total: 1500, customerId: 1, customerName: 'عميل أ' },
    ],
    expenses: [
      { id: 1, code: 'EXP-1', date: d('2026-01-15'), amount: 400, category: 'FUEL', description: 'وقود' },
      { id: 2, code: 'EXP-2', date: d('2026-01-25'), amount: 200, category: 'RENT', description: 'إيجار' },
      { id: 3, code: 'EXP-3', date: d('2026-02-10'), amount: 300, category: 'FUEL', description: 'وقود' },
    ],
    payments: [
      { id: 1, date: d('2026-01-18'), amount: 800, invoiceId: 1, invoiceNumber: 'INV-1', customerId: 1, customerName: 'عميل أ' },
      { id: 2, date: d('2026-02-12'), amount: 400, invoiceId: 3, invoiceNumber: 'INV-3', customerId: 1, customerName: 'عميل أ' },
    ],
    previous: { revenue: 2000, expenses: 1000, profit: 1000 },
    ledger: { invoices: [], payments: [] }, // يُستبدل أدناه ما لم يُصرَّح به
    ...over,
  };
}

/**
 * مجموعة بيانات **بلا رصيد مرحَّل**: الأستاذ = حركة الفترة حرفيًا.
 *
 * هذا ما تفترضه كل تأكيدات هذا الملف (لا فاتورة ولا دفعة قبل بداية الفترة)، فيبقى
 * §5 مطابقًا لـ§4 فيها. اختبارات الرصيد المرحَّل تُمرّر `ledger` صراحةً.
 */
function dataset(over: Partial<AnalysisDataset> = {}): AnalysisDataset {
  const ds = baseDataset(over);
  return over.ledger ? ds : { ...ds, ledger: { invoices: ds.invoices, payments: ds.payments } };
}

const empty = (): AnalysisDataset =>
  dataset({ invoices: [], expenses: [], payments: [], previous: { revenue: 0, expenses: 0, profit: 0 } });

describe('percentOf', () => {
  it('returns null when the denominator is not positive', () => {
    expect(percentOf(5, 0)).toBeNull();
    expect(percentOf(5, -1)).toBeNull();
  });

  it('rounds to two decimals', () => {
    expect(percentOf(1, 3)).toBe(33.33);
  });
});

describe('changePercent', () => {
  it('returns null when there is no comparison base', () => {
    expect(changePercent(100, 0)).toBeNull();
  });

  it('computes growth against the previous period', () => {
    expect(changePercent(120, 100)).toBe(20);
    expect(changePercent(80, 100)).toBe(-20);
  });
});

describe('computeFinancialAnalysis — profitability', () => {
  it('derives profit as revenue minus expenses', () => {
    const r = computeFinancialAnalysis(dataset());
    expect(r.profitability.kpis.revenue).toBe(3000);
    expect(r.profitability.kpis.expenses).toBe(900);
    expect(r.profitability.kpis.profit).toBe(2100);
    expect(r.profitability.kpis.profitMargin).toBe(70);
  });

  it('keeps every KPI identical to its own table row (no divergence possible)', () => {
    const r = computeFinancialAnalysis(dataset());
    const row = (k: string) => r.profitability.rows.find((x) => x.key === k)!;
    expect(r.profitability.kpis.revenue).toBe(row('revenue').amount);
    expect(r.profitability.kpis.expenses).toBe(row('expenses').amount);
    expect(r.profitability.kpis.profit).toBe(row('profit').amount);
    expect(r.profitability.kpis.profitMargin).toBe(row('profit').percentOfRevenue);
  });

  it('compares against the previous period figures supplied by the dataset', () => {
    const r = computeFinancialAnalysis(dataset());
    expect(r.profitability.rows.find((x) => x.key === 'revenue')!.changePercent).toBe(50);
    expect(r.profitability.rows.find((x) => x.key === 'expenses')!.changePercent).toBe(-10);
  });
});

describe('computeFinancialAnalysis — revenue section', () => {
  it('buckets invoices per month and totals to the profitability revenue', () => {
    const r = computeFinancialAnalysis(dataset());
    expect(r.revenue.rows.map((x) => x.month)).toEqual(['2026-01', '2026-02']);
    expect(r.revenue.rows[0]).toMatchObject({ revenue: 1500, invoiceCount: 2, averageInvoice: 750 });
    expect(r.revenue.kpis.totalRevenue).toBe(r.profitability.kpis.revenue);
  });

  it('derives its KPIs from the rows below it', () => {
    const r = computeFinancialAnalysis(dataset());
    const sum = r.revenue.rows.reduce((s, x) => s + x.revenue, 0);
    const count = r.revenue.rows.reduce((s, x) => s + x.invoiceCount, 0);
    expect(r.revenue.kpis.totalRevenue).toBe(sum);
    expect(r.revenue.kpis.invoiceCount).toBe(count);
    expect(r.revenue.kpis.averageInvoice).toBe(3000 / 3);
    expect(r.revenue.kpis.topMonthRevenue).toBe(1500);
  });

  it('breaks a tie for the top month deterministically in favour of the earlier month', () => {
    // يناير 1000+500 ويناير/فبراير 1500 لكلٍّ منهما — التعادل يُحسم للأقدم.
    const r = computeFinancialAnalysis(dataset());
    expect(r.revenue.rows.map((x) => x.revenue)).toEqual([1500, 1500]);
    expect(r.revenue.kpis.topMonth).toBe('2026-01');
  });
});

describe('computeFinancialAnalysis — expense section', () => {
  it('groups by category, sorts descending, and apportions percentages to exactly 100', () => {
    const r = computeFinancialAnalysis(dataset());
    expect(r.expenses.rows.map((x) => x.category)).toEqual(['FUEL', 'RENT']);
    expect(r.expenses.rows[0]).toMatchObject({ amount: 700, count: 2 });
    const totalPercent = r.expenses.rows.reduce((s, x) => s + x.percent, 0);
    expect(Math.round(totalPercent * 10) / 10).toBe(100);
  });

  it('derives its KPIs from the rows below it', () => {
    const r = computeFinancialAnalysis(dataset());
    expect(r.expenses.kpis.totalExpenses).toBe(r.expenses.rows.reduce((s, x) => s + x.amount, 0));
    expect(r.expenses.kpis.expenseCount).toBe(3);
    expect(r.expenses.kpis.topCategory).toBe('FUEL');
    expect(r.expenses.kpis.topCategoryAmount).toBe(700);
  });
});

describe('computeFinancialAnalysis — collections section', () => {
  it('splits invoiced and collected per customer', () => {
    const r = computeFinancialAnalysis(dataset());
    const a = r.collections.rows.find((x) => x.customerId === 1)!;
    expect(a).toMatchObject({ invoiced: 2500, collected: 1200, outstanding: 1300 });
    const b = r.collections.rows.find((x) => x.customerId === 2)!;
    expect(b).toMatchObject({ invoiced: 500, collected: 0, outstanding: 500 });
  });

  it('measures an in-period payment for an older invoice against the opening balance', () => {
    const older = { id: 99, invoiceNumber: 'INV-OLD', issueDate: d('2025-12-10'), total: 250, customerId: 7, customerName: 'عميل قديم' };
    const payment = { id: 9, date: d('2026-01-05'), amount: 250, invoiceId: 99, invoiceNumber: 'INV-OLD', customerId: 7, customerName: 'عميل قديم' };
    const r = computeFinancialAnalysis(
      dataset({ invoices: [], payments: [payment], ledger: { invoices: [older], payments: [payment] } }),
    );
    const row = r.collections.rows[0];
    expect(row.openingAr).toBe(250);
    expect(row.invoiced).toBe(0);
    expect(row.collected).toBe(250);
    // سُدِّد كل ما كان مستحقًّا ⇒ رصيد آخر المدة صفر ونسبة تحصيل 100%.
    // قبل التصحيح: رصيد −250 ونسبة `null`، لأن المقام كان فواتير الفترة وحدها.
    expect(row.outstanding).toBe(0);
    expect(row.collectionRate).toBe(100);
  });

  it('derives its KPIs from the rows below it', () => {
    const r = computeFinancialAnalysis(dataset());
    expect(r.collections.kpis.collected).toBe(r.collections.rows.reduce((s, x) => s + x.collected, 0));
    expect(r.collections.kpis.outstanding).toBe(r.collections.rows.reduce((s, x) => s + x.outstanding, 0));
    expect(r.collections.kpis.openingAr).toBe(r.collections.rows.reduce((s, x) => s + x.openingAr, 0));
    expect(r.collections.kpis.collectionRate).toBe(40);
    expect(r.collections.kpis.averageCollection).toBe(600);
  });
});

/* ────────────────────────────────────────────────────────────────────────────
   §4 — مؤشّر فاعلية التحصيل (CEI).

     القابل للتحصيل = رصيد أول المدة + مبيعات الفترة
     نسبة التحصيل   = المحصَّل ÷ القابل للتحصيل
     رصيد آخر المدة = القابل للتحصيل − المحصَّل

   لا حدّ أعلى مفروض في أي موضع: ما صُحِّح هو المقام. الاختبارات أدناه تُثبت ذلك
   بحالةٍ تتجاوز فيها القيمة 100% حين يكون التجاوز حقيقيًا (سداد يفوق المستحقّ).
   ──────────────────────────────────────────────────────────────────────────── */

describe('collections — collection effectiveness index', () => {
  const invoice = (id: number, date: string, total: number, customerId: number) =>
    ({ id, invoiceNumber: `INV-${id}`, issueDate: d(date), total, customerId, customerName: 'عميل' });
  const payment = (id: number, date: string, amount: number, customerId: number) =>
    ({ id, date: d(date), amount, invoiceId: 1, invoiceNumber: 'INV-1', customerId, customerName: 'عميل' });

  /** فوتِر 900 قبل الفترة، و100 داخلها، ثم سدّد 900 داخلها. */
  const carryOver = () => {
    const older = invoice(1, '2025-10-01', 900, 1);
    const current = invoice(2, '2026-01-05', 100, 1);
    const paid = payment(1, '2026-02-01', 900, 1);
    return dataset({
      invoices: [current],
      payments: [paid],
      ledger: { invoices: [older, current], payments: [paid] },
      previous: { revenue: 0, expenses: 0, profit: 0 },
    });
  };

  it('divides by opening AR plus period sales, not by period sales alone', () => {
    const row = computeFinancialAnalysis(carryOver()).collections.rows[0];
    expect(row.openingAr).toBe(900);
    expect(row.invoiced).toBe(100);
    expect(row.collected).toBe(900);
    // 900 ÷ (900 + 100) = 90%. الصيغة السابقة: 900 ÷ 100 = 900%.
    expect(row.collectionRate).toBe(90);
  });

  it('reports the closing balance, no longer a negative movement delta', () => {
    const row = computeFinancialAnalysis(carryOver()).collections.rows[0];
    expect(row.outstanding).toBe(100); // 900 + 100 − 900. قبل التصحيح: −800.
  });

  it('holds Closing = Opening + Sales − Collected on every row', () => {
    for (const row of computeFinancialAnalysis(carryOver()).collections.rows) {
      expect(row.outstanding).toBe(row.openingAr + row.invoiced - row.collected);
    }
  });

  it('holds the same identity and the same ratio at KPI level', () => {
    const { kpis, rows } = computeFinancialAnalysis(carryOver()).collections;
    const invoiced = rows.reduce((s, r) => s + r.invoiced, 0);
    expect(kpis.outstanding).toBe(kpis.openingAr + invoiced - kpis.collected);
    expect(kpis.collectionRate).toBe(Math.round((kpis.collected / (kpis.openingAr + invoiced)) * 10000) / 100);
    expect(kpis.collectionRate).toBe(90);
  });

  it('reaches exactly 100% when everything collectible was collected', () => {
    const older = invoice(1, '2025-10-01', 400, 1);
    const current = invoice(2, '2026-01-05', 600, 1);
    const paid = payment(1, '2026-02-01', 1000, 1);
    const row = computeFinancialAnalysis(dataset({
      invoices: [current], payments: [paid], ledger: { invoices: [older, current], payments: [paid] },
    })).collections.rows[0];
    expect(row.collectionRate).toBe(100);
    expect(row.outstanding).toBe(0);
  });

  it('is not capped — a genuine overpayment still reports above 100%', () => {
    const current = invoice(2, '2026-01-05', 100, 1);
    const paid = payment(1, '2026-02-01', 150, 1);
    const row = computeFinancialAnalysis(dataset({
      invoices: [current], payments: [paid], ledger: { invoices: [current], payments: [paid] },
    })).collections.rows[0];
    expect(row.collectionRate).toBe(150); // 150 ÷ (0 + 100)
    expect(row.outstanding).toBe(-50);    // رصيد دائن حقيقي للعميل
  });

  it('returns null when nothing was collectible', () => {
    const paid = payment(1, '2026-02-01', 0, 1);
    const row = computeFinancialAnalysis(dataset({
      invoices: [], payments: [paid], ledger: { invoices: [], payments: [paid] },
    })).collections.rows;
    expect(row).toEqual([]); // لا حركة ولا رصيد ⇒ لا صفّ أصلًا
  });

  it('treats an unbounded period start as a zero opening balance', () => {
    const older = invoice(1, '2025-10-01', 900, 1);
    const current = invoice(2, '2026-01-05', 100, 1);
    const paid = payment(1, '2026-02-01', 900, 1);
    const { rows, kpis } = computeFinancialAnalysis(dataset({
      period: { from: null, to: '2026-06-30', days: null, previousFrom: null, previousTo: null },
      // بلا بداية، حركة الفترة **هي** الأستاذ كاملًا (كما تبنيه طبقة البيانات).
      invoices: [older, current],
      payments: [paid],
      ledger: { invoices: [older, current], payments: [paid] },
    })).collections;
    expect(kpis.openingAr).toBe(0);
    expect(rows[0].invoiced).toBe(1000);
    expect(rows[0].collectionRate).toBe(90); // 900 ÷ (0 + 1000)
  });

  it('omits a customer settled before the period who had no movement inside it', () => {
    const settled = invoice(1, '2025-05-01', 500, 8);
    const settledPay = { ...payment(7, '2025-06-01', 500, 8), invoiceId: 1 };
    const current = invoice(2, '2026-01-05', 300, 1);
    const rows = computeFinancialAnalysis(dataset({
      invoices: [current],
      payments: [],
      ledger: { invoices: [settled, current], payments: [settledPay] },
    })).collections.rows;
    expect(rows.map((r) => r.customerId)).toEqual([1]);
  });

  it('orders rows by total collectible, not by period invoicing alone', () => {
    // «مرحَّل» لا فاتورة له داخل الفترة لكنه الأكبر قابليةً للتحصيل (800).
    const carried = invoice(1, '2025-09-01', 800, 5);
    const midInv = invoice(2, '2026-01-10', 500, 6); // 500
    const smallInv = invoice(3, '2026-01-12', 200, 7); // 200
    const rows = computeFinancialAnalysis(dataset({
      invoices: [midInv, smallInv],
      payments: [],
      ledger: { invoices: [carried, midInv, smallInv], payments: [] },
    })).collections.rows;
    expect(rows.map((r) => r.customerId)).toEqual([5, 6, 7]);
    expect(rows.map((r) => r.openingAr + r.invoiced)).toEqual([800, 500, 200]);
    // الترتيب على فواتير الفترة وحدها كان يضع صاحب الرصيد المرحَّل أخيرًا.
    expect([...rows].sort((a, b) => b.invoiced - a.invoiced).map((r) => r.customerId)).toEqual([6, 7, 5]);
  });

  it('keeps a descending collectible order across the whole table', () => {
    const rows = computeFinancialAnalysis(carryOver()).collections.rows;
    const collectible = rows.map((r) => r.openingAr + r.invoiced);
    expect(collectible).toEqual([...collectible].sort((a, b) => b - a));
  });

  it('keeps §4 net outstanding equal to §5 gross when no customer holds a credit balance', () => {
    const report = computeFinancialAnalysis(carryOver());
    expect(report.receivables.rows.every((r) => r.outstanding > 0)).toBe(true);
    expect(report.collections.kpis.outstanding).toBe(report.receivables.kpis.totalOutstanding);
  });
});

describe('computeFinancialAnalysis — monthly performance', () => {
  it('totals every column to the matching section total', () => {
    const r = computeFinancialAnalysis(dataset());
    expect(r.monthlyPerformance.totals.revenue).toBe(r.profitability.kpis.revenue);
    expect(r.monthlyPerformance.totals.expenses).toBe(r.profitability.kpis.expenses);
    expect(r.monthlyPerformance.totals.profit).toBe(r.profitability.kpis.profit);
    expect(r.monthlyPerformance.totals.collections).toBe(r.collections.kpis.collected);
  });

  it('computes per-month profit and margin', () => {
    const r = computeFinancialAnalysis(dataset());
    expect(r.monthlyPerformance.rows[0]).toMatchObject({
      month: '2026-01',
      revenue: 1500,
      expenses: 600,
      profit: 900,
      collections: 800,
      profitMargin: 60,
    });
  });
});

describe('computeFinancialAnalysis — top lists', () => {
  it('reuses the section rows rather than regrouping the raw facts', () => {
    const r = computeFinancialAnalysis(dataset());
    expect(r.topLists.topCustomers[0]).toMatchObject({ customerId: 1, revenue: 2500 });
    expect(r.topLists.topExpenseCategories[0]).toMatchObject({ category: 'FUEL', amount: 700 });
    expect(r.topLists.topProfitMonths[0]).toMatchObject({ month: '2026-02', profit: 1200 });
  });
});

describe('computeFinancialAnalysis — indicators', () => {
  it('never repeats a KPI that is already a card in another section', () => {
    const r = computeFinancialAnalysis(dataset());
    const keys = r.indicators.rows.map((x) => x.key);
    expect(keys).not.toContain('profitMargin');
    expect(keys).not.toContain('collectionRate');
    expect(keys).toEqual([
      'expenseRatio',
      'daysSalesOutstanding',
      'returnPerRevenueDinar',
      'expenseCoverageByCollections',
      'averageMonthlyProfit',
    ]);
  });

  it('computes each indicator from the section figures', () => {
    const r = computeFinancialAnalysis(dataset());
    const byKey = (k: string) => r.indicators.rows.find((x) => x.key === k)!;
    expect(byKey('expenseRatio').value).toBe(30);
    expect(byKey('returnPerRevenueDinar').value).toBe(0.7);
    expect(byKey('expenseCoverageByCollections').value).toBe(133.33);
    expect(byKey('averageMonthlyProfit').value).toBe(1050);
    // 1800 غير محصَّل (1300 عميل أ + 500 عميل ب) ÷ 3000 إيراد × 59 يومًا ≈ 35 يومًا
    expect(byKey('daysSalesOutstanding').value).toBe(35);
  });
});

describe('computeFinancialAnalysis — empty period', () => {
  it('returns zeroed sections without NaN or thrown errors', () => {
    const r = computeFinancialAnalysis(empty());
    expect(r.profitability.kpis).toEqual({ revenue: 0, expenses: 0, profit: 0, profitMargin: null });
    expect(r.revenue.rows).toEqual([]);
    expect(r.expenses.rows).toEqual([]);
    expect(r.collections.rows).toEqual([]);
    expect(r.monthlyPerformance.rows).toEqual([]);
    expect(r.revenue.kpis.averageInvoice).toBe(0);
    expect(r.collections.kpis.averageCollection).toBe(0);
    expect(r.indicators.rows.every((x) => x.value === null || Number.isFinite(x.value))).toBe(true);
  });
});
