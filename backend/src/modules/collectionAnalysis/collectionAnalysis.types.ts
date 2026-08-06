/* ════════════════════════════════════════════════════════════════════════════
   Collection Analysis Engine — عقد البيانات.

   محرّك **مستقل تمامًا** عن `financialAnalysis`: لا يستورد منه ولا يعدّله ولا
   يشاركه نوعًا واحدًا. سؤاله مختلف: مركز التحليل المالي يسأل «كم حُصِّل داخل
   الفترة؟»، وهذا يسأل «فواتير أي سنة حُصِّلت في أي سنة؟» — علاقة بين سنتين
   ماليتين لا رقم داخل فترة.

   ما يشتركان فيه هو **قاعدة العمل** لا الكود: كلاهما يعرّف فاتورة المبيعات
   الفعّالة والتحصيل عبر `shared/services/operational.reporting` نفسها، فتبقى
   الأرقام متطابقة بلا نسخ منطق.

   السنة المالية في هذا النظام = السنة الميلادية (لا سنة مالية مزاحة) — انظر
   `shared/services/historicalEntry.service.ts`. لذلك «سنة الفاتورة» هي سنة
   `issueDate` و«سنة التحصيل» هي سنة `Payment.date`، بلا أي إزاحة ولا إعداد.
   ════════════════════════════════════════════════════════════════════════════ */

/** حالة السداد المشتقّة من المبالغ — لا تعتمد على `Invoice.status` المخزَّن. */
export type SettlementStatus = 'PAID' | 'PARTIAL' | 'UNPAID';

/** محاور تجميع «أداء التحصيل» (الجدول الخامس). */
export type PerformanceDimension = 'customer' | 'contract' | 'project';

/* ── المدخلات ───────────────────────────────────────────────────────────── */

/**
 * فلاتر الصفحة كما تصل إلى المحرّك.
 *
 * ينقسم تطبيقها بين طبقتين، وكلٌّ يطبّق ما يخصّه **مرّة واحدة فقط**:
 *   • طبقة البيانات (SQL): `invoiceFrom/To`, `customerId`, `contractId` —
 *     حقول مفهرسة تُضيّق الحِمل قبل أن يصل إلى الذاكرة.
 *   • المحرّك (نقيّ): كل ما تبقّى — سنوات مالية، نطاق التحصيل، المشروع، حالة
 *     السداد، نطاق التحصيل داخل/خارج السنة، والبحث.
 */
export interface CollectionFilters {
  /** نطاق تاريخ إصدار الفاتورة (`YYYY-MM-DD`). */
  invoiceFrom?: string;
  invoiceTo?: string;
  /** نطاق تاريخ التحصيل (`YYYY-MM-DD`) — يحدّ الدفعات المحتسَبة كتحصيل. */
  collectionFrom?: string;
  collectionTo?: string;
  /** السنة المالية لإصدار الفاتورة. */
  invoiceYear?: number;
  /** السنة المالية للتحصيل. */
  collectionYear?: number;
  customerId?: number;
  contractId?: number;
  /** اتفاقية سعر المشروع (`ProjectPrice.id`)؛ `0` = غير محدّد. */
  projectId?: number;
  /** حالة سداد الفاتورة المشتقّة. */
  settlement?: SettlementStatus;
  /** الفواتير المتأخرة فقط (تجاوزت تاريخ الاستحقاق ولها رصيد قائم). */
  overdueOnly?: boolean;
  /** الفواتير ذات الرصيد القائم فقط. */
  outstandingOnly?: boolean;
  /** حصر التحصيلات المحتسَبة: داخل سنة الفاتورة، أو خارجها، أو الكل. */
  collectionScope?: 'all' | 'same-year' | 'other-years';
  /** بحث نصّي: رقم الفاتورة / العميل / العقد / المشروع / مرجع الدفعة. */
  search?: string;
}

/* ── مجموعة البيانات الخام ──────────────────────────────────────────────── */

export interface DatasetPayment {
  id: number;
  invoiceId: number;
  /** تاريخ التحصيل الرسمي (`Payment.date`) — منتصف ليل محلي. */
  date: Date;
  amount: number;
  method: string;
  reference: string | null;
}

