import { describe, it, expect } from 'vitest';
import { computeFinancialAnalysis } from '../financialAnalysis.compute';
import type { AnalysisDataset } from '../financialAnalysis.types';

/* ════════════════════════════════════════════════════════════════════════════
   تحليل الذمم المدينة — طبقة نقيّة، فلا قاعدة بيانات ولا ساعة.

   كل رقم هنا مُشتقّ من نفس المصفوفات الثلاث التي تغذّي بقية الأقسام: لا استعلام
   إضافي، ولا حقل جديد في طبقة البيانات.
   ════════════════════════════════════════════════════════════════════════════ */

const d = (iso: string) => new Date(`${iso}T10:00:00`);

/**
 * الافتراضي: **بلا رصيد مرحَّل** — الأستاذ يساوي حركة الفترة، فتبقى كل تأكيدات
 * هذا الملف معبّرة عمّا وُضعت له. اختبارات الترحيل أدناه تُمرّر `ledger` صراحةً.
 */
function dataset(over: Partial<AnalysisDataset> = {}): AnalysisDataset {
  const ds: AnalysisDataset = {
    period: { from: '2026-01-01', to: '2026-06-30', days: 181, previousFrom: '2025-07-04', previousTo: '2025-12-31' },
    invoices: [],
    expenses: [],
    payments: [],
    ledger: { invoices: [], payments: [] },
    previous: { revenue: 0, expenses: 0, profit: 0 },
    ...over,
  };
  return over.ledger ? ds : { ...ds, ledger: { invoices: ds.invoices, payments: ds.payments } };
}

const inv = (id: number, date: string, total: number, customerId: number, name: string) => ({
  id, invoiceNumber: `INV-${id}`, issueDate: d(date), total, customerId, customerName: name,
});
const pay = (id: number, date: string, amount: number, invoiceId: number, customerId: number, name: string) => ({
  id, date: d(date), amount, invoiceId, invoiceNumber: `INV-${invoiceId}`, customerId, customerName: name,
});

const receivables = (ds: AnalysisDataset) => computeFinancialAnalysis(ds).receivables;

describe('receivables — row scope', () => {
  it('lists only customers that actually owe money', () => {
    const r = receivables(dataset({
      invoices: [inv(1, '2026-01-10', 1000, 1, 'مدين'), inv(2, '2026-01-10', 500, 2, 'مسدَّد')],
      payments: [pay(1, '2026-01-20', 500, 2, 2, 'مسدَّد')],
    }));
    expect(r.rows.map((x) => x.customerName)).toEqual(['مدين']);
    expect(r.kpis.debtorCount).toBe(1);
  });

  it('excludes a customer whose period payments exceed their period invoices', () => {
    const r = receivables(dataset({
      invoices: [inv(1, '2026-02-01', 300, 1, 'دفع عن فواتير أقدم')],
      payments: [pay(1, '2026-02-10', 900, 99, 1, 'دفع عن فواتير أقدم')],
    }));
    expect(r.rows).toEqual([]);
    expect(r.kpis.totalOutstanding).toBe(0);
  });

  it('sorts debtors by outstanding balance, largest first', () => {
    const r = receivables(dataset({
      invoices: [
        inv(1, '2026-01-05', 400, 1, 'صغير'),
        inv(2, '2026-01-05', 900, 2, 'كبير'),
        inv(3, '2026-01-05', 650, 3, 'وسط'),
      ],
    }));
    expect(r.rows.map((x) => x.customerName)).toEqual(['كبير', 'وسط', 'صغير']);
  });
});

