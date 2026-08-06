import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect } from 'vitest';
import { CollectionAnalysisEngine, settlementOf, normalizeArabic } from '../collectionAnalysis.engine';
import type { CollectionDataset, DatasetInvoice, DatasetPayment } from '../collectionAnalysis.types';

/* ════════════════════════════════════════════════════════════════════════════
   بيانات اختبار ثابتة — المحرّك نقيّ فلا حاجة لقاعدة بيانات ولا لساعة.

   السيناريو مصمَّم ليغطّي الحالة التي وُجدت الصفحة لأجلها: فواتير صادرة في سنة
   وتُحصَّل — كليًا أو جزئيًا — في سنة أخرى.

     INV-1 · 2023 · 1000  ⇢  400 في 2023  +  600 في 2024        ⇒ مسدَّدة
     INV-2 · 2023 ·  500  ⇢  200 في 2025                        ⇒ جزئية، رصيد 300
     INV-3 · 2024 · 2000  ⇢  2000 في 2024                       ⇒ مسدَّدة داخل سنتها
     INV-4 · 2025 ·  800  ⇢  بلا تحصيل                          ⇒ غير مسدَّدة، متأخرة
   ════════════════════════════════════════════════════════════════════════════ */

const d = (iso: string) => new Date(`${iso}T10:00:00`);

function payment(id: number, invoiceId: number, iso: string, amount: number): DatasetPayment {
  return { id, invoiceId, date: d(iso), amount, method: 'BANK', reference: `REF-${id}` };
}

function invoice(over: Partial<DatasetInvoice> & Pick<DatasetInvoice, 'id' | 'issueDate' | 'total'>): DatasetInvoice {
  return {
    invoiceNumber: `INV-${over.id}`,
    dueDate: null,
    customerId: 1,
    customerName: 'عميل أ',
    contractId: 10,
    contractCode: 'C-10',
    projectShares: [{ projectId: 5, projectName: 'مصنع أ — موقع 1', ratio: 1 }],
    payments: [],
    ...over,
  };
}

function dataset(): CollectionDataset {
  const invoices: DatasetInvoice[] = [
    invoice({
      id: 1,
      issueDate: d('2023-03-01'),
      total: 1000,
      payments: [payment(1, 1, '2023-06-01', 400), payment(2, 1, '2024-02-01', 600)],
    }),
    invoice({
      id: 2,
      issueDate: d('2023-09-01'),
      total: 500,
      customerId: 2,
      customerName: 'عميل ب',
      payments: [payment(3, 2, '2025-01-15', 200)],
    }),
    invoice({
      id: 3,
      issueDate: d('2024-04-01'),
      total: 2000,
      payments: [payment(4, 3, '2024-08-01', 2000)],
    }),
    invoice({
      id: 4,
      issueDate: d('2025-05-01'),
      dueDate: d('2025-06-01'),
      total: 800,
      customerId: 2,
      customerName: 'عميل ب',
      contractId: 20,
      contractCode: 'C-20',
      payments: [],
    }),
  ];
  return { invoices, latestActivity: d('2025-12-31') };
}

const report = (filters = {}) => new CollectionAnalysisEngine(dataset(), filters).report();

/* ── البطاقات ───────────────────────────────────────────────────────────── */

describe('CollectionAnalysisEngine — بطاقات المؤشرات', () => {
  it('يجمع قيمة الفواتير والتحصيل والرصيد بلا تسرّب', () => {
    const k = report().kpis;
    expect(k.totalInvoiceValue).toBe(4300); // 1000 + 500 + 2000 + 800
    expect(k.totalCollected).toBe(3200); // 400 + 600 + 200 + 2000
    expect(k.outstanding).toBe(1100); // 300 (INV-2) + 800 (INV-4)
    expect(k.invoiceCount).toBe(4);
    expect(k.collectionCount).toBe(4);
  });

  it('يفصل المحصَّل داخل سنة الفاتورة عن المُرحَّل إلى سنوات أخرى', () => {
    const k = report().kpis;
    expect(k.collectedSameYear).toBe(2400); // 400 (2023) + 2000 (2024)
    expect(k.collectedOtherYears).toBe(800); // 600 (2024 عن 2023) + 200 (2025 عن 2023)
    expect(k.collectedSameYear + k.collectedOtherYears).toBe(k.totalCollected);
  });

  it('يحدّد أكبر سنة استقبلت تحصيلًا مُرحَّلًا', () => {
    const k = report().kpis;
    expect(k.largestDeferredYear).toBe(2024);
    expect(k.largestDeferredAmount).toBe(600);
  });

  it('نسبة التحصيل مشتقّة من المجموعين لا محسوبة على حدة', () => {
    const k = report().kpis;
    expect(k.collectionRate).toBeCloseTo((3200 / 4300) * 100, 2);
  });
});