export interface DatasetInvoice {
  id: number;
  invoiceNumber: string;
  issueDate: Date;
  dueDate: Date | null;
  total: number;
  customerId: number | null;
  customerName: string | null;
  contractId: number | null;
  contractCode: string | null;
  /**
   * توزيع الفاتورة على المشاريع بنسبة قيمة بنودها.
   *
   * المشروع في هذا النظام هو **اتفاقية سعر** (`ProjectPrice`: مصنع + موقع عقد)،
   * ولا يرتبط بالفاتورة مباشرةً بل ببنودها. لذلك تُوزَّع قيمة الفاتورة — ومعها
   * تحصيلاتها — على مشاريعها بالتناسب مع قيم البنود. فاتورة بلا بنود مسعَّرة
   * تذهب كاملةً إلى «غير محدّد» (`projectId = 0`).
   */
  projectShares: ProjectShare[];
  payments: DatasetPayment[];
}

export interface ProjectShare {
  /** `ProjectPrice.id`، أو `0` لبند بلا اتفاقية سعر. */
  projectId: number;
  projectName: string;
  /** الحصّة من قيمة الفاتورة (0…1). مجموع الحصص لكل فاتورة = 1 بالضبط. */
  ratio: number;
}

export interface CollectionDataset {
  invoices: DatasetInvoice[];
  /** أقصى تاريخ ظاهر في البيانات — بديل `asOf` عند المدى المفتوح. */
  latestActivity: Date | null;
}

/* ── المخرجات ───────────────────────────────────────────────────────────── */

export interface CollectionPeriod {
  invoiceFrom: string | null;
  invoiceTo: string | null;
  collectionFrom: string | null;
  collectionTo: string | null;
  /** تاريخ احتساب الأعمار والتأخّر — نهاية النطاق، أو أحدث حركة. */
  asOf: string | null;
}

export interface CollectionKpis {
  totalInvoiceValue: number;
  totalCollected: number;
  collectionRate: number | null;
  collectedSameYear: number;
  collectedOtherYears: number;
  outstanding: number;
  /** متوسط أيام التحصيل، مرجَّح بالمبلغ المحصَّل. */
  averageCollectionDays: number | null;
  /** سنة التحصيل التي استقبلت أكبر مبلغ مُرحَّل من سنوات إصدار أخرى. */
  largestDeferredYear: number | null;
  largestDeferredAmount: number;
  invoiceCount: number;
  collectionCount: number;
}

export interface CollectionSummaryRow {
  invoiceYear: number;
  invoiceValue: number;
  collectedSameYear: number;
  collectedOtherYears: number;
  outstanding: number;
  collectionRate: number | null;
  averageDays: number | null;
  /** المؤجَّل عن سنته = قيمة الفواتير − المحصَّل داخل سنتها. */
  variance: number;
  invoiceCount: number;
}

export interface CollectionSummaryTotals {
  invoiceValue: number;
  collectedSameYear: number;
  collectedOtherYears: number;
  outstanding: number;
  collectionRate: number | null;
  averageDays: number | null;
  variance: number;
  invoiceCount: number;
}

export interface CollectionTransferRow {
  invoiceYear: number;
  collectionYear: number;
  amount: number;
  /** نسبة المبلغ من إجمالي ما حُصِّل عن فواتير تلك السنة. */
  percent: number | null;
  invoiceCount: number;
  paymentCount: number;
}

/**
 * مصفوفة انتقال التحصيل — صفوف = سنة الفاتورة، أعمدة = سنة التحصيل.
 *
 * المحوران **ديناميكيان بالكامل**: يُشتقّان من البيانات، بلا أي سنة مكتوبة في
 * الكود ولا حدّ أعلى لعددها.
 */