describe('receivables — FIFO ageing', () => {
  it('applies payments oldest-first and reports the first uncovered invoice', () => {
    const r = receivables(dataset({
      invoices: [
        inv(1, '2026-01-10', 1000, 1, 'عميل'),
        inv(2, '2026-03-15', 800, 1, 'عميل'),
        inv(3, '2026-05-20', 600, 1, 'عميل'),
      ],
      // 1200 يغطّي الفاتورة الأولى بالكامل وجزءًا من الثانية ⇒ الثانية هي الأقدم المستحقّة.
      payments: [pay(1, '2026-04-01', 1200, 1, 1, 'عميل')],
    }));
    const row = r.rows[0];
    expect(row.oldestOpenInvoiceNumber).toBe('INV-2');
    expect(row.oldestOpenInvoiceDate).toBe('2026-03-15');
    expect(row.outstanding).toBe(1200); // 2400 − 1200
  });

  it('measures debt age to the end of the selected period', () => {
    const r = receivables(dataset({
      invoices: [inv(1, '2026-06-01', 500, 1, 'عميل')],
    }));
    // 01/06 → 30/06 = 29 يومًا
    expect(r.asOf).toBe('2026-06-30');
    expect(r.rows[0].debtAgeDays).toBe(29);
  });

  it('falls back to the latest movement when the period is unbounded', () => {
    const r = receivables(dataset({
      period: { from: null, to: null, days: null, previousFrom: null, previousTo: null },
      invoices: [inv(1, '2026-01-10', 500, 1, 'عميل')],
      payments: [pay(1, '2026-03-10', 100, 1, 1, 'عميل')],
    }));
    expect(r.asOf).toBe('2026-03-10');
    expect(r.rows[0].debtAgeDays).toBe(59);
  });

  it('reports the last payment date, or none when the customer never paid', () => {
    const r = receivables(dataset({
      invoices: [inv(1, '2026-01-10', 900, 1, 'دافع'), inv(2, '2026-01-10', 700, 2, 'صامت')],
      payments: [pay(1, '2026-02-01', 100, 1, 1, 'دافع'), pay(2, '2026-04-09', 200, 1, 1, 'دافع')],
    }));
    expect(r.rows.find((x) => x.customerName === 'دافع')!.lastPaymentDate).toBe('2026-04-09');
    expect(r.rows.find((x) => x.customerName === 'صامت')!.lastPaymentDate).toBeNull();
  });
});

describe('receivables — status bands', () => {
  const ageOf = (issue: string) => receivables(dataset({ invoices: [inv(1, issue, 100, 1, 'ع')] })).rows[0];

  it('bands the age into five escalating states', () => {
    expect(ageOf('2026-06-20').status).toBe('excellent');   // 10 يوم
    expect(ageOf('2026-05-15').status).toBe('good');        // 46 يوم
    expect(ageOf('2026-04-15').status).toBe('acceptable');  // 76 يوم
    expect(ageOf('2026-02-15').status).toBe('weak');        // 135 يوم
    expect(ageOf('2025-06-15').status).toBe('critical');    // > 180 يوم
  });

  it('sums only overdue and high-risk balances into the risk KPI', () => {
    const r = receivables(dataset({
      invoices: [
        inv(1, '2026-06-20', 100, 1, 'جديد'),      // ممتاز
        inv(2, '2026-02-15', 250, 2, 'متأخر'),     // weak
        inv(3, '2025-06-15', 400, 3, 'حرج'),       // critical
      ],
    }));
    expect(r.kpis.highRiskOutstanding).toBe(650);
    expect(r.kpis.totalOutstanding).toBe(750);
  });
});

describe('receivables — KPIs derive from the rows below them', () => {
  const ds = dataset({
    invoices: [
      inv(1, '2026-01-10', 1000, 1, 'أ'),
      inv(2, '2026-03-10', 600, 2, 'ب'),
      inv(3, '2026-05-10', 400, 3, 'ج'),
    ],
    payments: [pay(1, '2026-02-01', 200, 1, 1, 'أ')],
  });

  it('totals outstanding to the sum of the column', () => {
    const r = receivables(ds);
    expect(r.kpis.totalOutstanding).toBe(r.rows.reduce((s, x) => s + x.outstanding, 0));
  });

  it('counts debtors as the number of rows', () => {
    const r = receivables(ds);
    expect(r.kpis.debtorCount).toBe(r.rows.length);
  });

  it('averages per debtor from the same two figures', () => {
    const r = receivables(ds);
    expect(r.kpis.averagePerDebtor).toBe(r.kpis.totalOutstanding / r.kpis.debtorCount);
  });

  it('weights the average age by amount, not by row count', () => {
    const r = receivables(ds);
    const weighted =
      r.rows.reduce((s, x) => s + x.debtAgeDays! * x.outstanding, 0) /
      r.rows.reduce((s, x) => s + x.outstanding, 0);
    expect(r.kpis.averageAgeDays).toBe(Math.round(weighted));
    // متوسط حسابي بسيط يعطي رقمًا مختلفًا — التأكيد أن المرجَّح هو المستخدم.
    const plain = r.rows.reduce((s, x) => s + x.debtAgeDays!, 0) / r.rows.length;
    expect(Math.round(plain)).not.toBe(r.kpis.averageAgeDays);
  });

  it('reports the oldest age as the maximum in the table', () => {
    const r = receivables(ds);
    expect(r.kpis.oldestAgeDays).toBe(Math.max(...r.rows.map((x) => x.debtAgeDays!)));
  });
});