/* ── الملخص ─────────────────────────────────────────────────────────────── */

describe('CollectionAnalysisEngine — ملخص سنة الفاتورة', () => {
  it('يبني صفًّا لكل سنة إصدار مرتّبةً تصاعديًا', () => {
    expect(report().summary.rows.map((r) => r.invoiceYear)).toEqual([2023, 2024, 2025]);
  });

  it('«المؤجَّل عن سنته» يساوي المحصَّل في سنوات أخرى زائد الرصيد — هويّة لا مصادفة', () => {
    for (const row of report().summary.rows) {
      expect(row.variance).toBeCloseTo(row.collectedOtherYears + row.outstanding, 3);
      expect(row.variance).toBeCloseTo(row.invoiceValue - row.collectedSameYear, 3);
    }
  });

  it('صفّ 2023 يفصل تحصيله داخل سنته عمّا رُحِّل عنها', () => {
    const row = report().summary.rows.find((r) => r.invoiceYear === 2023)!;
    expect(row.invoiceValue).toBe(1500);
    expect(row.collectedSameYear).toBe(400);
    expect(row.collectedOtherYears).toBe(800);
    expect(row.outstanding).toBe(300);
  });

  it('مجاميع الملخص تطابق البطاقات بالضبط', () => {
    const { summary, kpis } = report();
    expect(summary.totals.invoiceValue).toBe(kpis.totalInvoiceValue);
    expect(summary.totals.outstanding).toBe(kpis.outstanding);
    expect(summary.totals.collectedSameYear).toBe(kpis.collectedSameYear);
    expect(summary.rows.reduce((s, r) => s + r.invoiceValue, 0)).toBe(kpis.totalInvoiceValue);
  });
});

/* ── الترحيل والمصفوفة ──────────────────────────────────────────────────── */

describe('CollectionAnalysisEngine — ترحيل التحصيل', () => {
  it('صفّ لكل زوج (سنة إصدار ⇢ سنة تحصيل) له مبلغ فعلي', () => {
    const pairs = report().transfer.map((r) => [r.invoiceYear, r.collectionYear, r.amount]);
    expect(pairs).toEqual([
      [2023, 2023, 400],
      [2023, 2024, 600],
      [2023, 2025, 200],
      [2024, 2024, 2000],
    ]);
  });

  it('النسبة محسوبة داخل سنة الإصدار لا من الإجمالي', () => {
    const rows = report().transfer.filter((r) => r.invoiceYear === 2023);
    const total = rows.reduce((s, r) => s + (r.percent ?? 0), 0);
    expect(total).toBeCloseTo(100, 1);
    expect(rows.find((r) => r.collectionYear === 2024)!.percent).toBeCloseTo((600 / 1200) * 100, 2);
  });
});

describe('CollectionAnalysisEngine — المصفوفة', () => {
  it('محوراها مشتقّان من البيانات، بلا أي سنة مكتوبة مسبقًا', () => {
    const m = report().matrix;
    expect(m.invoiceYears).toEqual([2023, 2024, 2025]);
    expect(m.collectionYears).toEqual([2023, 2024, 2025]);
  });

  it('الخلايا تحمل المبلغ المحصَّل لكل تقاطع', () => {
    const m = report().matrix;
    const at = (invoiceYear: number, collectionYear: number) =>
      m.cells[m.invoiceYears.indexOf(invoiceYear)][m.collectionYears.indexOf(collectionYear)];
    expect(at(2023, 2023)).toBe(400);
    expect(at(2023, 2024)).toBe(600);
    expect(at(2023, 2025)).toBe(200);
    expect(at(2024, 2024)).toBe(2000);
    expect(at(2024, 2023)).toBe(0);
  });

  it('مجاميع الصفوف والأعمدة والمجموع الكلي متسقة', () => {
    const m = report().matrix;
    expect(m.rowTotals).toEqual([1200, 2000, 0]);
    expect(m.columnTotals).toEqual([400, 2600, 200]);
    expect(m.grandTotal).toBe(3200);
    expect(m.rowTotals.reduce((s, v) => s + v, 0)).toBe(m.grandTotal);
    expect(m.columnTotals.reduce((s, v) => s + v, 0)).toBe(m.grandTotal);
  });

  it('يتّسع لسنة جديدة تلقائيًا دون أي تعديل', () => {
    const base = dataset();
    base.invoices[3].payments = [payment(9, 4, '2031-02-01', 800)];
    const m = new CollectionAnalysisEngine(base).report().matrix;
    expect(m.collectionYears).toContain(2031);
    expect(m.cells[m.invoiceYears.indexOf(2025)][m.collectionYears.indexOf(2031)]).toBe(800);
  });
});

