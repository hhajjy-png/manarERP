/* ════════════════════════════════════════════════════════════════════════════
   CollectionAnalysisEngine — محرّك تحليل التحصيلات (نقيّ).

   لا Prisma، لا I/O، ولا `new Date()`: تدخل `CollectionDataset` + فلاتر، وتخرج
   `CollectionAnalysisReport`. نفس المدخل ⇒ نفس المخرج دائمًا، فيُختبر بلا قاعدة
   بيانات ويصلح لأي وحدة مستقبلية تحتاج نفس العلاقات.

   ═══ الفكرة المركزية ═══
   كل شيء في هذا الملف مبنيّ على **حقيقة الفاتورة** (`InvoiceFact`): تُبنى مرّة
   واحدة لكل فاتورة في تمريرة واحدة، ثم تُشتقّ منها الجداول الخمسة والبطاقات
   الثماني بتجميع مفهرَس (`Map`) لا بحلقات متداخلة. الكلفة خطّية مع عدد الفواتير
   والدفعات مهما بلغ عدد السنوات المالية.

   ═══ ثلاث قواعد محاسبية ثابتة ═══
   1) **الرصيد القائم يُحسب من التحصيل الكلي للفاتورة**، لا من التحصيل داخل نطاق
      التاريخ المختار. نطاق التحصيل يحصر ما يُعدّ «تحصيلًا في الفترة»، ولا يمكنه
      أن يُنشئ رصيدًا وهميًا على فاتورة مسدَّدة فعلًا.

   2) **السنة المالية = السنة الميلادية** في هذا النظام (لا سنة مزاحة). سنة
      الفاتورة من `issueDate`، وسنة التحصيل من `Payment.date` — تاريخ التحصيل
      الرسمي القابل للتعديل، وهو نفسه الذي تعتمده كل تقارير التحصيل.

   3) **حصر المشروع يوزّع بالتناسب**: المشروع يعيش على بنود الفاتورة لا على
      الفاتورة، فحصر التقرير بمشروع يضرب قيم الفاتورة وتحصيلاتها في حصّته من
      قيمة البنود. عدد الفواتير يبقى صحيحًا (الفاتورة شاركت فعلًا).
   ════════════════════════════════════════════════════════════════════════════ */

import { roundMoney } from '../../shared/utils/money';
import { toLocalDateString } from '../../core/utils/dateWindows';
// النسبة وتوزيع البواقي من **طقم التحليل المشترك** لا من محرّك التحليل المالي:
// المحرّكان مستقلّان بقواعدهما، ويتشاركان الأدوات الرقمية وحدها.
import { apportionPercents, percentOf } from '../reports/analysisKit';
import type {
  CollectionAnalysisReport,
  CollectionDataset,
  CollectionDrilldownResult,
  CollectionFacets,
  CollectionFilters,
  CollectionKpis,
  CollectionMatrix,
  CollectionPeriod,
  CollectionSummaryRow,
  CollectionSummaryTotals,
  CollectionTransferRow,
  DatasetInvoice,
  DatasetPayment,
  DrilldownInvoice,
  DrilldownPayment,
  DrilldownScope,
  OutstandingRow,
  OutstandingTotals,
  PerformanceDimension,
  PerformanceRow,
  PerformanceSection,
  SettlementStatus,
} from './collectionAnalysis.types';

/** أقصى عدد فواتير تُعاد في التنقّل التفصيلي؛ المجاميع تبقى على الكل. */
export const COLLECTION_DRILLDOWN_LIMIT = 300;

/** اسم البديل حين لا يرتبط السجل بعميل/عقد/مشروع مسجَّل. */
export const UNASSIGNED_LABEL = 'غير محدّد';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** أقل من فلس واحد ⇒ رصيد مسدَّد. لا يُعدّ فرق تقريب دينًا قائمًا. */
const SETTLED_TOLERANCE = 0.0005;

/* ── أدوات صغيرة ────────────────────────────────────────────────────────── */