describe('receivables — reconciliation with the collections section', () => {
  it('keeps each row consistent with the collections figures for that customer', () => {
    const ds = dataset({
      invoices: [inv(1, '2026-01-10', 1000, 1, 'عميل')],
      payments: [pay(1, '2026-02-01', 300, 1, 1, 'عميل')],
    });
    const report = computeFinancialAnalysis(ds);
    const rec = report.receivables.rows[0];
    const col = report.collections.rows.find((x) => x.customerId === 1)!;
    expect(rec.invoiced).toBe(col.invoiced);
    expect(rec.collected).toBe(col.collected);
    expect(rec.outstanding).toBe(col.outstanding);
    expect(rec.collectionRate).toBe(col.collectionRate);
  });

  it('states positive receivables only — never the net collections figure', () => {
    const ds = dataset({
      invoices: [inv(1, '2026-01-10', 1000, 1, 'مدين')],
      payments: [pay(1, '2026-02-01', 900, 99, 2, 'دافع سلفًا')],
    });
    const report = computeFinancialAnalysis(ds);
    // §4 الصافي: 1000 − 900 = 100 ؛ §5 الذمم القائمة: 1000 (الرصيد السالب لا يخصم)
    expect(report.collections.kpis.outstanding).toBe(100);
    expect(report.receivables.kpis.totalOutstanding).toBe(1000);
  });
});

/* ────────────────────────────────────────────────────────────────────────────
   الرصيد المرحَّل بين الفترات.

   §5 رصيدٌ **كما في تاريخ**، فمصدره الأستاذ حتى نهاية الفترة لا حركة الفترة. كل
   حالة هنا كانت تخرج برقم خاطئ حين كان القسم يقرأ فواتير الفترة ودفعاتها وحدها.
   ──────────────────────────────────────────────────────────────────────────── */