/* ── الأرصدة ────────────────────────────────────────────────────────────── */

describe('CollectionAnalysisEngine — الأرصدة القائمة', () => {
  it('يقصر الصفوف على السنوات ذات رصيد فعلي', () => {
    const rows = report().outstanding.rows;
    expect(rows.map((r) => r.invoiceYear)).toEqual([2023, 2025]);
    expect(rows.find((r) => r.invoiceYear === 2023)!.outstanding).toBe(300);
  });

  it('النسب تجمع إلى 100% بالضبط', () => {
    const rows = report().outstanding.rows;
    expect(rows.reduce((s, r) => s + (r.percent ?? 0), 0)).toBeCloseTo(100, 5);
  });

  it('يحسب الأعمار حتى نهاية النطاق لا حتى اليوم', () => {
    const r = new CollectionAnalysisEngine(dataset(), { collectionTo: '2025-12-31' }).report();
    expect(r.period.asOf).toBe('2025-12-31');
    // INV-4 صدرت في 2025-05-01 ⇒ 244 يومًا حتى 2025-12-31.
    expect(r.outstanding.rows.find((row) => row.invoiceYear === 2025)!.averageAgeDays).toBe(244);
  });

  it('يسجّل أقدم فاتورة ذات رصيد لكل سنة', () => {
    const row = report().outstanding.rows.find((r) => r.invoiceYear === 2023)!;
    expect(row.oldestOutstandingNumber).toBe('INV-2');
    expect(row.oldestOutstandingDate).toBe('2023-09-01');
  });
});

/* ── الفلاتر ────────────────────────────────────────────────────────────── */

describe('CollectionAnalysisEngine — الفلاتر تعمل مجتمعةً', () => {
  it('حصر سنة الفاتورة يستبعد الفواتير لا التحصيلات', () => {
    const r = report({ invoiceYear: 2023 });
    expect(r.kpis.invoiceCount).toBe(2);
    expect(r.kpis.totalCollected).toBe(1200);
    expect(r.matrix.invoiceYears).toEqual([2023]);
  });

  it('حصر سنة التحصيل يحصر الدفعات ولا يمسّ الرصيد القائم', () => {
    const r = report({ collectionYear: 2024 });
    expect(r.kpis.totalCollected).toBe(2600); // 600 + 2000
    // الرصيد يبقى محسوبًا على كل تحصيلات الفاتورة مهما وقعت.
    expect(r.kpis.outstanding).toBe(1100);
    expect(r.kpis.invoiceCount).toBe(4);
  });

  it('نطاق تاريخ التحصيل يقصّ الدفعات بحدّيه', () => {
    const r = report({ collectionFrom: '2024-01-01', collectionTo: '2024-12-31' });
    expect(r.kpis.totalCollected).toBe(2600);
  });

  it('«داخل سنة الفاتورة» و«في سنوات أخرى» متكاملان', () => {
    const same = report({ collectionScope: 'same-year' }).kpis.totalCollected;
    const other = report({ collectionScope: 'other-years' }).kpis.totalCollected;
    expect(same).toBe(2400);
    expect(other).toBe(800);
    expect(same + other).toBe(report().kpis.totalCollected);
  });

  it('حالة السداد تُشتقّ من المبالغ لا من حقل مخزَّن', () => {
    expect(report({ settlement: 'PAID' }).kpis.invoiceCount).toBe(2); // INV-1, INV-3
    expect(report({ settlement: 'PARTIAL' }).kpis.invoiceCount).toBe(1); // INV-2
    expect(report({ settlement: 'UNPAID' }).kpis.invoiceCount).toBe(1); // INV-4
  });

  it('«ذات رصيد قائم فقط» و«المتأخرة فقط» يعملان مع بقيّة الفلاتر', () => {
    expect(report({ outstandingOnly: true }).kpis.invoiceCount).toBe(2);
    // INV-4 وحدها لها تاريخ استحقاق مضى ورصيد قائم.
    expect(report({ overdueOnly: true }).kpis.invoiceCount).toBe(1);
    expect(report({ overdueOnly: true, invoiceYear: 2023 }).kpis.invoiceCount).toBe(0);
  });

  it('البحث يغطّي رقم الفاتورة والعميل والعقد ومرجع الدفعة', () => {
    expect(report({ search: 'INV-3' }).kpis.invoiceCount).toBe(1);
    expect(report({ search: 'عميل ب' }).kpis.invoiceCount).toBe(2);
    expect(report({ search: 'C-20' }).kpis.invoiceCount).toBe(1);
    expect(report({ search: 'REF-4' }).kpis.invoiceCount).toBe(1);
  });
});