/** منتصف ليل محلي — يُلغي أثر ساعة اليوم على فروق الأيام. */
function localMidnight(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/**
 * أيام بين تاريخين، بلا سالب.
 *
 * القصّ عند الصفر مقصود: دفعة مقدّمة قبل الإصدار (نادرة لكنها ممكنة) ليست
 * «تحصيلًا في سالب من الأيام» — هي تحصيل فوري، ومتوسط مرجَّح بسالب يفسد المؤشر.
 */
function daysBetween(from: Date, to: Date): number {
  return Math.max(0, Math.round((localMidnight(to) - localMidnight(from)) / MS_PER_DAY));
}

/** `YYYY-MM-DD` → تاريخ محلي، أو `null` لأي نص غير صالح. */
function parseLocalDate(iso: string | null | undefined): Date | null {
  if (!iso) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null;
}

/**
 * تطبيع نصّ للبحث العربي.
 *
 * **مرآة حرفية** لـ`frontend/src/lib/arabicSearch.ts#normalizeSearch` — وهذا
 * ليس ترفًا: الجدول يبحث في الواجهة بذلك التطبيع، والخادم يبحث بهذا. أي
 * انحراف بينهما يعني أن نفس الكلمة تُطابق في مكان ولا تُطابق في الآخر —
 * فيرى المستخدم صفًا في الجدول ثم يجد التفصيل فارغًا. القواعد متطابقة سطرًا بسطر.
 */
export function normalizeArabic(value: string): string {
  return value
    .replace(/[ً-ٰٟ]/g, '') // تشكيل
    .replace(/ـ/g, '') // تطويل
    .replace(/[إأآا]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ئ/g, 'ي')
    .replace(/ؤ/g, 'و')
    .replace(/ة/g, 'ه')
    .toLowerCase()
    .trim();
}

/* ── حقيقة الفاتورة ─────────────────────────────────────────────────────── */

interface YearBucket {
  amount: number;
  paymentCount: number;
}

/**
 * كل ما تحتاجه الجداول عن فاتورة واحدة — يُحسب مرّة، ويُقرأ مرارًا.
 */
interface InvoiceFact {
  invoice: DatasetInvoice;
  invoiceYear: number;
  /** الوزن المطبَّق (حصّة المشروع عند الحصر بمشروع، وإلا 1). */
  weight: number;
  /** قيمة الفاتورة بعد الوزن. */
  value: number;
  /** التحصيل الكلي (بلا نطاق) بعد الوزن — أساس الرصيد. */
  collectedTotal: number;
  /** التحصيل داخل النطاق المختار بعد الوزن. */
  collectedInScope: number;
  /** الرصيد القائم = القيمة − التحصيل الكلي. */
  remaining: number;
  status: SettlementStatus;
  overdue: boolean;
  /** الدفعات المحتسَبة بعد الفلاتر، بترتيب التاريخ. */
  scopedPayments: DatasetPayment[];
  /** المحصَّل داخل سنة الفاتورة نفسها. */
  collectedSameYear: number;
  /** المحصَّل في أي سنة أخرى (لاحقة أو سابقة). */
  collectedOtherYears: number;
  /** تجميع مفهرَس: سنة التحصيل ⇒ المبلغ وعدد الدفعات. */
  byCollectionYear: Map<number, YearBucket>;
  /** مجموع (المبلغ × أيام التحصيل) — بسط المتوسط المرجَّح. */
  weightedDays: number;
  /** اسم المشروع المعروض (الأكبر حصّةً، أو المشروع المحصور به). */
  projectName: string;
}

/* ── المحرّك ────────────────────────────────────────────────────────────── */

export class CollectionAnalysisEngine {
  private readonly facts: InvoiceFact[];
  private readonly asOf: Date | null;
  private readonly period: CollectionPeriod;
  /** البطاقات تُقرأ مرّتين (البطاقات نفسها + صفّ مجاميع الملخّص) — تمريرة واحدة تكفي. */
  private kpisCache: CollectionKpis | null = null;

  constructor(
    private readonly dataset: CollectionDataset,
    private readonly filters: CollectionFilters = {},
  ) {
    this.asOf = this.resolveAsOf();
    this.period = {
      invoiceFrom: filters.invoiceFrom ?? null,
      invoiceTo: filters.invoiceTo ?? null,
      collectionFrom: filters.collectionFrom ?? null,
      collectionTo: filters.collectionTo ?? null,
      asOf: this.asOf ? toLocalDateString(this.asOf) : null,
    };
    this.facts = this.buildFacts();
  }

  /**
   * تاريخ الاحتساب: نهاية نطاق التحصيل، ثم نهاية نطاق الفواتير، ثم أحدث حركة.
   * **بلا `new Date()`** — الطبقة نقيّة، ولا يجوز أن يتغيّر تقرير بتغيّر الساعة.
   */
  private resolveAsOf(): Date | null {
    return (
      parseLocalDate(this.filters.collectionTo) ??
      parseLocalDate(this.filters.invoiceTo) ??
      this.dataset.latestActivity
    );
  }

  /* ── بناء الحقائق: تمريرة واحدة على الفواتير ─────────────────────────── */

  private buildFacts(): InvoiceFact[] {
    const f = this.filters;
    const searchTerm = f.search ? normalizeArabic(f.search) : '';
    const collectionFrom = parseLocalDate(f.collectionFrom);
    const collectionTo = parseLocalDate(f.collectionTo);
    const facts: InvoiceFact[] = [];

    for (const invoice of this.dataset.invoices) {
      const invoiceYear = invoice.issueDate.getFullYear();
      if (f.invoiceYear != null && invoiceYear !== f.invoiceYear) continue;

      const weight = this.projectWeight(invoice);
      if (weight == null) continue; // لا حصّة له في المشروع المحصور به

      const value = roundMoney(invoice.total * weight);

      // التحصيل الكلي **قبل** أي نطاق — أساس الرصيد الحقيقي.
      let collectedRaw = 0;
      for (const p of invoice.payments) collectedRaw += p.amount;
      const collectedTotal = roundMoney(collectedRaw * weight);
      const remaining = roundMoney(value - collectedTotal);

      const status = settlementOf(value, collectedTotal);
      const overdue =
        remaining > SETTLED_TOLERANCE &&
        invoice.dueDate != null &&
        this.asOf != null &&
        localMidnight(invoice.dueDate) < localMidnight(this.asOf);

      if (f.settlement && status !== f.settlement) continue;
      if (f.outstandingOnly && !(remaining > SETTLED_TOLERANCE)) continue;
      if (f.overdueOnly && !overdue) continue;

      const projectName = this.displayProject(invoice);
      if (searchTerm && !matchesSearch(invoice, projectName, searchTerm)) continue;

      // ── الدفعات المحتسَبة ──
      const scopedPayments: DatasetPayment[] = [];
      const byCollectionYear = new Map<number, YearBucket>();
      let collectedInScopeRaw = 0;
      let sameYearRaw = 0;
      let otherYearsRaw = 0;
      let weightedDaysRaw = 0;

      for (const p of invoice.payments) {
        const year = p.date.getFullYear();
        if (collectionFrom && localMidnight(p.date) < localMidnight(collectionFrom)) continue;
        if (collectionTo && localMidnight(p.date) > localMidnight(collectionTo)) continue;
        if (f.collectionYear != null && year !== f.collectionYear) continue;
        const sameYear = year === invoiceYear;
        if (f.collectionScope === 'same-year' && !sameYear) continue;
        if (f.collectionScope === 'other-years' && sameYear) continue;

        scopedPayments.push(p);
        const amount = p.amount * weight;
        collectedInScopeRaw += amount;
        if (sameYear) sameYearRaw += amount;
        else otherYearsRaw += amount;
        weightedDaysRaw += amount * daysBetween(invoice.issueDate, p.date);

        const bucket = byCollectionYear.get(year);
        if (bucket) {
          bucket.amount += amount;
          bucket.paymentCount += 1;
        } else {
          byCollectionYear.set(year, { amount, paymentCount: 1 });
        }
      }

      for (const bucket of byCollectionYear.values()) bucket.amount = roundMoney(bucket.amount);

      facts.push({
        invoice,
        invoiceYear,
        weight,
        value,
        collectedTotal,
        collectedInScope: roundMoney(collectedInScopeRaw),
        remaining,
        status,
        overdue,
        scopedPayments,
        collectedSameYear: roundMoney(sameYearRaw),
        collectedOtherYears: roundMoney(otherYearsRaw),
        byCollectionYear,
        weightedDays: weightedDaysRaw,
        projectName,
      });
    }

    return facts;
  }

  /**
   * وزن الفاتورة تحت حصر المشروع.
   *
   * `null` ⇒ الفاتورة خارج المشروع المحصور به فتُستبعد كليًا. بلا حصر ⇒ `1`.
   */
  private projectWeight(invoice: DatasetInvoice): number | null {
    const wanted = this.filters.projectId;
    if (wanted == null) return 1;
    const share = invoice.projectShares.find((s) => s.projectId === wanted);
    return share ? share.ratio : null;
  }

  /** اسم المشروع المعروض: المحصور به إن وُجد، وإلا الأكبر حصّةً. */
  private displayProject(invoice: DatasetInvoice): string {
    const wanted = this.filters.projectId;
    if (wanted != null) {
      const match = invoice.projectShares.find((s) => s.projectId === wanted);
      if (match) return match.projectName;
    }
    let best = invoice.projectShares[0];
    for (const s of invoice.projectShares) if (best == null || s.ratio > best.ratio) best = s;
    return best?.projectName ?? UNASSIGNED_LABEL;
  }

  /* ── 1. بطاقات المؤشّرات ─────────────────────────────────────────────── */

  private buildKpis(): CollectionKpis {
    if (this.kpisCache) return this.kpisCache;
    let invoiceValue = 0;
    let collected = 0;
    let sameYear = 0;
    let otherYears = 0;
    let outstanding = 0;
    let weightedDays = 0;
    let collectionCount = 0;
    /** سنة التحصيل ⇒ المبلغ المُرحَّل إليها من سنوات إصدار أخرى. */
    const deferredByYear = new Map<number, number>();

    for (const fact of this.facts) {
      invoiceValue += fact.value;
      collected += fact.collectedInScope;
      sameYear += fact.collectedSameYear;
      otherYears += fact.collectedOtherYears;
      outstanding += fact.remaining;
      weightedDays += fact.weightedDays;
      collectionCount += fact.scopedPayments.length;

      for (const [year, bucket] of fact.byCollectionYear) {
        if (year === fact.invoiceYear) continue;
        deferredByYear.set(year, (deferredByYear.get(year) ?? 0) + bucket.amount);
      }
    }

    let largestDeferredYear: number | null = null;
    let largestDeferredAmount = 0;
    for (const [year, amount] of deferredByYear) {
      // تعادل ⇒ السنة الأحدث، فيبقى الاختيار حتميًا لا رهينَ ترتيب الإدراج.
      if (amount > largestDeferredAmount || (amount === largestDeferredAmount && largestDeferredYear != null && year > largestDeferredYear)) {
        largestDeferredAmount = amount;
        largestDeferredYear = year;
      }
    }

    const totalCollected = roundMoney(collected);
    const totalInvoiceValue = roundMoney(invoiceValue);

    this.kpisCache = {
      totalInvoiceValue,
      totalCollected,
      collectionRate: percentOf(totalCollected, totalInvoiceValue),
      collectedSameYear: roundMoney(sameYear),
      collectedOtherYears: roundMoney(otherYears),
      outstanding: roundMoney(outstanding),
      averageCollectionDays: collected > 0 ? Math.round(weightedDays / collected) : null,
      largestDeferredYear,
      largestDeferredAmount: roundMoney(largestDeferredAmount),
      invoiceCount: this.facts.length,
      collectionCount,
    };
    return this.kpisCache;
  }

  /* ── 2. ملخّص التحصيل حسب سنة الإصدار ────────────────────────────────── */

  private buildSummary(): { rows: CollectionSummaryRow[]; totals: CollectionSummaryTotals } {
    interface Acc {
      invoiceValue: number;
      sameYear: number;
      otherYears: number;
      outstanding: number;
      weightedDays: number;
      collected: number;
      invoiceCount: number;
    }
    const blank = (): Acc => ({
      invoiceValue: 0, sameYear: 0, otherYears: 0, outstanding: 0, weightedDays: 0, collected: 0, invoiceCount: 0,
    });
    const byYear = new Map<number, Acc>();

    for (const fact of this.facts) {
      let acc = byYear.get(fact.invoiceYear);
      if (!acc) {
        acc = blank();
        byYear.set(fact.invoiceYear, acc);
      }
      acc.invoiceValue += fact.value;
      acc.sameYear += fact.collectedSameYear;
      acc.otherYears += fact.collectedOtherYears;
      acc.outstanding += fact.remaining;
      acc.weightedDays += fact.weightedDays;
      acc.collected += fact.collectedInScope;
      acc.invoiceCount += 1;
    }

    const rows: CollectionSummaryRow[] = Array.from(byYear.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([invoiceYear, a]) => {
        const invoiceValue = roundMoney(a.invoiceValue);
        const collectedSameYear = roundMoney(a.sameYear);
        return {
          invoiceYear,
          invoiceValue,
          collectedSameYear,
          collectedOtherYears: roundMoney(a.otherYears),
          outstanding: roundMoney(a.outstanding),
          collectionRate: percentOf(roundMoney(a.collected), invoiceValue),
          averageDays: a.collected > 0 ? Math.round(a.weightedDays / a.collected) : null,
          variance: roundMoney(invoiceValue - collectedSameYear),
          invoiceCount: a.invoiceCount,
        };
      });

    const kpis = this.buildKpis();
    const totalDays = this.facts.reduce((s, f) => s + f.weightedDays, 0);
    const totalCollected = kpis.totalCollected;

    return {
      rows,
      totals: {
        invoiceValue: kpis.totalInvoiceValue,
        collectedSameYear: kpis.collectedSameYear,
        collectedOtherYears: kpis.collectedOtherYears,
        outstanding: kpis.outstanding,
        collectionRate: kpis.collectionRate,
        averageDays: totalCollected > 0 ? Math.round(totalDays / totalCollected) : null,
        variance: roundMoney(kpis.totalInvoiceValue - kpis.collectedSameYear),
        invoiceCount: kpis.invoiceCount,
      },
    };
  }

  /* ── 3. ترحيل التحصيل بين السنوات ────────────────────────────────────── */

  private buildTransfer(): CollectionTransferRow[] {
    interface Cell {
      amount: number;
      paymentCount: number;
      invoiceIds: Set<number>;
    }
    /** مفتاح مركّب `<سنة الفاتورة>:<سنة التحصيل>` — تجميع مفهرَس بلا تداخل حلقات. */
    const cells = new Map<string, Cell>();
    /** إجمالي ما حُصِّل عن فواتير كل سنة — مقام النسبة. */
    const byInvoiceYear = new Map<number, number>();

    for (const fact of this.facts) {
      for (const [collectionYear, bucket] of fact.byCollectionYear) {
        const key = `${fact.invoiceYear}:${collectionYear}`;
        let cell = cells.get(key);
        if (!cell) {
          cell = { amount: 0, paymentCount: 0, invoiceIds: new Set() };
          cells.set(key, cell);
        }
        cell.amount += bucket.amount;
        cell.paymentCount += bucket.paymentCount;
        cell.invoiceIds.add(fact.invoice.id);
        byInvoiceYear.set(fact.invoiceYear, (byInvoiceYear.get(fact.invoiceYear) ?? 0) + bucket.amount);
      }
    }

    const rows = Array.from(cells.entries())
      .map(([key, cell]) => {
        const [invoiceYear, collectionYear] = key.split(':').map(Number);
        return {
          invoiceYear,
          collectionYear,
          amount: roundMoney(cell.amount),
          percent: percentOf(cell.amount, byInvoiceYear.get(invoiceYear) ?? 0),
          invoiceCount: cell.invoiceIds.size,
          paymentCount: cell.paymentCount,
        };
      })
      .sort((a, b) => a.invoiceYear - b.invoiceYear || a.collectionYear - b.collectionYear);

    return rows;
  }

  /* ── 4. مصفوفة انتقال التحصيل ────────────────────────────────────────── */

  private buildMatrix(): CollectionMatrix {
    const invoiceYearSet = new Set<number>();
    const collectionYearSet = new Set<number>();
    for (const fact of this.facts) {
      invoiceYearSet.add(fact.invoiceYear);
      for (const year of fact.byCollectionYear.keys()) collectionYearSet.add(year);
    }

    const invoiceYears = Array.from(invoiceYearSet).sort((a, b) => a - b);
    const collectionYears = Array.from(collectionYearSet).sort((a, b) => a - b);

    // فهرسة السنة ⇒ موضعها، فيصير ملء الخلايا وصولًا مباشرًا لا بحثًا خطّيًا.
    const rowIndex = new Map(invoiceYears.map((y, i) => [y, i]));
    const colIndex = new Map(collectionYears.map((y, i) => [y, i]));

    const cells = invoiceYears.map(() => new Array<number>(collectionYears.length).fill(0));
    const rowInvoiceValue = new Array<number>(invoiceYears.length).fill(0);
    const rowOutstanding = new Array<number>(invoiceYears.length).fill(0);

    for (const fact of this.facts) {
      const r = rowIndex.get(fact.invoiceYear)!;
      rowInvoiceValue[r] += fact.value;
      rowOutstanding[r] += fact.remaining;
      for (const [year, bucket] of fact.byCollectionYear) {
        cells[r][colIndex.get(year)!] += bucket.amount;
      }
    }

    const rowTotals = new Array<number>(invoiceYears.length).fill(0);
    const columnTotals = new Array<number>(collectionYears.length).fill(0);
    let grandTotal = 0;
    for (let r = 0; r < invoiceYears.length; r += 1) {
      for (let c = 0; c < collectionYears.length; c += 1) {
        const v = roundMoney(cells[r][c]);
        cells[r][c] = v;
        rowTotals[r] += v;
        columnTotals[c] += v;
        grandTotal += v;
      }
      rowTotals[r] = roundMoney(rowTotals[r]);
      rowInvoiceValue[r] = roundMoney(rowInvoiceValue[r]);
      rowOutstanding[r] = roundMoney(rowOutstanding[r]);
    }

    return {
      invoiceYears,
      collectionYears,
      cells,
      rowTotals,
      columnTotals: columnTotals.map(roundMoney),
      grandTotal: roundMoney(grandTotal),
      rowInvoiceValue,
      rowOutstanding,
    };
  }

  /* ── 5. تحليل الأرصدة القائمة ────────────────────────────────────────── */

  private buildOutstanding(): { rows: OutstandingRow[]; totals: OutstandingTotals } {
    interface Acc {
      outstanding: number;
      invoiceCount: number;
      weightedAge: number;
      oldestDate: Date | null;
      oldestNumber: string | null;
    }
    const byYear = new Map<number, Acc>();

    for (const fact of this.facts) {
      if (!(fact.remaining > SETTLED_TOLERANCE)) continue;
      let acc = byYear.get(fact.invoiceYear);
      if (!acc) {
        acc = { outstanding: 0, invoiceCount: 0, weightedAge: 0, oldestDate: null, oldestNumber: null };
        byYear.set(fact.invoiceYear, acc);
      }
      acc.outstanding += fact.remaining;
      acc.invoiceCount += 1;
      if (this.asOf) acc.weightedAge += fact.remaining * daysBetween(fact.invoice.issueDate, this.asOf);
      if (acc.oldestDate == null || fact.invoice.issueDate < acc.oldestDate) {
        acc.oldestDate = fact.invoice.issueDate;
        acc.oldestNumber = fact.invoice.invoiceNumber;
      }
    }

    const ordered = Array.from(byYear.entries()).sort((a, b) => a[0] - b[0]);
    const total = roundMoney(ordered.reduce((s, [, a]) => s + a.outstanding, 0));
    // توزيع «أكبر البواقي» — مجموع عمود النسبة = 100.0% بالضبط.
    const percents = apportionPercents(ordered.map(([, a]) => a.outstanding), total);

    const rows: OutstandingRow[] = ordered.map(([invoiceYear, a], i) => ({
      invoiceYear,
      outstanding: roundMoney(a.outstanding),
      percent: total > 0 ? percents[i] ?? 0 : null,
      invoiceCount: a.invoiceCount,
      oldestOutstandingDate: a.oldestDate ? toLocalDateString(a.oldestDate) : null,
      oldestOutstandingNumber: a.oldestNumber,
      averageAgeDays: this.asOf && a.outstanding > 0 ? Math.round(a.weightedAge / a.outstanding) : null,
    }));

    const totalWeightedAge = ordered.reduce((s, [, a]) => s + a.weightedAge, 0);
    const totalRaw = ordered.reduce((s, [, a]) => s + a.outstanding, 0);
    const oldest = rows.reduce<string | null>(
      (best, r) => (r.oldestOutstandingDate && (best == null || r.oldestOutstandingDate < best) ? r.oldestOutstandingDate : best),
      null,
    );

    return {
      rows,
      totals: {
        outstanding: total,
        invoiceCount: rows.reduce((s, r) => s + r.invoiceCount, 0),
        averageAgeDays: this.asOf && totalRaw > 0 ? Math.round(totalWeightedAge / totalRaw) : null,
        oldestOutstandingDate: oldest,
      },
    };
  }

  /* ── 6. أداء التحصيل حسب العميل / العقد / المشروع ─────────────────────── */

  private buildPerformance(): PerformanceSection {
    return {
      customer: this.groupBy('customer'),
      contract: this.groupBy('contract'),
      project: this.groupBy('project'),
    };
  }

  /**
   * تجميع مفهرَس على محور واحد.
   *
   * محور المشروع وحده يوزّع الفاتورة على أكثر من مجموعة (بحصص بنودها)؛ المحوران
   * الآخران علاقة فاتورة⇄عنصر واحدة، فتذهب كامل القيمة إلى مجموعة واحدة.
   */
  private groupBy(dimension: PerformanceDimension): PerformanceRow[] {
    interface Acc {
      id: number | null;
      name: string;
      invoiceCount: number;
      invoiced: number;
      collected: number;
      outstanding: number;
      weightedDays: number;
    }
    const groups = new Map<string, Acc>();

    const touch = (id: number | null, name: string): Acc => {
      const key = `${dimension}:${id ?? 0}`;
      let acc = groups.get(key);
      if (!acc) {
        acc = { id, name, invoiceCount: 0, invoiced: 0, collected: 0, outstanding: 0, weightedDays: 0 };
        groups.set(key, acc);
      }
      return acc;
    };

    for (const fact of this.facts) {
      if (dimension === 'project') {
        // تحت حصر مشروع، الوزن مطبَّق أصلًا على `fact` — فتبقى حصّة واحدة نسبتها 1.
        const shares = this.filters.projectId != null
          ? [{ projectId: this.filters.projectId, projectName: fact.projectName, ratio: 1 }]
          : fact.invoice.projectShares;
        for (const share of shares) {
          const acc = touch(share.projectId === 0 ? null : share.projectId, share.projectName);
          acc.invoiceCount += 1;
          acc.invoiced += fact.value * share.ratio;
          acc.collected += fact.collectedInScope * share.ratio;
          acc.outstanding += fact.remaining * share.ratio;
          acc.weightedDays += fact.weightedDays * share.ratio;
        }
        continue;
      }

      const acc = dimension === 'customer'
        ? touch(fact.invoice.customerId, fact.invoice.customerName ?? UNASSIGNED_LABEL)
        : touch(fact.invoice.contractId, fact.invoice.contractCode ?? UNASSIGNED_LABEL);
      acc.invoiceCount += 1;
      acc.invoiced += fact.value;
      acc.collected += fact.collectedInScope;
      acc.outstanding += fact.remaining;
      acc.weightedDays += fact.weightedDays;
    }

    return Array.from(groups.entries())
      .map(([key, a]) => {
        const invoiced = roundMoney(a.invoiced);
        const collected = roundMoney(a.collected);
        return {
          key,
          id: a.id,
          name: a.name,
          invoiceCount: a.invoiceCount,
          invoiced,
          collected,
          outstanding: roundMoney(a.outstanding),
          collectionRate: percentOf(collected, invoiced),
          averageDays: a.collected > 0 ? Math.round(a.weightedDays / a.collected) : null,
        };
      })
      .sort((a, b) => b.invoiced - a.invoiced || a.name.localeCompare(b.name, 'ar'));
  }

  /* ── 7. قوائم الاختيار ───────────────────────────────────────────────── */

  /**
   * قوائم الفلاتر تُشتقّ من **مجموعة البيانات كاملةً** لا من الصفوف المفلترة:
   * قائمة تنكمش كلما ضيّق المستخدم فلترًا تجعل التراجع مستحيلًا.
   */
  private buildFacets(): CollectionFacets {
    const invoiceYears = new Set<number>();
    const collectionYears = new Set<number>();
    const customers = new Map<number | null, string>();
    const contracts = new Map<number | null, string>();
    const projects = new Map<number, string>();

    for (const invoice of this.dataset.invoices) {
      invoiceYears.add(invoice.issueDate.getFullYear());
      for (const p of invoice.payments) collectionYears.add(p.date.getFullYear());
      if (!customers.has(invoice.customerId)) {
        customers.set(invoice.customerId, invoice.customerName ?? UNASSIGNED_LABEL);
      }
      if (!contracts.has(invoice.contractId)) {
        contracts.set(invoice.contractId, invoice.contractCode ?? UNASSIGNED_LABEL);
      }
      for (const share of invoice.projectShares) {
        if (!projects.has(share.projectId)) projects.set(share.projectId, share.projectName);
      }
    }

    const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name, 'ar');
    return {
      invoiceYears: Array.from(invoiceYears).sort((a, b) => b - a),
      collectionYears: Array.from(collectionYears).sort((a, b) => b - a),
      customers: Array.from(customers, ([id, name]) => ({ id, name })).sort(byName),
      contracts: Array.from(contracts, ([id, name]) => ({ id, name })).sort(byName),
      projects: Array.from(projects, ([id, name]) => ({ id, name })).sort(byName),
    };
  }

  /* ── التقرير الكامل ──────────────────────────────────────────────────── */

  report(): CollectionAnalysisReport {
    return {
      period: this.period,
      filters: this.filters,
      kpis: this.buildKpis(),
      summary: this.buildSummary(),
      transfer: this.buildTransfer(),
      matrix: this.buildMatrix(),
      outstanding: this.buildOutstanding(),
      performance: this.buildPerformance(),
      facets: this.buildFacets(),
    };
  }

  /* ── التنقّل التفصيلي ────────────────────────────────────────────────── */

  /**
   * فواتير الخليّة المضغوط عليها مع خطّ زمن تحصيلاتها.
   *
   * يعمل على **نفس الحقائق** التي بُنيت منها الجداول، فيستحيل أن يختلف مجموع
   * النافذة عن الرقم الذي فُتحت منه.
   */
  drilldown(scope: DrilldownScope = {}, limit = COLLECTION_DRILLDOWN_LIMIT): CollectionDrilldownResult {
    const matched = this.facts.filter((fact) => {
      if (scope.scopeInvoiceYear != null && fact.invoiceYear !== scope.scopeInvoiceYear) return false;
      if (scope.scopeCollectionYear != null && !fact.byCollectionYear.has(scope.scopeCollectionYear)) return false;
      if (scope.dimension != null && scope.dimensionId != null) {
        if (!this.factInDimension(fact, scope.dimension, scope.dimensionId)) return false;
      }
      return true;
    });

    const totals = matched.reduce(
      (acc, f) => {
        acc.invoiced += f.value;
        acc.collected += f.collectedInScope;
        acc.outstanding += f.remaining;
        return acc;
      },
      { invoiced: 0, collected: 0, outstanding: 0 },
    );

    // الأحدث أولًا — نفس عرف بقيّة نوافذ التفصيل في النظام.
    const ordered = [...matched].sort(
      (a, b) => b.invoice.issueDate.getTime() - a.invoice.issueDate.getTime() || b.invoice.id - a.invoice.id,
    );

    return {
      rows: ordered.slice(0, limit).map((fact) => this.toDrilldownInvoice(fact, scope)),
      count: matched.length,
      truncated: matched.length > limit,
      totals: {
        invoiced: roundMoney(totals.invoiced),
        collected: roundMoney(totals.collected),
        outstanding: roundMoney(totals.outstanding),
      },
    };
  }

  private factInDimension(fact: InvoiceFact, dimension: PerformanceDimension, id: number): boolean {
    if (dimension === 'customer') return (fact.invoice.customerId ?? 0) === id;
    if (dimension === 'contract') return (fact.invoice.contractId ?? 0) === id;
    return fact.invoice.projectShares.some((s) => s.projectId === id);
  }

  private toDrilldownInvoice(fact: InvoiceFact, scope: DrilldownScope): DrilldownInvoice {
    // الرصيد التراكمي يُحسب على **كل** دفعات الفاتورة بترتيب التاريخ: خطّ زمن
    // يقفز فوق دفعة خارج النطاق كان سيعرض رصيدًا لا يطابق الواقع.
    const chronological = [...fact.invoice.payments].sort(
      (a, b) => a.date.getTime() - b.date.getTime() || a.id - b.id,
    );
    const remainingAfterById = new Map<number, number>();
    let running = fact.value;
    for (const p of chronological) {
      running = roundMoney(running - p.amount * fact.weight);
      remainingAfterById.set(p.id, running);
    }

    const visible = scope.scopeCollectionYear != null
      ? fact.scopedPayments.filter((p) => p.date.getFullYear() === scope.scopeCollectionYear)
      : fact.scopedPayments;

    const payments: DrilldownPayment[] = [...visible]
      .sort((a, b) => a.date.getTime() - b.date.getTime() || a.id - b.id)
      .map((p) => ({
        id: p.id,
        date: toLocalDateString(p.date),
        collectionYear: p.date.getFullYear(),
        amount: roundMoney(p.amount * fact.weight),
        method: p.method,
        reference: p.reference,
        daysToCollect: daysBetween(fact.invoice.issueDate, p.date),
        remainingAfter: remainingAfterById.get(p.id) ?? fact.remaining,
      }));

    return {
      invoiceId: fact.invoice.id,
      invoiceNumber: fact.invoice.invoiceNumber,
      issueDate: toLocalDateString(fact.invoice.issueDate),
      dueDate: fact.invoice.dueDate ? toLocalDateString(fact.invoice.dueDate) : null,
      invoiceYear: fact.invoiceYear,
      total: fact.value,
      customerName: fact.invoice.customerName ?? UNASSIGNED_LABEL,
      contractCode: fact.invoice.contractCode,
      projectName: fact.projectName,
      collectedInScope: fact.collectedInScope,
      collectedTotal: fact.collectedTotal,
      remaining: fact.remaining,
      status: fact.status,
      overdue: fact.overdue,
      averageDaysToCollect: fact.collectedInScope > 0 ? Math.round(fact.weightedDays / fact.collectedInScope) : null,
      payments,
    };
  }
}

/* ── مساعدات على مستوى الوحدة ───────────────────────────────────────────── */

/** حالة السداد المشتقّة من المبالغ — لا من `Invoice.status` القابل للانحراف. */
export function settlementOf(total: number, collected: number): SettlementStatus {
  if (total - collected <= SETTLED_TOLERANCE) return 'PAID';
  if (collected > SETTLED_TOLERANCE) return 'PARTIAL';
  return 'UNPAID';
}

/** البحث يغطّي كل ما تعرضه الجداول: رقم الفاتورة، العميل، العقد، المشروع، المرجع. */
function matchesSearch(invoice: DatasetInvoice, projectName: string, term: string): boolean {
  const haystack = [
    invoice.invoiceNumber,
    invoice.customerName ?? '',
    invoice.contractCode ?? '',
    projectName,
    ...invoice.payments.map((p) => p.reference ?? ''),
  ];
  return haystack.some((value) => value && normalizeArabic(value).includes(term));
}