export interface CollectionMatrix {
  invoiceYears: number[];
  collectionYears: number[];
  /** `cells[i][j]` = المحصَّل من فواتير `invoiceYears[i]` في `collectionYears[j]`. */
  cells: number[][];
  rowTotals: number[];
  columnTotals: number[];
  grandTotal: number;
  /** قيمة فواتير كل سنة صفّ — عمود مرجعي بجانب المصفوفة. */
  rowInvoiceValue: number[];
  /** الرصيد القائم لكل سنة صفّ. */
  rowOutstanding: number[];
}

export interface OutstandingRow {
  invoiceYear: number;
  outstanding: number;
  /** نسبة الرصيد من إجمالي الأرصدة القائمة. */
  percent: number | null;
  invoiceCount: number;
  oldestOutstandingDate: string | null;
  oldestOutstandingNumber: string | null;
  /** متوسط عمر الرصيد بالأيام، مرجَّح بالمبلغ. */
  averageAgeDays: number | null;
}

export interface OutstandingTotals {
  outstanding: number;
  invoiceCount: number;
  averageAgeDays: number | null;
  oldestOutstandingDate: string | null;
}

export interface PerformanceRow {
  /** مفتاح صفّ مستقرّ: `<dimension>:<id>`. */
  key: string;
  id: number | null;
  name: string;
  invoiceCount: number;
  invoiced: number;
  collected: number;
  outstanding: number;
  collectionRate: number | null;
  averageDays: number | null;
}

export interface PerformanceSection {
  customer: PerformanceRow[];
  contract: PerformanceRow[];
  project: PerformanceRow[];
}

/** قوائم الاختيار المشتقّة من البيانات — تملأ الفلاتر بلا استعلام إضافي. */
export interface CollectionFacets {
  invoiceYears: number[];
  collectionYears: number[];
  customers: { id: number | null; name: string }[];
  contracts: { id: number | null; name: string }[];
  projects: { id: number; name: string }[];
}

export interface CollectionAnalysisReport {
  period: CollectionPeriod;
  filters: CollectionFilters;
  kpis: CollectionKpis;
  summary: { rows: CollectionSummaryRow[]; totals: CollectionSummaryTotals };
  transfer: CollectionTransferRow[];
  matrix: CollectionMatrix;
  outstanding: { rows: OutstandingRow[]; totals: OutstandingTotals };
  performance: PerformanceSection;
  facets: CollectionFacets;
}

/* ── التنقّل التفصيلي ────────────────────────────────────────────────────── */

export interface DrilldownPayment {
  id: number;
  date: string;
  collectionYear: number;
  amount: number;
  method: string;
  reference: string | null;
  /** أيام من إصدار الفاتورة حتى هذه الدفعة. */
  daysToCollect: number;
  /** الرصيد المتبقي بعد هذه الدفعة (تراكمي بترتيب التاريخ). */
  remainingAfter: number;
}

export interface DrilldownInvoice {
  invoiceId: number;
  invoiceNumber: string;
  issueDate: string;
  dueDate: string | null;
  invoiceYear: number;
  total: number;
  customerName: string;
  contractCode: string | null;
  projectName: string;
  /** المحصَّل ضمن نطاق التحصيل المختار. */
  collectedInScope: number;
  /** المحصَّل الكلي للفاتورة (بلا نطاق) — أساس الرصيد الحقيقي. */
  collectedTotal: number;
  remaining: number;
  status: SettlementStatus;
  overdue: boolean;
  averageDaysToCollect: number | null;
  payments: DrilldownPayment[];
}

export interface CollectionDrilldownResult {
  rows: DrilldownInvoice[];
  count: number;
  truncated: boolean;
  totals: { invoiced: number; collected: number; outstanding: number };
}

/** حصر إضافي فوق فلاتر الصفحة، يصف الخليّة التي فُتح منها التفصيل. */
export interface DrilldownScope {
  /** سنة إصدار (صفّ الملخص/الأرصدة/المصفوفة). */
  scopeInvoiceYear?: number;
  /** سنة تحصيل (عمود المصفوفة / صفّ جدول الترحيل). */
  scopeCollectionYear?: number;
  dimension?: PerformanceDimension;
  /** معرّف عنصر المحور؛ `0` = «غير محدّد». */
  dimensionId?: number;
}