/* ── حصر المشروع والتوزيع بالتناسب ──────────────────────────────────────── */

describe('CollectionAnalysisEngine — توزيع المشروع بالتناسب', () => {
  /** فاتورة واحدة موزّعة على مشروعين بنسبة 75% / 25%. */
  function splitDataset(): CollectionDataset {
    return {
      latestActivity: d('2024-12-31'),
      invoices: [
        invoice({
          id: 7,
          issueDate: d('2024-01-01'),
          total: 1000,
          projectShares: [
            { projectId: 5, projectName: 'مشروع أ', ratio: 0.75 },
            { projectId: 6, projectName: 'مشروع ب', ratio: 0.25 },
          ],
          payments: [payment(20, 7, '2024-06-01', 400)],
        }),
      ],
    };
  }

  it('بلا حصر: الفاتورة تُحسب كاملةً مرّة واحدة', () => {
    const k = new CollectionAnalysisEngine(splitDataset()).report().kpis;
    expect(k.totalInvoiceValue).toBe(1000);
    expect(k.totalCollected).toBe(400);
  });

  it('مع حصر بمشروع: القيمة والتحصيل يُضربان في حصّته', () => {
    const k = new CollectionAnalysisEngine(splitDataset(), { projectId: 6 }).report().kpis;
    expect(k.totalInvoiceValue).toBe(250);
    expect(k.totalCollected).toBe(100);
    expect(k.outstanding).toBe(150);
    // الفاتورة شاركت فعلًا، فعدّها يبقى صحيحًا ولا يُكسَر.
    expect(k.invoiceCount).toBe(1);
  });

  it('حصر بمشروع لا حصّة فيه يستبعد الفاتورة كليًا', () => {
    expect(new CollectionAnalysisEngine(splitDataset(), { projectId: 99 }).report().kpis.invoiceCount).toBe(0);
  });

  it('محور المشاريع يوزّع الفاتورة على مجموعاتها ومجموعه يعيد الأصل', () => {
    const rows = new CollectionAnalysisEngine(splitDataset()).report().performance.project;
    expect(rows.map((r) => r.name).sort()).toEqual(['مشروع أ', 'مشروع ب']);
    expect(rows.reduce((s, r) => s + r.invoiced, 0)).toBeCloseTo(1000, 3);
    expect(rows.reduce((s, r) => s + r.collected, 0)).toBeCloseTo(400, 3);
  });
});

/* ── الأداء والتفصيل ────────────────────────────────────────────────────── */

describe('CollectionAnalysisEngine — الأداء والتفصيل', () => {
  it('محور العملاء يجمع الفواتير تحت عميلها ومجموعه يطابق الإجمالي', () => {
    const rows = report().performance.customer;
    expect(rows.map((r) => r.name).sort()).toEqual(['عميل أ', 'عميل ب']);
    expect(rows.reduce((s, r) => s + r.invoiced, 0)).toBe(4300);
    expect(rows.reduce((s, r) => s + r.outstanding, 0)).toBe(1100);
  });

  it('التفصيل يعيد فواتير الخليّة مع خطّ زمن تحصيلاتها', () => {
    const engine = new CollectionAnalysisEngine(dataset());
    const result = engine.drilldown({ scopeInvoiceYear: 2023, scopeCollectionYear: 2024 });
    expect(result.count).toBe(1);
    expect(result.rows[0].invoiceNumber).toBe('INV-1');
    expect(result.rows[0].payments.map((p) => p.amount)).toEqual([600]);
  });

  it('الرصيد بعد كل دفعة تراكمي على **كل** دفعات الفاتورة لا على المعروضة وحدها', () => {
    const engine = new CollectionAnalysisEngine(dataset());
    const row = engine.drilldown({ scopeInvoiceYear: 2023, scopeCollectionYear: 2024 }).rows[0];
    // 1000 − 400 (دفعة 2023 غير المعروضة) − 600 = 0
    expect(row.payments[0].remainingAfter).toBe(0);
    expect(row.payments[0].daysToCollect).toBeGreaterThan(300);
  });

  it('مجاميع نافذة التفصيل تطابق الصفّ الذي فُتحت منه', () => {
    const engine = new CollectionAnalysisEngine(dataset());
    const result = engine.drilldown({ scopeInvoiceYear: 2023 });
    const summaryRow = engine.report().summary.rows.find((r) => r.invoiceYear === 2023)!;
    expect(result.totals.invoiced).toBe(summaryRow.invoiceValue);
    expect(result.totals.outstanding).toBe(summaryRow.outstanding);
  });

  it('التفصيل على محور يعيد فواتير ذلك العنصر وحده', () => {
    const engine = new CollectionAnalysisEngine(dataset());
    const result = engine.drilldown({ dimension: 'customer', dimensionId: 2 });
    expect(result.rows.map((r) => r.invoiceNumber).sort()).toEqual(['INV-2', 'INV-4']);
  });
});