describe('receivables — carry-over across periods', () => {
  it('counts a debtor whose only invoice predates the period', () => {
    const older = inv(1, '2025-11-10', 700, 1, 'مدين قديم');
    const r = receivables(dataset({
      invoices: [],
      payments: [],
      ledger: { invoices: [older], payments: [] },
    }));
    // قبل الإصلاح: لا صفّ إطلاقًا وإجمالي ذمم صفر — دينٌ قائم اختفى من التقرير.
    expect(r.rows.map((x) => x.customerName)).toEqual(['مدين قديم']);
    expect(r.kpis.totalOutstanding).toBe(700);
  });

  it('ages the debt from the real invoice date, not from the period start', () => {
    const older = inv(1, '2025-11-10', 700, 1, 'مدين قديم');
    const r = receivables(dataset({
      invoices: [],
      payments: [],
      ledger: { invoices: [older], payments: [] },
    }));
    expect(r.rows[0].oldestOpenInvoiceDate).toBe('2025-11-10');
    expect(r.rows[0].oldestOpenInvoiceNumber).toBe('INV-1');
    expect(r.rows[0].status).toBe('critical'); // 10/11/2025 → 30/06/2026 = 232 يومًا
  });

  it('applies an in-period payment to the older invoice it actually settles', () => {
    const older = inv(1, '2025-12-01', 500, 1, 'عميل');
    const current = inv(2, '2026-02-01', 300, 1, 'عميل');
    const payment = pay(1, '2026-03-01', 500, 1, 1, 'عميل');
    const r = receivables(dataset({
      invoices: [current],
      payments: [payment],
      ledger: { invoices: [older, current], payments: [payment] },
    }));
    // قبل الإصلاح: 300 − 500 = −200 ⇒ الصفّ يُستبعد ويختفي دين قدره 300.
    expect(r.kpis.totalOutstanding).toBe(300);
    expect(r.rows[0].oldestOpenInvoiceNumber).toBe('INV-2');
  });

  it('states invoiced and collected cumulatively so the row arithmetic holds', () => {
    const older = inv(1, '2025-12-01', 500, 1, 'عميل');
    const current = inv(2, '2026-02-01', 300, 1, 'عميل');
    const payment = pay(1, '2026-03-01', 500, 1, 1, 'عميل');
    const row = receivables(dataset({
      invoices: [current],
      payments: [payment],
      ledger: { invoices: [older, current], payments: [payment] },
    })).rows[0];
    expect(row.invoiced).toBe(800);
    expect(row.collected).toBe(500);
    expect(row.outstanding).toBe(row.invoiced - row.collected);
    expect(row.collectionRate).toBe(62.5);
  });

  it('never reports a collection rate above 100% or below zero', () => {
    const older = inv(1, '2025-10-01', 900, 1, 'مسدِّد متأخّر');
    const current = inv(2, '2026-01-05', 100, 1, 'مسدِّد متأخّر');
    const payment = pay(1, '2026-04-01', 900, 1, 1, 'مسدِّد متأخّر');
    const row = receivables(dataset({
      invoices: [current],
      payments: [payment],
      ledger: { invoices: [older, current], payments: [payment] },
    })).rows[0];
    // §4 (حركة الفترة) يعطي 900/100 = 900% ؛ §5 التراكمي يعطي 900/1000 = 90%.
    expect(row.collectionRate).toBe(90);
    expect(row.outstanding).toBe(100);
  });

  it('reports a last payment that predates the period', () => {
    const older = inv(1, '2025-09-01', 1000, 1, 'عميل');
    const oldPayment = pay(1, '2025-10-15', 400, 1, 1, 'عميل');
    const row = receivables(dataset({
      invoices: [],
      payments: [],
      ledger: { invoices: [older], payments: [oldPayment] },
    })).rows[0];
    expect(row.lastPaymentDate).toBe('2025-10-15');
    expect(row.outstanding).toBe(600);
  });
});

describe('indicators — days sales outstanding reads the §5 balance', () => {
  it('stays positive when period collections exceed period invoicing', () => {
    const older = inv(1, '2025-11-01', 400, 1, 'مدين');
    const current = inv(2, '2026-01-10', 100, 2, 'عميل جديد');
    const payment = pay(1, '2026-02-01', 900, 9, 3, 'مسدِّد عن فواتير أقدم');
    const report = computeFinancialAnalysis(dataset({
      invoices: [current],
      payments: [payment],
      ledger: { invoices: [older, current], payments: [payment] },
    }));
    // §4 صافي الحركة سالب (100 − 900 = −800) — وكان بسط المؤشّر، فيخرج بالسالب.
    expect(report.collections.kpis.outstanding).toBeLessThan(0);
    const dso = report.indicators.rows.find((r) => r.key === 'daysSalesOutstanding')!;
    expect(dso.value).toBeGreaterThan(0);
    // (400 + 100) ÷ 100 × 181 — الرصيد الحقيقي هو البسط.
    expect(dso.value).toBe(Math.round((report.receivables.kpis.totalOutstanding / 100) * 181));
  });
});

describe('receivables — empty period', () => {
  it('returns a zeroed section without NaN or thrown errors', () => {
    const r = receivables(dataset());
    expect(r.rows).toEqual([]);
    expect(r.kpis).toEqual({
      totalOutstanding: 0,
      debtorCount: 0,
      averagePerDebtor: 0,
      averageAgeDays: null,
      oldestAgeDays: null,
      highRiskOutstanding: 0,
    });
  });
});