/* ── قوائم الاختيار ─────────────────────────────────────────────────────── */

describe('CollectionAnalysisEngine — قوائم الفلاتر', () => {
  it('تُشتقّ من البيانات كاملةً لا من الصفوف المفلترة، فلا تنكمش وتمنع التراجع', () => {
    const facets = report({ invoiceYear: 2023 }).facets;
    expect(facets.invoiceYears).toEqual([2025, 2024, 2023]);
    expect(facets.collectionYears).toEqual([2025, 2024, 2023]);
    expect(facets.customers).toHaveLength(2);
  });
});

/* ── مساعدات ────────────────────────────────────────────────────────────── */

describe('مساعدات المحرّك', () => {
  it('حالة السداد تتسامح مع فروق التقريب دون السماح بفلس كامل', () => {
    expect(settlementOf(1000, 1000)).toBe('PAID');
    expect(settlementOf(1000, 999.9999)).toBe('PAID');
    expect(settlementOf(1000, 999)).toBe('PARTIAL');
    expect(settlementOf(1000, 0)).toBe('UNPAID');
  });

  it('تطبيع البحث يوحّد الألف والياء والهمزات والتاء المربوطة', () => {
    expect(normalizeArabic('أحمد')).toBe(normalizeArabic('احمد'));
    expect(normalizeArabic('شركة')).toBe(normalizeArabic('شركه'));
    expect(normalizeArabic('مسؤول')).toBe(normalizeArabic('مسوول'));
    expect(normalizeArabic('قائم')).toBe(normalizeArabic('قايم'));
    expect(normalizeArabic('ABC')).toBe('abc');
  });

  /**
   * حارس دائم: الواجهة تبحث بـ`normalizeSearch` والخادم بـ`normalizeArabic`.
   * انحرافهما يعني صفًّا ظاهرًا في الجدول وتفصيلًا فارغًا تحته.
   */
  it('تطبيع الخادم مطابق حرفيًا لتطبيع الواجهة', () => {
    const frontendSource = readFileSync(
      resolve(__dirname, '../../../../../frontend/src/lib/arabicSearch.ts'),
      'utf8',
    );
    /** قواعد `.replace(...)` كما هي في ملف الواجهة، بترتيبها. */
    const rulesOf = (src: string) =>
      (src.match(/\.replace\([^)]*\)/g) ?? []).map((r) => r.replace(/\s+/g, ''));

    const engineSource = readFileSync(resolve(__dirname, '../collectionAnalysis.engine.ts'), 'utf8');
    const engineFn = engineSource.slice(engineSource.indexOf('export function normalizeArabic'));

    expect(rulesOf(engineFn.slice(0, engineFn.indexOf('trim()')))).toEqual(
      rulesOf(frontendSource.slice(frontendSource.indexOf('export function normalizeSearch'))),
    );
  });
});

/* ── الحالة الفارغة ─────────────────────────────────────────────────────── */

describe('CollectionAnalysisEngine — بلا بيانات', () => {
  it('يعيد تقريرًا صالحًا فارغًا بلا NaN ولا استثناء', () => {
    const r = new CollectionAnalysisEngine({ invoices: [], latestActivity: null }).report();
    expect(r.kpis.totalInvoiceValue).toBe(0);
    expect(r.kpis.collectionRate).toBeNull();
    expect(r.kpis.averageCollectionDays).toBeNull();
    expect(r.kpis.largestDeferredYear).toBeNull();
    expect(r.matrix.invoiceYears).toEqual([]);
    expect(r.matrix.grandTotal).toBe(0);
    expect(r.outstanding.rows).toEqual([]);
    expect(r.summary.totals.collectionRate).toBeNull();
  });
});
